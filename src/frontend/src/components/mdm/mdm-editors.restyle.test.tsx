/**
 * Wave 3 Task 8b: the Master Data rules editor (Edit MDM Rules, opened from
 * the page's Matching Rules tab) and the match review (shown inside an asset
 * review, components/data-asset-reviews/asset-review-editor.tsx), on Mantine.
 * Both are rendered on their own with the props their callers pass. These
 * tests check the structure, every control, and that every choice still sends
 * the same request and payload as before. Pixel values and long names are
 * measured in a real browser: tests/e2e/master-data-editors.spec.ts (R10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import type { MdmConfig } from '@/types/mdm';
import MatchingRulesEditor from './matching-rules-editor';
import MdmMatchReview from './mdm-match-review';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

const calls = (method: string, pathname: string | RegExp) =>
  fetchMock.mock.calls.filter(([input, init]) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    return (typeof pathname === 'string' ? path === pathname : pathname.test(path)) && (init?.method ?? 'GET') === method;
  });
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

const deferred = () => {
  let release: (r: Response) => void = () => {};
  const promise = new Promise<Response>((resolve) => { release = resolve; });
  return { promise, release };
};

const buttonNames = (el: HTMLElement) =>
  within(el).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Edit MDM Rules
// ---------------------------------------------------------------------------

const CONFIG = {
  id: 'mdm-1', name: 'Customer master', description: null, entity_type: 'customer', master_contract_id: 'c-1',
  status: 'active', project_id: null,
  matching_rules: [
    { name: 'Email match', type: 'deterministic', fields: ['email'], weight: 1, threshold: 1 },
    { name: 'Name similarity', type: 'probabilistic', fields: ['first_name', 'last_name'], weight: 0.6, threshold: 0.85, algorithm: 'levenshtein' },
  ],
  survivorship_rules: [{ field: 'email', strategy: 'most_trusted', priority: ['CRM', 'ERP'] }],
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z',
} as unknown as MdmConfig;
const OTHER = { ...CONFIG, id: 'mdm-2', name: 'Product master', matching_rules: [], survivorship_rules: [] } as unknown as MdmConfig;

function mockRules(extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const answer = await extra(url, init);
    if (answer) return answer;
    if (/^\/api\/mdm\/configs\/[^/]+$/.test(url.pathname) && init?.method === 'PUT') return json({ ...CONFIG, ...bodyOf([input, init]) });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function RulesHarness({ open = true, config = CONFIG, onClose = vi.fn(), onSuccess = vi.fn() }: {
  open?: boolean; config?: MdmConfig; onClose?: () => void; onSuccess?: () => void;
}) {
  return <MatchingRulesEditor isOpen={open} onClose={onClose} onSuccess={onSuccess} config={config} />;
}

const rulesDialog = () => screen.findByRole('dialog', { name: 'Edit MDM Rules' });
const ruleCards = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>('[data-rule]'));

describe('Edit MDM Rules', () => {
  beforeEach(() => {
    mockRules();
    toast.mockClear();
  });

  it('matching rules editor renders with Mantine and no Tailwind', async () => {
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness />);
    const dialog = await rulesDialog();
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    // The ui Button keeps a few Tailwind classes of its own until wave 6
    const tailwind = ['.flex', '.gap-2', '.border-b', '.pb-2', '.p-4', '.border', '[class*="bg-muted"]', '.w-48', '.h-8', '.col-span-2', '.text-center', '.py-8', '[class*="overflow-"]', '[class*="max-h-"]']
      .map((c) => `${c}:not(button)`).join(', ');
    expect(dialog.querySelector(tailwind)).toBeNull();
    // The two sections are kit tabs
    expect(within(dialog).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Matching Rules (2)', 'Survivorship Rules (1)']);
    await user.click(within(dialog).getByRole('tab', { name: 'Survivorship Rules (1)' }));
    expectNoOldMarkup(dialog);
    expect(dialog.querySelector(tailwind)).toBeNull();
  });

  it('matching rules editor keeps every control and prop', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness onClose={onClose} />);
    const dialog = await rulesDialog();
    expect(within(dialog).getByText('Configure matching and survivorship rules for Customer master')).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: 'Matching Rules (2)' })).toHaveAttribute('aria-selected', 'true');
    expect(within(dialog).getByText('Define how records are matched between source and master')).toBeInTheDocument();
    const [first, second] = ruleCards(dialog);
    expect(within(first).getByRole('textbox', { name: 'Rule name' })).toHaveValue('Email match');
    expect(selectField(first, 'Type')).toHaveValue('Deterministic (Exact)');
    expect(await optionNames(user, selectField(first, 'Type'))).toEqual(['Deterministic (Exact)', 'Probabilistic (Fuzzy)']);
    expect(within(first).getByRole('textbox', { name: 'Fields (comma-separated)' })).toHaveValue('email');
    expect(within(first).getByRole('spinbutton', { name: 'Weight (0-1)' })).toHaveValue(1);
    expect(within(first).getByRole('spinbutton', { name: 'Threshold (0-1)' })).toHaveValue(1);
    // Only a probabilistic rule has an algorithm
    expect(within(first).queryByRole('textbox', { name: 'Algorithm' })).toBeNull();
    expect(selectField(second, 'Algorithm')).toHaveValue('Levenshtein');
    expect(await optionNames(user, selectField(second, 'Algorithm'))).toEqual(['Jaro-Winkler', 'Levenshtein', 'Token Sort Ratio']);
    expect(within(second).getByRole('textbox', { name: 'Fields (comma-separated)' })).toHaveValue('first_name, last_name');
    expect(buttonNames(dialog).sort()).toEqual(['Add Rule', 'Cancel', 'Close', 'Remove', 'Remove', 'Save Rules']);

    await user.click(within(dialog).getByRole('tab', { name: 'Survivorship Rules (1)' }));
    expect(within(dialog).getByText('Define how conflicting values are resolved when merging records')).toBeInTheDocument();
    const [surv] = ruleCards(dialog);
    expect(within(surv).getByText('email')).toBeInTheDocument();
    expect(within(surv).getByRole('textbox', { name: 'Field Name' })).toHaveValue('email');
    expect(selectField(surv, 'Strategy')).toHaveValue('Most Trusted');
    expect(await optionNames(user, selectField(surv, 'Strategy'))).toEqual(['Most Recent', 'Most Trusted', 'Most Complete', 'Source Priority']);
    expect(within(surv).getByRole('textbox', { name: 'Priority (comma-separated source names)' })).toHaveValue('CRM, ERP');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls('PUT', /configs/)).toHaveLength(0);
  });

  it('matching rules editor: add, edit and remove rules in both sections, and Save sends the same payload', async () => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness onClose={onClose} onSuccess={onSuccess} />);
    const dialog = await rulesDialog();

    // Edit the first rule: name, type (it gains an algorithm), fields, weight, threshold
    let [first] = ruleCards(dialog);
    const name = within(first).getByRole('textbox', { name: 'Rule name' });
    await user.clear(name);
    await user.type(name, 'Email or phone');
    await pick(user, selectField(first, 'Type'), 'Probabilistic (Fuzzy)');
    expect(selectField(first, 'Algorithm')).toHaveValue('Jaro-Winkler');
    await pick(user, selectField(first, 'Algorithm'), 'Token Sort Ratio');
    // A comma can be typed: the second field is no longer lost
    const fields = within(first).getByRole('textbox', { name: 'Fields (comma-separated)' });
    await user.clear(fields);
    await user.type(fields, 'email, phone');
    expect(fields).toHaveValue('email, phone');
    const weight = within(first).getByRole('spinbutton', { name: 'Weight (0-1)' });
    await user.clear(weight);
    await user.type(weight, '0.5');
    expect(weight).toHaveValue(0.5);
    const threshold = within(first).getByRole('spinbutton', { name: 'Threshold (0-1)' });
    await user.clear(threshold);
    await user.type(threshold, '0.9');

    // Remove the second, add a new one
    [first] = ruleCards(dialog);
    await user.click(within(ruleCards(dialog)[1]).getByRole('button', { name: 'Remove' }));
    expect(ruleCards(dialog)).toHaveLength(1);
    expect(within(dialog).getByRole('tab', { name: 'Matching Rules (1)' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add Rule' }));
    expect(ruleCards(dialog)).toHaveLength(2);
    expect(within(ruleCards(dialog)[1]).getByRole('textbox', { name: 'Rule name' })).toHaveValue('rule_2');
    await user.type(within(ruleCards(dialog)[1]).getByRole('textbox', { name: 'Fields (comma-separated)' }), 'postcode');

    // Survivorship: change the strategy (the priority list goes), add one, remove the first
    await user.click(within(dialog).getByRole('tab', { name: 'Survivorship Rules (1)' }));
    await pick(user, selectField(ruleCards(dialog)[0], 'Strategy'), 'Most Complete');
    expect(within(ruleCards(dialog)[0]).queryByRole('textbox', { name: /^Priority/ })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Add Rule' }));
    const added = ruleCards(dialog)[1];
    expect(within(added).getByText('Unnamed Field')).toBeInTheDocument();
    await user.type(within(added).getByRole('textbox', { name: 'Field Name' }), 'phone');
    expect(within(added).getByText('phone')).toBeInTheDocument();
    await pick(user, selectField(added, 'Strategy'), 'Most Trusted');
    await user.type(within(ruleCards(dialog)[1]).getByRole('textbox', { name: 'Priority (comma-separated source names)' }), 'CRM, Web');
    await user.click(within(ruleCards(dialog)[0]).getByRole('button', { name: 'Remove' }));
    expect(ruleCards(dialog)).toHaveLength(1);

    // Back to matching: the edits are kept
    await user.click(within(dialog).getByRole('tab', { name: 'Matching Rules (2)' }));
    expect(within(ruleCards(dialog)[0]).getByRole('textbox', { name: 'Rule name' })).toHaveValue('Email or phone');

    await user.click(within(dialog).getByRole('button', { name: 'Save Rules' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    const puts = calls('PUT', '/api/mdm/configs/mdm-1');
    expect(puts).toHaveLength(1);
    expect(bodyOf(puts[0])).toEqual({
      matching_rules: [
        { name: 'Email or phone', type: 'probabilistic', fields: ['email', 'phone'], weight: 0.5, threshold: 0.9, algorithm: 'token_sort' },
        { name: 'rule_2', type: 'deterministic', fields: ['postcode'], weight: 1, threshold: 0.8 },
      ],
      survivorship_rules: [{ field: 'phone', strategy: 'most_trusted', priority: ['CRM', 'Web'] }],
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Rules updated successfully' }));
  });

  it('matching rules editor: zero numbers and untrimmed or empty list entries render, and save unchanged', async () => {
    // Values the backend accepts (weight and threshold ge=0) and contracts can carry, not normalised
    const odd = {
      ...CONFIG,
      matching_rules: [{ name: 'zero', type: 'deterministic', fields: ['email ', ''], weight: 0, threshold: 0 }],
      survivorship_rules: [{ field: 'email', strategy: 'most_trusted', priority: [' CRM', '', 'ERP,x'] }],
    } as unknown as MdmConfig;
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness config={odd} />);
    const dialog = await rulesDialog();
    const [rule] = ruleCards(dialog);
    expect(within(rule).getByRole('spinbutton', { name: 'Weight (0-1)' })).toHaveValue(0);
    expect(within(rule).getByRole('spinbutton', { name: 'Threshold (0-1)' })).toHaveValue(0);
    expect(within(rule).getByRole('textbox', { name: 'Fields (comma-separated)' })).toHaveValue('email , ');
    await user.click(within(dialog).getByRole('tab', { name: 'Survivorship Rules (1)' }));
    expect(within(ruleCards(dialog)[0]).getByRole('textbox', { name: /^Priority/ })).toHaveValue(' CRM, , ERP,x');
    await user.click(within(dialog).getByRole('button', { name: 'Save Rules' }));
    await waitFor(() => expect(calls('PUT', '/api/mdm/configs/mdm-1')).toHaveLength(1));
    expect(bodyOf(calls('PUT', '/api/mdm/configs/mdm-1')[0])).toEqual({
      matching_rules: [{ name: 'zero', type: 'deterministic', fields: ['email ', ''], weight: 0, threshold: 0 }],
      survivorship_rules: [{ field: 'email', strategy: 'most_trusted', priority: [' CRM', '', 'ERP,x'] }],
    });
  });

  it('matching rules editor: a typed 0 is shown and saved as 0', async () => {
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness />);
    const dialog = await rulesDialog();
    const [first] = ruleCards(dialog);
    for (const name of ['Weight (0-1)', 'Threshold (0-1)']) {
      const field = within(first).getByRole('spinbutton', { name });
      await user.clear(field);
      await user.type(field, '0');
      expect(field).toHaveValue(0);
    }
    await user.click(within(dialog).getByRole('button', { name: 'Save Rules' }));
    await waitFor(() => expect(calls('PUT', '/api/mdm/configs/mdm-1')).toHaveLength(1));
    expect(bodyOf(calls('PUT', '/api/mdm/configs/mdm-1')[0]).matching_rules[0]).toMatchObject({ weight: 0, threshold: 0 });
  });

  it('matching rules editor: an empty number falls back as before (weight 1, threshold 0.8)', async () => {
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness />);
    const dialog = await rulesDialog();
    const [first] = ruleCards(dialog);
    await user.clear(within(first).getByRole('spinbutton', { name: 'Weight (0-1)' }));
    await user.clear(within(first).getByRole('spinbutton', { name: 'Threshold (0-1)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save Rules' }));
    await waitFor(() => expect(calls('PUT', '/api/mdm/configs/mdm-1')).toHaveLength(1));
    expect(bodyOf(calls('PUT', '/api/mdm/configs/mdm-1')[0]).matching_rules[0]).toMatchObject({ weight: 1, threshold: 0.8 });
  });

  it('matching rules editor: empty sections say so', async () => {
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness config={OTHER} />);
    const dialog = await rulesDialog();
    expect(within(dialog).getByText('No matching rules defined. Click "Add Rule" to create one.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: 'Survivorship Rules (0)' }));
    expect(within(dialog).getByText('No survivorship rules defined. Source values will be used by default.')).toBeInTheDocument();
  });

  it('matching rules editor: each open starts from the configuration, also after a cancelled edit or another configuration', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithMantine(<RulesHarness />);
    let dialog = await rulesDialog();
    await user.click(within(ruleCards(dialog)[0]).getByRole('button', { name: 'Remove' }));
    expect(ruleCards(dialog)).toHaveLength(1);
    rerender(<RulesHarness open={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<RulesHarness open />);
    dialog = await rulesDialog();
    // The cancelled removal is gone
    expect(ruleCards(dialog)).toHaveLength(2);

    // Another configuration (the page keeps the editor mounted): its own rules, saved to its own id
    rerender(<RulesHarness open={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<RulesHarness open config={OTHER} />);
    dialog = await rulesDialog();
    expect(within(dialog).getByText('Configure matching and survivorship rules for Product master')).toBeInTheDocument();
    expect(ruleCards(dialog)).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Save Rules' }));
    await waitFor(() => expect(calls('PUT', '/api/mdm/configs/mdm-2')).toHaveLength(1));
    expect(bodyOf(calls('PUT', '/api/mdm/configs/mdm-2')[0])).toEqual({ matching_rules: [], survivorship_rules: [] });
  });

  it('matching rules editor: a failed save keeps the dialog and the edits, and says why (it used to report success)', async () => {
    mockRules((_url, init) => (init?.method === 'PUT' ? json({ detail: 'Invalid rule' }, 422) : undefined));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness onClose={onClose} onSuccess={onSuccess} />);
    const dialog = await rulesDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Add Rule' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save Rules' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Invalid rule', variant: 'destructive' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'Rules updated successfully' }));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(ruleCards(dialog)).toHaveLength(3);
    expect(within(dialog).getByRole('button', { name: 'Save Rules' })).toBeEnabled();
  });

  it('matching rules editor: a double click sends one request, and Escape and Cancel wait while it is out', async () => {
    const held = deferred();
    mockRules((_url, init) => (init?.method === 'PUT' ? held.promise : undefined));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness onClose={onClose} onSuccess={onSuccess} />);
    const dialog = await rulesDialog();
    await user.dblClick(within(dialog).getByRole('button', { name: 'Save Rules' }));
    expect(await within(dialog).findByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    held.release(json(CONFIG));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(calls('PUT', '/api/mdm/configs/mdm-1')).toHaveLength(1);
  });

  it('matching rules editor: Escape in an open Select closes only the Select, in jsdom', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<RulesHarness onClose={onClose} />);
    const dialog = await rulesDialog();
    const name = within(ruleCards(dialog)[0]).getByRole('textbox', { name: 'Rule name' });
    await user.type(name, ' (kept)');
    await user.click(selectField(ruleCards(dialog)[0], 'Type'));
    expect((await screen.findAllByRole('option', { name: 'Probabilistic (Fuzzy)', hidden: true })).length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(onClose).not.toHaveBeenCalled();
    expect(name).toHaveValue('Email match (kept)');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Match review
// ---------------------------------------------------------------------------

const FQN = 'mdm://mdm-1/run-1/cand-1';
const candidate = (over: Record<string, unknown> = {}) => ({
  id: 'cand-1', run_id: 'run-1', master_record_id: 'master-1', source_record_id: 'src-rec-1', source_contract_id: 'c-src',
  confidence_score: 0.925, match_type: 'fuzzy', matched_fields: ['email'], status: 'pending',
  master_record_data: { golden_id: 'g-1', email: 'a@example.com', name: 'Ann Lee', phone: null, city: 'Oslo', updated_at: 'x' },
  source_record_data: { email: 'A@example.com ', name: 'Ann B. Lee', phone: '555-1234', city: 'Bergen', created_at: 'y' },
  merged_record_data: null, review_request_id: 'rev-1', reviewed_at: null, reviewed_by: null, merged_at: null,
  ...over,
});

let answer: Record<string, unknown> = candidate();

function mockCandidate(extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const result = await extra(url, init);
    if (result) return result;
    if (url.pathname === '/api/mdm/candidates/cand-1' && (init?.method ?? 'GET') === 'GET') return json(answer);
    if (/^\/api\/mdm\/candidates\/[^/]+$/.test(url.pathname) && init?.method === 'PUT') return json({ ...answer, status: 'approved' });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

const loadedReview = () => screen.findByRole('table');
/** The row of a field: its first cell starts with the field's name (then maybe "matched"). */
const rowOf = (field: string) => {
  const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
  const row = rows.find((r) => within(within(r).getAllByRole('cell')[0]).queryByText(field, { exact: true }));
  if (!row) throw new Error(`no row for ${field}`);
  return row;
};
const masterCell = (field: string) => within(rowOf(field)).getAllByRole('cell')[1];
const sourceCell = (field: string) => within(rowOf(field)).getAllByRole('cell')[3];
const choice = (cell: HTMLElement) => within(cell).getByRole('button');
const putBody = () => {
  const puts = calls('PUT', '/api/mdm/candidates/cand-1');
  return bodyOf(puts[puts.length - 1]);
};

describe('match review', () => {
  beforeEach(() => {
    answer = candidate();
    mockCandidate();
    toast.mockClear();
  });

  it('mdm match review renders with Mantine and no Tailwind', async () => {
    const { container } = renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    expect(container.querySelector('[data-slot="card"], .rounded-lg.border, [class*="bg-green"], [class*="bg-blue"], [class*="border-l-2"], .text-lg, .pb-3, .pt-6, .space-y-4, .space-y-2, .flex, .h-\\[400px\\], .w-\\[180px\\], .cursor-pointer')).toBeNull();
    expect(container.querySelector('.mantine-Table-table')).toBeInTheDocument();
    expect(container.querySelector('.mantine-ScrollArea-root')).toBeInTheDocument();
  });

  it('mdm match review keeps every control and prop', async () => {
    const onNext = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<MdmMatchReview assetFqn={FQN} onNext={onNext} hasNext currentIndex={2} totalCount={5} />);
    await loadedReview();
    expect(calls('GET', '/api/mdm/candidates/cand-1')).toHaveLength(1);
    // The summary
    expect(screen.getByRole('heading', { name: 'Match Review' })).toBeInTheDocument();
    expect(screen.getByText('Match Found')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText(/Confidence Score/)).toHaveTextContent('Confidence Score: 92.5%');
    expect(screen.getByText(/Matched on/)).toHaveTextContent('Matched on: email');
    // The table: the system fields left out, sorted by name
    expect(screen.getByRole('heading', { name: 'Field Comparison' })).toBeInTheDocument();
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Field', 'Master Value', '', 'Source Value', 'Final Value']);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['city', 'emailmatched', 'name', 'phone']);
    // Equal (case and space aside) or not
    expect(within(rowOf('email')).getAllByRole('cell')[2]).toHaveTextContent('=');
    expect(within(rowOf('city')).getAllByRole('cell')[2]).toHaveTextContent('≠');
    expect(masterCell('phone')).toHaveTextContent('(empty)');
    // Initial choice: master, or the source where only it has a value
    expect(choice(masterCell('city'))).toHaveAttribute('aria-pressed', 'true');
    expect(choice(sourceCell('city'))).toHaveAttribute('aria-pressed', 'false');
    expect(choice(sourceCell('phone'))).toHaveAttribute('aria-pressed', 'true');
    expect(within(rowOf('city')).getAllByRole('cell')[4]).toHaveTextContent('Master');
    expect(within(rowOf('phone')).getAllByRole('cell')[4]).toHaveTextContent('Source');

    // Every action, the progress, comments
    expect(screen.getByRole('textbox', { name: 'Review Comments (Optional)' })).toBeInTheDocument();
    expect(screen.getByText('Reviewing 2 of 5')).toBeInTheDocument();
    const named = buttonNames(document.body).filter((n) => !['a@example.com', 'A@example.com', 'Ann Lee', 'Ann B. Lee', '(empty)', '555-1234', 'Oslo', 'Bergen'].includes(n));
    expect(named.sort()).toEqual(['All Master', 'All Source', 'Approve', 'Approve & Next', 'Edit', 'Edit', 'Edit', 'Edit', 'Reject', 'Skip', 'Smart Merge'].sort());
    // The tooltips
    await user.hover(screen.getByRole('button', { name: 'Smart Merge' }));
    expect(await screen.findByText('Fill empty master fields with source values')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(calls('PUT', /candidates/)).toHaveLength(0);
  });

  it('mdm match review: without a next item, no Skip or Approve & Next; without an index, no progress', async () => {
    renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve & Next' })).toBeNull();
    expect(screen.queryByText(/^Reviewing/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('mdm match review: choosing master and source cells sends the same merged record', async () => {
    const onReviewComplete = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<MdmMatchReview assetFqn={FQN} onReviewComplete={onReviewComplete} />);
    await loadedReview();
    await user.click(choice(sourceCell('city')));
    expect(choice(sourceCell('city'))).toHaveAttribute('aria-pressed', 'true');
    expect(choice(masterCell('city'))).toHaveAttribute('aria-pressed', 'false');
    await user.click(choice(sourceCell('name')));
    await user.click(choice(masterCell('name')));
    // By keyboard too
    choice(masterCell('phone')).focus();
    await user.keyboard('{Enter}');
    expect(choice(masterCell('phone'))).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onReviewComplete).toHaveBeenCalledWith('approved'));
    expect(putBody()).toEqual({
      status: 'approved',
      merged_record_data: {
        golden_id: 'g-1', source_record_id: 'src-rec-1',
        city: 'Bergen', email: 'a@example.com', name: 'Ann Lee', phone: null,
      },
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Match Approved' }));
  });

  it('mdm match review: All Master, All Source and Smart Merge send the same merged record', async () => {
    const user = userEvent.setup();
    renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    await user.click(screen.getByRole('button', { name: 'All Source' }));
    for (const f of ['city', 'email', 'name', 'phone']) expect(choice(sourceCell(f))).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls('PUT', /candidates/)).toHaveLength(1));
    expect(putBody().merged_record_data).toEqual({
      golden_id: 'g-1', source_record_id: 'src-rec-1', city: 'Bergen', email: 'A@example.com ', name: 'Ann B. Lee', phone: '555-1234',
    });
  });

  it('mdm match review: All Master then Smart Merge', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    await user.click(screen.getByRole('button', { name: 'All Master' }));
    for (const f of ['city', 'email', 'name', 'phone']) expect(choice(masterCell(f))).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls('PUT', /candidates/)).toHaveLength(1));
    expect(putBody().merged_record_data).toEqual({
      golden_id: 'g-1', source_record_id: 'src-rec-1', city: 'Oslo', email: 'a@example.com', name: 'Ann Lee', phone: null,
    });
    unmount();

    renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    await user.click(screen.getByRole('button', { name: 'All Source' }));
    // Smart: master unless it is empty and the source is not
    await user.click(screen.getByRole('button', { name: 'Smart Merge' }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Smart Merge Applied' }));
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls('PUT', /candidates/)).toHaveLength(2));
    expect(putBody().merged_record_data).toEqual({
      golden_id: 'g-1', source_record_id: 'src-rec-1', city: 'Oslo', email: 'a@example.com', name: 'Ann Lee', phone: '555-1234',
    });
  });

  it('mdm match review: an edited final value is sent as typed', async () => {
    const user = userEvent.setup();
    renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    await user.click(within(within(rowOf('name')).getAllByRole('cell')[4]).getByRole('button', { name: 'Edit' }));
    const input = within(rowOf('name')).getByRole('textbox', { name: 'Final Value: name' });
    // It starts from the master value
    expect(input).toHaveValue('Ann Lee');
    await user.clear(input);
    await user.type(input, 'Ann Beth Lee');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(calls('PUT', /candidates/)).toHaveLength(1));
    expect(putBody().merged_record_data).toMatchObject({ name: 'Ann Beth Lee', city: 'Oslo' });
  });

  it('mdm match review: Reject sends only the status; Approve & Next approves then moves on', async () => {
    const onReviewComplete = vi.fn();
    const onNext = vi.fn();
    const user = userEvent.setup();
    const { unmount } = renderWithMantine(<MdmMatchReview assetFqn={FQN} onReviewComplete={onReviewComplete} />);
    await loadedReview();
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(onReviewComplete).toHaveBeenCalledWith('rejected'));
    expect(putBody()).toEqual({ status: 'rejected' });
    unmount();

    renderWithMantine(<MdmMatchReview assetFqn={FQN} onReviewComplete={onReviewComplete} onNext={onNext} hasNext />);
    await loadedReview();
    await user.click(screen.getByRole('button', { name: 'Approve & Next' }));
    await waitFor(() => expect(onNext).toHaveBeenCalledTimes(1));
    expect(onReviewComplete).toHaveBeenLastCalledWith('approved');
    expect(putBody().status).toBe('approved');
  });

  it('mdm match review: a double click on Approve sends one request; a failed one says why and moves nowhere', async () => {
    const held = deferred();
    mockCandidate((_url, init) => (init?.method === 'PUT' ? held.promise : undefined));
    const onNext = vi.fn();
    const onReviewComplete = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<MdmMatchReview assetFqn={FQN} onNext={onNext} hasNext onReviewComplete={onReviewComplete} />);
    await loadedReview();
    await user.dblClick(screen.getByRole('button', { name: 'Approve & Next' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled());
    await user.click(screen.getByRole('button', { name: 'Reject' }));
    held.release(json({ detail: 'Locked' }, 409));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Locked', variant: 'destructive' })));
    expect(calls('PUT', /candidates/)).toHaveLength(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(onReviewComplete).not.toHaveBeenCalled();
  });

  it('mdm match review: read-only and reviewed candidates show values, no choices', async () => {
    const { unmount } = renderWithMantine(<MdmMatchReview assetFqn={FQN} readOnly />);
    await loadedReview();
    expect(screen.queryByRole('button', { name: 'All Master' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(within(masterCell('city')).queryByRole('button')).toBeNull();
    expect(within(rowOf('city')).getAllByRole('cell')[4]).toHaveTextContent('Oslo');
    unmount();

    answer = candidate({
      status: 'approved', reviewed_by: 'steward@example.com', reviewed_at: '2026-11-08T08:00:00Z',
      merged_record_data: { email: 'a@example.com', name: 'Ann Beth Lee', phone: '555-1234', city: 'Oslo' },
    });
    renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Review Comments (Optional)' })).toBeNull();
    expect(screen.getByText(/This match has already been approved by steward@example.com on/)).toBeInTheDocument();
    // The merged record's own value, and which side it came from
    expect(within(rowOf('name')).getAllByRole('cell')[4]).toHaveTextContent('Ann Beth Lee');
    expect(within(rowOf('phone')).getAllByRole('cell')[4]).toHaveTextContent('555-1234');
  });

  it('mdm match review: a new record defaults to the source', async () => {
    answer = candidate({ match_type: 'new', master_record_data: null, master_record_id: null });
    renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    await loadedReview();
    expect(screen.getByText('New Record')).toBeInTheDocument();
    for (const f of ['city', 'email', 'name', 'phone']) expect(choice(sourceCell(f))).toHaveAttribute('aria-pressed', 'true');
  });

  it('mdm match review: loading, an invalid FQN, a failed load and a missing candidate keep their messages', async () => {
    const slow = deferred();
    mockCandidate((url) => (url.pathname === '/api/mdm/candidates/cand-1' ? slow.promise : undefined));
    const { unmount } = renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    expect(screen.getByText('Loading match details...')).toBeInTheDocument();
    slow.release(json({ detail: 'Candidate gone' }, 404));
    expect(await screen.findByText('Candidate gone')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Candidate gone');
    unmount();

    const invalid = renderWithMantine(<MdmMatchReview assetFqn="not-an-fqn" />);
    expect(await screen.findByText('Invalid MDM FQN format')).toBeInTheDocument();
    invalid.unmount();

    mockCandidate((url) => (url.pathname === '/api/mdm/candidates/cand-1' ? new Response(null, { status: 204 }) : undefined));
    renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    expect(await screen.findByText('Match candidate not found')).toBeInTheDocument();
  });

  it('mdm match review: moving to the next asset drops a late answer for the previous one', async () => {
    const slow = deferred();
    const second = candidate({ id: 'cand-2', source_record_id: 'src-rec-2', master_record_data: { email: 'b@example.com' }, source_record_data: { email: 'b@example.com' } });
    mockCandidate((url) => {
      if (url.pathname === '/api/mdm/candidates/cand-1') return slow.promise;
      if (url.pathname === '/api/mdm/candidates/cand-2') return json(second);
      return undefined;
    });
    const { rerender } = renderWithMantine(<MdmMatchReview assetFqn={FQN} />);
    rerender(<MdmMatchReview assetFqn="mdm://mdm-1/run-1/cand-2" />);
    expect(await within(await loadedReview()).findAllByText('b@example.com')).toHaveLength(2);
    slow.release(json(answer));
    await new Promise((r) => setTimeout(r, 30));
    expect(within(screen.getByRole('table')).queryByText('Oslo')).toBeNull();
    expect(within(screen.getByRole('table')).getAllByText('b@example.com')).toHaveLength(2);
  });
});
