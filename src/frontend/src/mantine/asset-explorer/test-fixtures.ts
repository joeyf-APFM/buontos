/** A fake backend for the Asset Explorer tests: routes `fetch` by URL. */
import { vi } from 'vitest';
import type { AssetSummary } from './api';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const node = (key: string, label: string, kind: string, count: number, hasChildren: boolean, extra = {}) => ({
  key, label, kind, count, has_children: hasChildren, ...extra,
});

const asset = (id: string, label: string, type: string, count: number, hasChildren: boolean) =>
  node(`asset:${id}`, label, 'asset', count, hasChildren, { asset_id: id, asset_type_name: type });

/**
 * The tree as the API serves it: Unity Catalog is catalog → schema → table /
 * view / metric view / volume → column, with names stored fully qualified
 * (columns may be short).
 */
export const TREE: Record<string, unknown[]> = {
  '': [
    node('branch:uc', 'Unity Catalog', 'branch', 12, true),
    node('branch:internal', 'Internal', 'branch', 0, false),
    node('branch:external', 'External', 'branch', 3, true),
    node('branch:unsorted', 'Unsorted', 'branch', 9, false),
  ],
  'branch:uc': [asset('cat1', 'insights', 'Catalog', 12, true)],
  'asset:cat1': [
    asset('sch1', 'insights.referrals', 'Schema', 2, true),
    asset('sch2', 'insights.empty_schema', 'Schema', 0, false),
  ],
  'asset:sch1': [
    asset('t1', 'insights.referrals.leads', 'Table', 2, true),
    asset('v1', 'insights.referrals.referrals_daily', 'View', 0, false),
    asset('mv1', 'insights.referrals.referral_kpis', 'Metric View', 0, false),
    asset('vol1', 'insights.referrals.raw_exports', 'Volume', 0, false),
  ],
  'asset:t1': [
    asset('col1', 'insights.referrals.leads.lead_id', 'Column', 1, false),
    asset('col2', 'event_ts', 'Column', 1, false),
  ],
  'branch:external': [],
  'category:analytics': [node('type:Dashboard', 'Dashboards', 'type', 4, false, { asset_type_name: 'Dashboard' })],
  'category:integration': [],
  'category:system': [node('type:System', 'System', 'type', 2, false, { asset_type_name: 'System' })],
  'category:custom': [],
};

export const summary = (over: Partial<AssetSummary> & { id: string; name: string }): AssetSummary => ({
  asset_type_id: 't-table',
  asset_type_name: 'Table',
  location: `insights.referrals.${over.name}`,
  status: 'active',
  data_branch: 'uc',
  domains: [{ domain_id: 'd1', domain_name: 'Referrals', is_primary: true }],
  primary_domain_id: 'd1',
  updated_at: new Date().toISOString(),
  owner_display: 'data-eng',
  owner_extra_count: 0,
  concepts: ['Lead'],
  column_count: 24,
  description: 'One row per inbound family lead.',
  ...over,
});

export const LEADS = summary({ id: 'a1', name: 'leads', owner_extra_count: 2 });
export const LEAD_EVENTS = summary({ id: 'a2', name: 'lead_events', status: 'draft', concepts: ['Event', 'Lead'] });

export const LEAD_ID = summary({
  id: 'col1', name: 'insights.referrals.leads.lead_id', asset_type_name: 'Column',
  location: 'insights.referrals.leads.lead_id', concepts: ['Lead'], column_count: null,
  data_type: 'bigint', nullable: false, description: 'The lead’s id, unique across every lead source we ingest.',
});

export const EVENT_TS = summary({
  id: 'col2', name: 'event_ts', asset_type_name: 'Column',
  location: 'insights.referrals.leads.event_ts', concepts: [], column_count: null,
  data_type: 'timestamp', nullable: true, description: null,
});

// The rows behind the tree's nodes, for nested rows and sub-grids
export const SCHEMA_REFERRALS = summary({
  id: 'sch1', name: 'insights.referrals', asset_type_name: 'Schema', location: 'insights.referrals', column_count: null,
});
export const T_LEADS = summary({ id: 't1', name: 'insights.referrals.leads', location: 'insights.referrals.leads' });
export const V_DAILY = summary({
  id: 'v1', name: 'insights.referrals.referrals_daily', asset_type_name: 'View', location: 'insights.referrals.referrals_daily',
});
export const MV_KPIS = summary({
  id: 'mv1', name: 'insights.referrals.referral_kpis', asset_type_name: 'Metric View', location: 'insights.referrals.referral_kpis',
});
export const VOL_RAW = summary({
  id: 'vol1', name: 'insights.referrals.raw_exports', asset_type_name: 'Volume', location: 'insights.referrals.raw_exports',
});

export const ASSETS: Record<string, AssetSummary[]> = {
  'branch:uc': [LEADS, LEAD_EVENTS],
  'asset:cat1': [SCHEMA_REFERRALS, LEADS, LEAD_EVENTS],
  'asset:sch1': [LEADS, LEAD_EVENTS],
  'asset:t1': [T_LEADS, LEAD_ID, EVENT_TS],
  'asset:sch2': [],
  'asset:col1': [LEAD_ID],
  'asset:col2': [EVENT_TS],
};

/**
 * A node's listing when asked for some types only (nested rows ask for their
 * children's types): the node itself and what is under it.
 */
export const BY_TYPE: Record<string, AssetSummary[]> = {
  'asset:sch1': [SCHEMA_REFERRALS, T_LEADS, V_DAILY, MV_KPIS, VOL_RAW],
};

export const CONCEPTS = [
  { value: 'http://ontos.app/apfm#Lead', label: 'Lead', type: 'class' },
  { value: 'http://ontos.app/apfm#Event', label: 'Event', type: 'class' },
];

export type Handler = (url: URL) => Response | undefined;

/** Stubs `fetch` with the fake backend; `override` answers first when it returns a response. */
export function mockBackend(override?: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const custom = override?.(url);
    if (custom) return custom;
    if (url.pathname === '/api/assets/tree') {
      const children = TREE[url.searchParams.get('parent') ?? ''];
      return children ? json(children) : json({ detail: 'bad key' }, 400);
    }
    if (url.pathname === '/api/semantic-models/concepts') {
      return json(CONCEPTS.filter((c) => c.label.toLowerCase().includes((url.searchParams.get('q') ?? '').toLowerCase())));
    }
    if (url.pathname === '/api/assets' && url.searchParams.get('concept_iri')) {
      // The server's total counts every page, not only this one
      return json({ items: [LEADS], total: 37, skip: 0, limit: 50 });
    }
    if (url.pathname === '/api/assets' && url.searchParams.get('asset_type_names')) {
      const node = url.searchParams.get('node') ?? '';
      const types = url.searchParams.get('asset_type_names')!.split(',');
      const items = (BY_TYPE[node] ?? ASSETS[node] ?? []).filter((a) => types.includes(a.asset_type_name ?? ''));
      return json({ items, total: items.length, skip: 0, limit: 50 });
    }
    if (url.pathname === '/api/assets') {
      const items = (ASSETS[url.searchParams.get('node') ?? ''] ?? []).filter(
        (a) => !url.searchParams.get('name') || a.name.includes(url.searchParams.get('name')!),
      );
      return json({ items, total: items.length, skip: 0, limit: 50 });
    }
    if (url.pathname.startsWith('/api/assets/')) {
      const id = url.pathname.split('/').pop();
      const known = [...Object.values(ASSETS), ...Object.values(BY_TYPE)].flat().find((a) => a.id === id);
      return json({ id, name: 'x', status: 'active', ...known, relationships: [], created_at: '2026-11-01T00:00:00Z' });
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The URLs `fetch` was called with, parsed. */
export const calledUrls = (fetchMock: ReturnType<typeof mockBackend>) =>
  fetchMock.mock.calls.map(([input]) => new URL(String(input), 'http://localhost'));

export const treeCalls = (fetchMock: ReturnType<typeof mockBackend>, parent: string | null) =>
  calledUrls(fetchMock).filter(
    (u) => u.pathname === '/api/assets/tree' && u.searchParams.get('parent') === parent,
  ).length;
