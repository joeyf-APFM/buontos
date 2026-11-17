// Records for the wave 3 (Govern) pages, by exact /api path: Compliance (list,
// policy, run), Master Data, Security Features, Entitlements and Entitlements
// Sync. Without them most of these pages baseline an empty state or
// "Run not found.", which proves nothing about a restyle. fixtures/data.ts
// spreads GOVERN_FIXTURES into DATA_FIXTURES.
// Review Focus 1: one 200-character policy name and one 120-character object name.

const CREATED = '2026-10-01T09:00:00Z';
const UPDATED = '2026-11-02T15:30:00Z';

// 200 characters
const LONG_POLICY_NAME = [
  'Every data product that holds personal data must name an accountable owner, link a current',
  'data contract, document its retention period and tag every sensitive column before release',
  'to every consumer.',
].join(' ');

// 120 characters, unbroken
const LONG_OBJECT_NAME = `main.sales.customer_lifetime_value_${'x'.repeat(120)}`.slice(0, 120);

const RULE = 'MATCH (obj:Object) ASSERT obj.owner IS NOT NULL';

const policy = (id: string, name: string, severity: string, category: string, compliance: number, isActive: boolean) => ({
  id, name, description: `${name} across every product`, failure_message: `${name} failed`,
  rule: RULE, compliance, history: [compliance - 5, compliance],
  created_at: CREATED, updated_at: UPDATED, is_active: isActive, severity, category,
});

const POLICIES = [
  policy('e2e-policy-1', 'Owner assigned', 'high', 'Governance', 92, true),
  policy('e2e-policy-2', 'PII is tagged', 'critical', 'Security', 64, true),
  policy('e2e-policy-3', 'Descriptions present', 'low', 'Quality', 80, false),
  policy('e2e-policy-4', LONG_POLICY_NAME, 'medium', 'Governance', 71, true),
];

const COMPLIANCE = {
  policies: POLICIES,
  stats: { overall_compliance: 77, active_policies: 3, critical_issues: 1 },
};

const run = (id: string, policyId: string, startedAt: string, success: number, failure: number) => ({
  id, policy_id: policyId, status: 'completed', started_at: startedAt, finished_at: startedAt,
  success_count: success, failure_count: failure, score: Math.round((success / (success + failure)) * 100),
  error_message: null, error_code: null, error_params: null,
});

const RUN = run('e2e-run-1', 'e2e-policy-1', '2026-11-08T08:00:00Z', 3, 2);
const OLDER_RUN = run('e2e-run-0', 'e2e-policy-1', '2026-11-01T08:00:00Z', 4, 1);

const result = (id: string, name: string, passed: boolean, message: string | null) => ({
  id, run_id: 'e2e-run-1', object_type: 'table', object_id: `e2e-object-${id}`, object_name: name, passed,
  message, details_json: null, created_at: '2026-11-08T08:00:10Z',
});

const RESULTS = [
  result('r1', 'main.sales.orders', false, 'No owner assigned'),
  result('r2', LONG_OBJECT_NAME, false, 'No owner assigned'),
  result('r3', 'main.sales.order_lines', true, null),
  result('r4', 'main.finance.invoices', true, null),
  result('r5', 'main.finance.payments', true, null),
];

const resultsFor = (url: URL) => {
  const onlyFailed = url.searchParams.get('only_failed') === 'true';
  return { run: RUN, results: onlyFailed ? RESULTS.filter((r) => !r.passed) : RESULTS };
};

const MDM_CONFIG = {
  id: 'e2e-mdm-1', name: 'Customer master', description: 'Golden record for customers',
  entity_type: 'customer', master_contract_id: 'e2e-contract-1', master_contract_name: 'Orders contract',
  status: 'active', project_id: null,
  matching_rules: [
    { name: 'Email match', type: 'deterministic', fields: ['email'], weight: 1, threshold: 1 },
    { name: 'Name similarity', type: 'probabilistic', fields: ['first_name', 'last_name'], weight: 0.6, threshold: 0.85, algorithm: 'jaro_winkler' },
  ],
  survivorship_rules: [{ field: 'email', strategy: 'most_recent' }],
  source_count: 2, last_run_at: '2026-11-08T08:00:00Z', last_run_status: 'completed',
  created_at: CREATED, updated_at: UPDATED, created_by: 'e2e.user@example.com',
};

const source = (n: number, contract: string, table: string, key: string) => ({
  id: `e2e-mdm-source-${n}`, config_id: 'e2e-mdm-1', source_contract_id: `e2e-contract-src-${n}`,
  source_contract_name: contract, source_table_fqn: table, key_column: key,
  column_mapping: { email: 'email_address' }, priority: n, status: 'active',
  last_sync_at: UPDATED, created_at: CREATED, updated_at: UPDATED,
});

const MDM_RUN = {
  id: 'e2e-mdm-run-1', config_id: 'e2e-mdm-1', source_link_id: null, status: 'completed', databricks_run_id: null,
  total_source_records: 1200, total_master_records: 900, matches_found: 3, new_records: 1,
  started_at: '2026-11-08T08:00:00Z', completed_at: '2026-11-08T08:10:00Z', error_message: null,
  triggered_by: 'e2e.user@example.com', pending_review_count: 2, approved_count: 1,
};

const candidate = (n: number, type: string, status: string, score: number, master: string | null) => ({
  id: `e2e-mdm-cand-${n}`, run_id: 'e2e-mdm-run-1', master_record_id: master, source_record_id: `src-${n}`,
  source_contract_id: 'e2e-contract-src-1', confidence_score: score, match_type: type, matched_fields: ['email'],
  status, master_record_data: master ? { email: 'a@example.com' } : null, source_record_data: { email: 'a@example.com' },
  merged_record_data: null, review_request_id: null, reviewed_at: null, reviewed_by: null, merged_at: null,
});

const SECURITY_FEATURES = [
  {
    id: 'e2e-sec-1', name: 'Regional row filter', description: 'Rows limited to the user region',
    type: 'row_filtering', status: 'active', target: 'main.sales.orders', conditions: ['region = current_region()'],
    last_updated: UPDATED,
  },
  {
    id: 'e2e-sec-2', name: 'Mask email addresses', description: 'Masks the email column for non-stewards',
    type: 'column_masking', status: 'inactive', target: 'main.sales.customers.email',
    conditions: ['is_member(stewards)', 'purpose = analytics'], last_updated: UPDATED,
  },
];

const PERSONAS = [
  {
    id: 'e2e-persona-1', name: 'Data Steward', description: 'Curates and approves data assets',
    created_at: CREATED, updated_at: UPDATED,
    privileges: [
      { securable_id: 'main.sales.orders', securable_type: 'table', permission: 'MANAGE' },
      { securable_id: 'main.sales', securable_type: 'schema', permission: 'READ' },
    ],
    groups: ['data-stewards', 'data-governance'],
  },
  {
    id: 'e2e-persona-2', name: 'Analyst', description: 'Reads curated data',
    created_at: CREATED, updated_at: UPDATED,
    privileges: [{ securable_id: 'main.sales', securable_type: 'schema', permission: 'READ' }],
    groups: ['analysts'],
  },
];

const SYNC_CONFIGS = [
  {
    id: 'e2e-sync-1', name: 'Nightly workspace sync', connection: 'e2e-conn-1', schedule: '0 2 * * *', enabled: true,
    catalogs: ['main'], lastSync: { status: 'success', timestamp: '2026-11-08 02:00' },
  },
  {
    id: 'e2e-sync-2', name: 'Weekly partner sync', connection: 'e2e-conn-1', schedule: '0 3 * * 0', enabled: false,
    catalogs: ['finance'],
  },
];

export const GOVERN_FIXTURES: Record<string, unknown> = {
  // Compliance
  '/api/compliance/policies': COMPLIANCE,
  '/api/compliance/policies/e2e-policy-1': { ...POLICIES[0], examples: null },
  '/api/compliance/policies/e2e-policy-1/runs': [RUN, OLDER_RUN],
  '/api/compliance/runs/e2e-run-1/results': resultsFor,
  '/api/compliance/runs/e2e-run-0/results': (url: URL) => ({ ...resultsFor(url), run: OLDER_RUN }),

  // Master Data: one configuration, picked on click
  '/api/mdm/configs': [MDM_CONFIG],
  '/api/mdm/configs/e2e-mdm-1': MDM_CONFIG,
  '/api/mdm/configs/e2e-mdm-1/sources': [
    source(1, 'Web shop customers', 'main.web.customers', 'customer_id'),
    source(2, 'CRM accounts', 'main.crm.accounts', 'account_id'),
  ],
  '/api/mdm/configs/e2e-mdm-1/runs': [MDM_RUN],
  '/api/mdm/runs/e2e-mdm-run-1/candidates': [
    candidate(1, 'exact', 'pending', 0.99, 'master-1'),
    candidate(2, 'fuzzy', 'approved', 0.86, 'master-2'),
    candidate(3, 'new', 'pending', 0.5, null),
  ],

  // Security Features
  '/api/security-features': SECURITY_FEATURES,

  // Entitlements and sync
  '/api/entitlements/personas': PERSONAS,
  '/api/entitlements-sync/configs': SYNC_CONFIGS,
  '/api/entitlements-sync/connections': [{ id: 'e2e-conn-1', name: 'Workspace catalog' }],
  '/api/entitlements-sync/catalogs': ['main', 'finance'],
};
