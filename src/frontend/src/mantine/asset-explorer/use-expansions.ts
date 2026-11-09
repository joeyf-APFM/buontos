/**
 * The grid's open rows: a row's direct children, nested under it, or a
 * table's columns, in a sub-grid. Both come from the row's direct-children
 * listing (`/api/assets?parent=asset:<id>`), paged 50 at a time.
 *
 * Each request carries a fresh generation, and an answer lands only on the
 * record that asked for it; the records reset whenever the grid's scope
 * (tree selection, filters, page) changes, so answers from a collapsed,
 * re-opened or earlier scope never land.
 */
import { useCallback, useRef, useState } from 'react';
import { fetchAssets, type AssetSummary } from './api';

export const NEST_PAGE = 50;

/** Rows whose children are columns open into a sub-grid; other rows with children nest. */
const COLUMN_PARENTS = new Set(['Table', 'View', 'Metric View']);

export type ExpansionKind = 'children' | 'columns';

export const expansionKind = (a: AssetSummary): ExpansionKind | null =>
  a.has_children ? (COLUMN_PARENTS.has(a.asset_type_name ?? '') ? 'columns' : 'children') : null;

export interface Expansion {
  kind: ExpansionKind;
  parent: AssetSummary;
  gen: number;
  items: AssetSummary[];
  /** The listing's total (null until the first answer). */
  total: number | null;
  status: 'loading' | 'ready' | 'error' | 'loadingMore' | 'moreError';
  error?: string;
}

export const hasMore = (e: Expansion) => e.total !== null && e.items.length < e.total;
export const leftCount = (e: Expansion) => (e.total ?? 0) - e.items.length;

interface State {
  scope: string;
  map: Record<string, Expansion>;
}

const NONE: Record<string, Expansion> = {};

/** Open rows by row path (a row can show up at more than one place). */
export function useExpansions(scope: string) {
  const [state, setState] = useState<State>({ scope, map: NONE });
  const generation = useRef(0);
  // A new scope (even one seen before) starts with every row closed
  if (state.scope !== scope) setState({ scope, map: NONE });
  const expansions = state.scope === scope ? state.map : NONE;

  /** Applies `change` only if the record at `key` is still the one generation `gen` made. */
  const settle = useCallback((key: string, gen: number, change: (e: Expansion) => Expansion) => {
    setState((s) => {
      const e = s.map[key];
      if (!e || e.gen !== gen) return s;
      return { scope: s.scope, map: { ...s.map, [key]: change(e) } };
    });
  }, []);

  const load = useCallback(
    (key: string, parent: AssetSummary, kind: ExpansionKind, skip: number) => {
      const gen = ++generation.current;
      setState((s) => {
        if (s.scope !== scope) return s;
        const prev = s.map[key];
        const next: Expansion =
          skip === 0 || !prev
            ? { kind, parent, gen, items: [], total: null, status: 'loading' }
            : { ...prev, gen, status: 'loadingMore', error: undefined };
        return { scope, map: { ...s.map, [key]: next } };
      });
      fetchAssets({ parent: `asset:${parent.id}`, skip, limit: NEST_PAGE })
        .then((page) =>
          settle(key, gen, (e) => {
            const known = new Set(e.items.map((a) => a.id));
            const items = [...e.items, ...page.items.filter((a) => !known.has(a.id))];
            return { ...e, items, total: page.total, status: 'ready', error: undefined };
          }),
        )
        .catch((err: Error) =>
          settle(key, gen, (e) => ({ ...e, status: skip === 0 ? 'error' : 'moreError', error: err.message })),
        );
    },
    [scope, settle],
  );

  const toggle = useCallback(
    (key: string, parent: AssetSummary, kind: ExpansionKind) => {
      if (expansions[key]) {
        setState((s) => {
          if (s.scope !== scope) return s;
          const rest = { ...s.map };
          // Close the row and everything opened under it
          Object.keys(rest).forEach((k) => (k === key || k.startsWith(`${key}/`)) && delete rest[k]);
          return { scope, map: rest };
        });
      } else load(key, parent, kind, 0);
    },
    [expansions, load, scope],
  );

  const more = useCallback(
    (key: string) => {
      const e = expansions[key];
      if (e && (e.status === 'ready' || e.status === 'moreError') && hasMore(e)) load(key, e.parent, e.kind, e.items.length);
    },
    [expansions, load],
  );

  const retry = useCallback(
    (key: string) => {
      const e = expansions[key];
      if (e?.status === 'error') load(key, e.parent, e.kind, 0);
      else if (e?.status === 'moreError') load(key, e.parent, e.kind, e.items.length);
    },
    [expansions, load],
  );

  return { expansions, toggle, more, retry };
}
