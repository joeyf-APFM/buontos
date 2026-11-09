/** A fake backend for the Asset Explorer tests: routes `fetch` by URL. */
import { vi } from 'vitest';
import type { AssetSummary } from './api';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const node = (key: string, label: string, kind: string, count: number, hasChildren: boolean, extra = {}) => ({
  key, label, kind, count, has_children: hasChildren, ...extra,
});

export const TREE: Record<string, unknown[]> = {
  '': [
    node('branch:uc', 'Unity Catalog', 'branch', 12, true),
    node('branch:internal', 'Internal', 'branch', 0, false),
    node('branch:external', 'External', 'branch', 3, true),
  ],
  'branch:uc': [node('asset:cat1', 'insights', 'asset', 12, true, { asset_id: 'cat1', asset_type_name: 'Catalog' })],
  'asset:cat1': [
    node('asset:sch1', 'referrals', 'asset', 2, true, { asset_id: 'sch1', asset_type_name: 'Schema' }),
    node('asset:sch2', 'empty_schema', 'asset', 0, false, { asset_id: 'sch2', asset_type_name: 'Schema' }),
  ],
  'asset:sch1': [node('group:sch1:Table', 'Tables', 'group', 2, false, { asset_id: 'sch1', asset_type_name: 'Table' })],
  'branch:external': [],
  'category:analytics': [node('type:Dashboard', 'Dashboards', 'type', 4, false, { asset_type_name: 'Dashboard' })],
  'category:integration': [],
  'category:system': [],
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

export const ASSETS: Record<string, AssetSummary[]> = {
  'branch:uc': [LEADS, LEAD_EVENTS],
  'asset:cat1': [LEADS, LEAD_EVENTS],
  'asset:sch1': [LEADS, LEAD_EVENTS],
  'asset:sch2': [],
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
    if (url.pathname === '/api/assets') {
      const items = (ASSETS[url.searchParams.get('node') ?? ''] ?? []).filter(
        (a) => !url.searchParams.get('name') || a.name.includes(url.searchParams.get('name')!),
      );
      return json({ items, total: items.length, skip: 0, limit: 50 });
    }
    if (url.pathname.startsWith('/api/assets/')) {
      return json({ id: url.pathname.split('/').pop(), name: 'x', status: 'active', relationships: [] });
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
