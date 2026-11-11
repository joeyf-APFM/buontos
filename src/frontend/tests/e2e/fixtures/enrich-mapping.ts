/**
 * Records for the Enrich (/concepts/enrich) and Term Mapping
 * (/concepts/mapping) specs of wave 2 Task 14: coverage rows, tag delivery
 * stats, a scheme's pending suggestions, term-mapping runs and their
 * suggestions, with names long enough to test wrapping and truncation
 * (Review Focus 1). Only these specs use them; the restyle check keeps
 * fixtures/data.ts.
 */
import type { Page } from '@playwright/test';

/** A 200-character name with breaks, and one with none. */
export const LONG_NAME = `Customer ${'lifetime-revenue-and-retention-scheme-'.repeat(6)}`.slice(0, 200);
export const UNBROKEN = `urn:e2e:${'z'.repeat(192)}`;

const scheme = (id: string, label: string, extra: Record<string, unknown> = {}) => ({
  scheme: id, label, concepts: 12, coverage_pct: 50, products: 1, contracts: 2, assets: 6, suggested: 0,
  last_run_at: '2026-11-08T09:00:00Z', ...extra,
});

export const COVERAGE = {
  schemes: [
    scheme('urn:scheme:long', LONG_NAME, { suggested: 2 }),
    scheme('urn:scheme:finance', 'Finance', { concepts: 45, coverage_pct: 87, suggested: 3 }),
    scheme('urn:scheme:unbroken', UNBROKEN),
  ],
};

export const TAG_STATS = {
  eligible: 40,
  pending: 2,
  synced: 38,
  last_run_state: 'SUCCESS',
  last_run_at: '2026-11-08T10:00:00Z',
  job_installed: true,
  pending_items: [
    {
      entity_id: `main.sales.${UNBROKEN}`, entity_type: 'uc_table', iri: `urn:concept:${UNBROKEN}`, label: LONG_NAME,
      created_at: '2026-11-08T11:00:00Z', scheme: 'urn:scheme:long', scheme_label: LONG_NAME, asset_name: UNBROKEN,
    },
    {
      entity_id: 'a-1', entity_type: 'asset', iri: 'urn:concept:revenue', label: 'Revenue',
      created_at: '2026-11-08T11:00:00Z', scheme: 'urn:scheme:finance', scheme_label: 'Finance', asset_name: 'orders',
    },
  ],
};

export const SCHEME_SUGGESTIONS = [
  {
    id: 'sg-1', run_id: 'run-1', source_entity_type: 'asset', source_entity_id: `main.sales.${UNBROKEN}`,
    source_label: null, target_concept_iri: `urn:concept:${UNBROKEN}`, target_concept_label: LONG_NAME,
    confidence: 0.91, reason: `name similarity ${LONG_NAME}`,
  },
  {
    id: 'sg-2', run_id: 'run-1', source_entity_type: 'asset', source_entity_id: 'main.sales.orders',
    source_label: 'orders', target_concept_iri: 'urn:concept:order', target_concept_label: 'Order',
    confidence: 0.6, reason: 'exact label match',
  },
];

const stats = (extra: Record<string, number> = {}) => ({
  targets: 120, suggestions_total: 2, suggestions_pending: 2, suggestions_accepted: 0, suggestions_rejected: 0,
  suggestions_auto_apply: 1, links_created: 0, links_skipped: 0, ...extra,
});

export const RUNS = [
  {
    id: '1aaaaaaa-0000-0000', status: 'suggested', comment: LONG_NAME, stats: stats(), created_by: 'e2e.user@example.com',
    created_at: '2026-11-09T11:00:00Z', finished_at: '2026-11-09T11:01:00Z', applied_at: null,
  },
  {
    id: '2bbbbbbb-0000-0000', status: 'applied', comment: 'Nightly columns', stats: stats({ links_created: 4 }),
    created_by: 'e2e.user@example.com', created_at: '2026-11-08T11:00:00Z', finished_at: null, applied_at: '2026-11-08T12:00:00Z',
  },
];

export const RUN_DETAIL = {
  ...RUNS[0],
  ontology_contexts: [`urn:glossary:${UNBROKEN}`, 'urn:glossary:finance'],
  include_shipped: [],
  target_filter: { entity_types: ['asset'] },
  engines: ['heuristic'],
  error: null,
  applied_link_ids: [],
};

/** The run "Create run" makes, from either page. */
export const CREATED_RUN = {
  ...RUN_DETAIL,
  id: 'run-new',
  comment: 'Made in the spec',
  stats: stats({ suggestions_total: 2 }),
};

const suggestion = (id: string, runId: string, label: string, source: string) => ({
  id, run_id: runId, source_entity_type: 'asset', source_entity_id: source, source_label: null,
  suggestion_kind: 'entity_assignment', target_concept_iri: `urn:concept:${id}`, target_concept_label: label,
  confidence: 0.82, reason: 'name similarity', auto_apply: false, engine: 'heuristic', status: 'pending',
  warnings: [], created_at: '2026-11-09T11:00:00Z', updated_at: '2026-11-09T11:00:00Z',
});

export const CREATED_SUGGESTIONS = [
  suggestion('s-1', 'run-new', LONG_NAME, `main.sales.${UNBROKEN}`),
  suggestion('s-2', 'run-new', 'Order', 'main.sales.orders'),
];

export const CONTEXTS = [
  { context: 'urn:glossary:finance', label: 'Finance Glossary', concept_count: 45 },
  { context: `urn:glossary:${UNBROKEN}`, label: LONG_NAME, concept_count: 3 },
];

/** Exact-path answers for both pages, beside DATA_FIXTURES. */
export const ENRICH_MAPPING_FIXTURES: Record<string, unknown> = {
  '/api/knowledge/coverage': COVERAGE,
  '/api/knowledge/tag-delivery-stats': TAG_STATS,
  '/api/knowledge/coverage/urn%3Ascheme%3Along/pending-suggestions': SCHEME_SUGGESTIONS,
  '/api/knowledge/coverage/urn%3Ascheme%3Afinance/pending-suggestions': SCHEME_SUGGESTIONS,
  '/api/term-mappings/contexts': CONTEXTS,
  '/api/term-mappings/runs/1aaaaaaa-0000-0000': RUN_DETAIL,
  '/api/term-mappings/runs/2bbbbbbb-0000-0000': { ...RUN_DETAIL, ...RUNS[1] },
  '/api/term-mappings/runs/run-new/suggestions': CREATED_SUGGESTIONS,
};

/**
 * GET /api/term-mappings/runs lists the runs (`runs`, or a 500 while
 * `fail()` says so); a POST creates CREATED_RUN. One path, so it's routed by
 * method here, over the fixtures.
 */
export async function routeRuns(page: Page, { runs = RUNS as unknown[], fail = () => false } = {}) {
  await page.route((url) => url.pathname === '/api/term-mappings/runs', async (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, json: CREATED_RUN });
    if (fail()) return route.fulfill({ status: 500, json: { detail: 'The runs store is down' } });
    return route.fulfill({ json: runs });
  });
}
