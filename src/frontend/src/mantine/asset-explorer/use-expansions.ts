/**
 * The grid's open rows: a container's child rows, or a table's columns.
 *
 * Child rows: the tree call (`/api/assets/tree?parent=asset:<id>`) says which
 * assets are the row's direct children; their summaries come from the row's
 * listing (`/api/assets?node=asset:<id>`) narrowed to the children's types,
 * keeping only those ids. A catalog's listing holds everything under it, but
 * only its schemas have the Schema type, so the narrowed listing pages
 * through the direct children (and, at worst, a few deeper assets of the
 * same type, which are dropped).
 *
 * Columns: the table's listing, minus the table itself.
 *
 * Each expansion has a generation; an answer lands only on the expansion
 * that asked for it, and only while the grid's scope (node, filters, page)
 * is the one it was asked in.
 */
import { useCallback, useRef, useState } from 'react';
import { fetchAssets, fetchTreeChildren, type AssetSummary } from './api';

export const NEST_PAGE = 50;

/** Rows that open into child rows, and rows that open into a column sub-grid. */
const NESTING_TYPES = new Set(['Catalog', 'Schema', 'System']);
const COLUMN_TYPES = new Set(['Table', 'View', 'Metric View']);

export type ExpansionKind = 'children' | 'columns';

export const expansionKind = (a: AssetSummary): ExpansionKind | null =>
  COLUMN_TYPES.has(a.asset_type_name ?? '') ? 'columns' : NESTING_TYPES.has(a.asset_type_name ?? '') ? 'children' : null;

export interface Expansion {
  kind: ExpansionKind;
  parent: AssetSummary;
  gen: number;
  items: AssetSummary[];
  /** How many rows there are in all (null until the first answer). */
  total: number | null;
  /** The next listing offset, and how long the listing is. */
  skip: number;
  listTotal: number;
  /** Child rows only: the direct children's ids and types. */
  childIds: string[];
  types: string[];
  status: 'loading' | 'ready' | 'error' | 'loadingMore' | 'moreError';
  error?: string;
}

export const hasMore = (e: Expansion) => e.total !== null && e.skip < e.listTotal && e.items.length < e.total;
export const leftCount = (e: Expansion) => (e.total ?? 0) - e.items.length;

interface State {
  scope: string;
  map: Record<string, Expansion>;
}

const NONE: Record<string, Expansion> = {};

type Page = Pick<Expansion, 'items' | 'total' | 'skip' | 'listTotal' | 'childIds' | 'types'>;

async function firstPage(kind: ExpansionKind, parent: AssetSummary): Promise<Page> {
  const node = `asset:${parent.id}`;
  if (kind === 'columns') {
    const page = await fetchAssets({ node, skip: 0, limit: NEST_PAGE });
    const items = page.items.filter((a) => a.id !== parent.id);
    // The listing holds the table itself
    return { items, total: Math.max(page.total - 1, 0), skip: NEST_PAGE, listTotal: page.total, childIds: [], types: [] };
  }
  const children = (await fetchTreeChildren(node)).filter(
    (n) => n.assetId && n.assetId !== parent.id && n.assetTypeName !== 'Column',
  );
  const childIds = children.map((n) => n.assetId!);
  const types = [...new Set(children.map((n) => n.assetTypeName).filter((t): t is string => !!t))];
  if (!childIds.length) return { items: [], total: 0, skip: 0, listTotal: 0, childIds, types };
  const page = await fetchAssets({ node, types, skip: 0, limit: NEST_PAGE });
  const ids = new Set(childIds);
  return { items: page.items.filter((a) => ids.has(a.id)), total: childIds.length, skip: NEST_PAGE, listTotal: page.total, childIds, types };
}

async function nextPage(e: Expansion): Promise<Pick<Expansion, 'items' | 'skip' | 'listTotal'>> {
  const node = `asset:${e.parent.id}`;
  const page = await fetchAssets({ node, types: e.kind === 'children' ? e.types : undefined, skip: e.skip, limit: NEST_PAGE });
  const ids = new Set(e.childIds);
  const fresh = page.items.filter((a) => (e.kind === 'columns' ? a.id !== e.parent.id : ids.has(a.id)));
  const known = new Set(e.items.map((a) => a.id));
  return { items: [...e.items, ...fresh.filter((a) => !known.has(a.id))], skip: e.skip + NEST_PAGE, listTotal: page.total };
}

/** Open rows by row path (a row can show up at more than one place), reset when `scope` changes. */
export function useExpansions(scope: string) {
  const [state, setState] = useState<State>({ scope, map: NONE });
  const generation = useRef(0);
  const expansions = state.scope === scope ? state.map : NONE;

  /** Applies `change` to the expansion at `key` only if it is still generation `gen` in `scope`. */
  const settle = useCallback((key: string, gen: number, inScope: string, change: (e: Expansion) => Expansion) => {
    setState((s) => {
      const e = s.scope === inScope ? s.map[key] : undefined;
      if (!e || e.gen !== gen) return s;
      return { scope: s.scope, map: { ...s.map, [key]: change(e) } };
    });
  }, []);

  const begin = useCallback(
    (key: string, make: (prev: Expansion | undefined, gen: number) => Expansion) => {
      const gen = ++generation.current;
      setState((s) => {
        const map = s.scope === scope ? s.map : NONE;
        return { scope, map: { ...map, [key]: make(map[key], gen) } };
      });
      return gen;
    },
    [scope],
  );

  const open = useCallback(
    (key: string, parent: AssetSummary, kind: ExpansionKind) => {
      const gen = begin(key, (_prev, g) => ({
        kind, parent, gen: g, items: [], total: null, skip: 0, listTotal: 0, childIds: [], types: [], status: 'loading',
      }));
      firstPage(kind, parent)
        .then((page) => settle(key, gen, scope, (e) => ({ ...e, ...page, status: 'ready', error: undefined })))
        .catch((err: Error) => settle(key, gen, scope, (e) => ({ ...e, status: 'error', error: err.message })));
    },
    [begin, settle, scope],
  );

  const more = useCallback(
    (key: string) => {
      const current = expansions[key];
      if (!current || (current.status !== 'ready' && current.status !== 'moreError')) return;
      const gen = begin(key, (prev, g) => ({ ...(prev ?? current), gen: g, status: 'loadingMore', error: undefined }));
      nextPage(current)
        .then((page) => settle(key, gen, scope, (e) => ({ ...e, ...page, status: 'ready' })))
        .catch((err: Error) => settle(key, gen, scope, (e) => ({ ...e, status: 'moreError', error: err.message })));
    },
    [expansions, begin, settle, scope],
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
      } else open(key, parent, kind);
    },
    [expansions, open, scope],
  );

  const retry = useCallback(
    (key: string) => {
      const e = expansions[key];
      if (e?.status === 'error') open(key, e.parent, e.kind);
      else if (e?.status === 'moreError') more(key);
    },
    [expansions, open, more],
  );

  return { expansions, toggle, more, retry };
}
