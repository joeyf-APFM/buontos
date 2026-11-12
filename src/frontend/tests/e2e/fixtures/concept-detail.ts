/**
 * The concept detail page's records (wave 2 Task 15): a concept in an
 * editable scheme, its relations, linked entities and version history.
 *
 * - `CONCEPT_DETAIL_RESTYLE` is what the restyle check gets (through
 *   fixtures/data.ts): the concept `e2e-concept-1`, answered only for its own
 *   IRI, so no other page that calls these paths sees a change. It has no
 *   scheme record, since `/api/knowledge/collections` is shared with the other
 *   concept pages: the page shows it as read-only.
 * - `conceptDetailFixtures()` is for concept-detail.spec.ts: the same paths,
 *   for any IRI it is given, plus the editable scheme and the pickers' lists.
 */

export const LONG_LABEL = `Customer ${'lifetime-revenue-and-retention-concept-'.repeat(6)}`.slice(0, 200);
export const LONG_IRI = `urn:e2e:concept:${'q'.repeat(184)}`;
export const SCHEME = 'urn:e2e:scheme:sales';

const base = (iri: string, extra: Record<string, unknown> = {}) => ({
  iri,
  label: 'Customer',
  labels: {},
  comments: { en: 'A party that buys goods or services from us.\nCounted once per billing account.' },
  concept_type: 'class',
  status: 'draft',
  source_context: SCHEME,
  parent_concepts: ['urn:e2e:concept:Party'],
  child_concepts: ['urn:e2e:concept:RetailCustomer', 'urn:e2e:concept:WholesaleCustomer'],
  properties: [],
  tagged_assets: [],
  synonyms: ['Client', 'Buyer'],
  examples: ['Retail shopper', 'Wholesale account'],
  created_at: '2026-10-01T09:00:00Z',
  ...extra,
});

/** A relation row as GET /api/semantic-models/neighbors answers it. */
const neighbor = (direction: 'outgoing' | 'incoming', predicate: string, target: string) => ({
  direction,
  predicate,
  display: target,
  displayType: 'resource',
  stepIri: target,
  stepIsResource: true,
});

const SKOS = 'http://www.w3.org/2004/02/skos/core#';

const RELATIONS = [
  neighbor('outgoing', `${SKOS}broader`, 'urn:e2e:concept:Party'),
  neighbor('incoming', `${SKOS}broader`, 'urn:e2e:concept:RetailCustomer'),
  neighbor('incoming', `${SKOS}broader`, 'urn:e2e:concept:WholesaleCustomer'),
  neighbor('outgoing', `${SKOS}related`, 'urn:e2e:concept:Account'),
];

/** Review Focus 5: a long relation list, 80 rows. */
export const MANY_RELATIONS = Array.from({ length: 80 }, (_, i) =>
  neighbor('outgoing', `${SKOS}related`, `urn:e2e:concept:Related${String(i).padStart(2, '0')}`));

const LINKS = [
  { id: 'link-1', entity_id: 'e2e-product-1', entity_type: 'data_product', iri: '' },
  { id: 'link-2', entity_id: 'main.sales.orders', entity_type: 'uc_table', iri: '' },
];

const VERSIONS = (iri: string) => ({
  iri,
  label: 'Customer',
  current_version: 2,
  status: 'draft',
  versions: [
    { version: 2, is_current: true, status: 'draft', created_at: '2026-10-05T09:00:00Z', created_by: 'e2e.user@example.com' },
    { version: 1, is_current: false, status: 'approved', created_at: '2026-10-01T09:00:00Z', created_by: 'e2e.user@example.com' },
  ],
  replaced_by_iris: [],
});

const iriOf = (url: URL) => url.searchParams.get('iri') ?? '';

/** The restyle check's concept, only for its own IRI (other callers get the default empty list). */
export const RESTYLE_IRI = 'e2e-concept-1';
const onlyRestyle = (answer: (iri: string) => unknown) => (url: URL) =>
  iriOf(url) === RESTYLE_IRI ? answer(RESTYLE_IRI) : [];

export const CONCEPT_DETAIL_RESTYLE: Record<string, unknown> = {
  '/api/semantic-models/concepts/by-iri': onlyRestyle((iri) => ({ concept: base(iri) })),
  '/api/semantic-models/concepts/version': onlyRestyle(VERSIONS),
  '/api/semantic-models/neighbors': onlyRestyle(() => RELATIONS),
  '/api/semantic-links/by-iri': onlyRestyle((iri) => LINKS.map((l) => ({ ...l, iri }))),
};

export interface ConceptDetailOptions {
  concept?: Record<string, unknown>;
  relations?: unknown[];
}

/** Every path the page reads, for any IRI, in an editable scheme. */
export function conceptDetailFixtures({ concept = {}, relations = RELATIONS }: ConceptDetailOptions = {}): Record<string, unknown> {
  return {
    '/api/semantic-models/concepts/by-iri': (url: URL) => ({ concept: base(iriOf(url), concept) }),
    '/api/semantic-models/concepts/version': (url: URL) => VERSIONS(iriOf(url)),
    '/api/semantic-models/concepts/version/detail': { definition: 'A party that buys goods.' },
    '/api/semantic-models/neighbors': relations,
    '/api/semantic-links/by-iri': (url: URL) => LINKS.map((l) => ({ ...l, iri: iriOf(url) })),
    '/api/knowledge/collections': {
      collections: [{
        iri: SCHEME, label: 'Sales Glossary', collection_type: 'glossary', scope_level: 'enterprise',
        source_type: 'custom', is_editable: true, status: 'active', concept_count: 3, source_key: SCHEME,
        child_collections: [],
      }],
    },
    // The concept pickers' list
    '/api/semantic-models/concepts': [
      { value: 'urn:e2e:concept:Account', label: 'Account', type: 'class' },
      { value: 'urn:e2e:concept:Party', label: 'Party', type: 'class' },
    ],
    // The approval workflow lookup: none, so Request review opens the plain dialog
    '/api/workflows/for-trigger/for_request_status_change': {},
    '/api/knowledge/concepts/by-iri/submit-review/preview': { governed: false, workflow_names: [], workflow_count: 0 },
  };
}
