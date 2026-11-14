/**
 * Wave 3 Task 8a: the three Master Data dialogs (New MDM Configuration, Link
 * Source Contract, Create Match Review) on the kit Dialog. Each is rendered on
 * its own, with the props the Master Data page passes (Task 7 consumes them
 * unchanged). These tests check the structure, every control, the requests
 * and payloads, and the lessons of the earlier dialogs (fields afresh on each
 * open, Escape and Cancel held while a save is out, one request on a double
 * click, stale and non-array answers). Pixel values, long names and Escape in
 * an open Select are measured in a real browser too:
 * tests/e2e/master-data-dialogs.spec.ts (ruling R10).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import MdmConfigDialog from './mdm-config-dialog';
import LinkSourceDialog from './link-source-dialog';
import CreateReviewDialog from './create-review-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const props = (names: string[]) => names.map((name) => ({ name, logicalType: 'string' }));

const CONTRACTS = [
  { id: 'c-master', name: 'Customer master contract', status: 'active' },
  { id: 'c-rules', name: 'CRM contract', status: 'active' },
  { id: 'c-plain', name: 'Web shop contract', status: 'active' },
  { id: 'c-draft', name: 'Draft contract', status: 'draft' },
];

const CONTRACT_RULES = [
  { name: 'email_exact', type: 'exact', fields: ['email'], weight: 1, threshold: 1 },
  { name: 'name_fuzzy', type: 'fuzzy', fields: ['first_name', 'last_name'], weight: 0.6, threshold: 0.85, algorithm: 'levenshtein' },
  { name: 'phone', type: 'deterministic', fields: ['phone'], weight: 0.5, threshold: 1 },
  { name: 'postcode', type: 'probabilistic', fields: ['postcode'], weight: 0.3, threshold: 0.9 },
];

const DETAILS: Record<string, unknown> = {
  'c-master': { ...CONTRACTS[0], schema: [{ name: 'customers', properties: props(['customer_id', 'email', 'full_name', 'phone']) }] },
  'c-rules': {
    ...CONTRACTS[1],
    schema: [{ name: 'accounts', properties: props(['account_id', 'email_address', 'fullname', 'phone']) }],
    customProperties: {
      mdmMatchingRules: JSON.stringify(CONTRACT_RULES),
      mdmSurvivorshipRules: [{ field: 'email', strategy: 'most_trusted', priority: ['CRM'] }],
      mdmKeyColumn: 'account_id',
      mdmSourcePriority: '7',
      mdmColumnMappings: JSON.stringify({ email_address: 'email', not_a_column: 'x' }),
    },
  },
  'c-plain': { ...CONTRACTS[2], schema: [{ name: 'web', properties: props(['web_id', 'email', 'full_name']) }], customProperties: {} },
};

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: URL, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;

function mockBackend(extra: Handler = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const answer = await extra(url, init);
    if (answer) return answer;
    const path = url.pathname;
    if (path === '/api/data-contracts' && method === 'GET') return json(CONTRACTS);
    const detail = path.match(/^\/api\/data-contracts\/([^/]+)$/);
    if (detail && method === 'GET') return DETAILS[detail[1]] ? json(DETAILS[detail[1]]) : json({ detail: 'Not found' }, 404);
    if (path === '/api/mdm/configs' && method === 'POST') return json({ id: 'mdm-new', name: 'Created' });
    if (/^\/api\/mdm\/configs\/[^/]+\/sources$/.test(path) && method === 'POST') return json({ id: 'link-1' });
    if (/^\/api\/mdm\/runs\/[^/]+\/create-review$/.test(path)) return json({ review_id: 'rev-1', candidate_count: 2 });
    if (path === '/api/directory/status') return json({ configured: false, provider_type: null, connection_name: null });
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
}

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

type User = ReturnType<typeof userEvent.setup>;
const buttonNames = (el: HTMLElement) =>
  within(el).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '');

beforeEach(() => {
  mockBackend();
  toast.mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// New MDM Configuration
// ---------------------------------------------------------------------------

function ConfigHarness({ onClose = vi.fn(), onSuccess = vi.fn(), open = true }: { onClose?: () => void; onSuccess?: () => void; open?: boolean }) {
  return (
    <>
      <button type="button">Opener</button>
      <MdmConfigDialog isOpen={open} onClose={onClose} onSuccess={onSuccess} />
    </>
  );
}

const configDialog = () => screen.findByRole('dialog', { name: 'New MDM Configuration' });

async function chooseContract(user: User, dialog: HTMLElement, name: string) {
  const field = selectField(dialog, 'Master Data Contract');
  await waitFor(() => expect(field).not.toBeDisabled());
  await pick(user, field, name);
}

describe('New MDM Configuration dialog', () => {
  it('mdm config dialog renders with Mantine and no Tailwind', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness />);
    const dialog = await configDialog();
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(dialog.querySelector('[data-slot], [class*="max-w-"], .p-4, .pt-2, .pl-2, .list-disc, .flex')).toBeNull();
    await chooseContract(user, dialog, 'CRM contract');
    await within(dialog).findByText(/Loaded 4 matching rules/);
    expectNoOldMarkup(dialog);
    expect(dialog.querySelector('.list-disc, .list-inside, .flex, .text-xs')).toBeNull();
  });

  it('mdm config dialog keeps every control and prop', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness onClose={onClose} />);
    const dialog = await configDialog();
    expect(within(dialog).getByText('Create a master data management configuration tied to a data contract.')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Configuration Name' })).toHaveAttribute('placeholder', 'e.g., Customer Master');
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toBeInTheDocument();
    const entity = selectField(dialog, 'Entity Type');
    expect(entity).toHaveValue('Customer');
    expect(await optionNames(user, entity)).toEqual(['Customer', 'Product', 'Supplier', 'Location', 'Other']);
    const contract = selectField(dialog, 'Master Data Contract');
    await waitFor(() => expect(contract).not.toBeDisabled());
    // Active contracts only, as before
    expect(await optionNames(user, contract)).toEqual(['Customer master contract', 'CRM contract', 'Web shop contract']);
    expect(calls('GET', '/api/data-contracts')).toHaveLength(1);
    // Cancel, Create Configuration and the corner close
    expect(buttonNames(dialog).sort()).toEqual(['Cancel', 'Close', 'Create Configuration']);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mdm config dialog: rules from the contract, or the defaults, preview and are sent with the same payload', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness onSuccess={onSuccess} />);
    const dialog = await configDialog();
    // Nothing chosen: no preview
    expect(within(dialog).queryByText(/Matching Rules:/)).toBeNull();

    // A contract with rules: the first three and "...and 1 more"
    await chooseContract(user, dialog, 'CRM contract');
    expect(await within(dialog).findByText('Loaded 4 matching rules and 1 survivorship rules from contract\'s customProperties.')).toBeInTheDocument();
    expect(within(dialog).getByText('Matching Rules:')).toBeInTheDocument();
    const items = within(dialog).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'email_exact: email (deterministic)',
      'name_fuzzy: first_name, last_name (probabilistic)',
      'phone: phone (deterministic)',
      '...and 1 more',
    ]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Rules Loaded' }));

    // A contract without: the defaults
    await chooseContract(user, dialog, 'Web shop contract');
    expect(await within(dialog).findByText(/Contract has no MDM rules defined/)).toBeInTheDocument();
    expect(within(dialog).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'email_match: email (deterministic)',
      'name_fuzzy: customer_name (probabilistic)',
    ]);

    await user.type(within(dialog).getByRole('textbox', { name: 'Configuration Name' }), 'Customer master');
    await pick(user, selectField(dialog, 'Entity Type'), 'Product');
    await user.click(within(dialog).getByRole('button', { name: 'Create Configuration' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const posts = calls('POST', '/api/mdm/configs');
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({
      name: 'Customer master',
      entity_type: 'product',
      master_contract_id: 'c-plain',
      matching_rules: [
        { name: 'email_match', type: 'deterministic', fields: ['email'], weight: 1, threshold: 1 },
        { name: 'name_fuzzy', type: 'probabilistic', fields: ['customer_name'], weight: 0.8, threshold: 0.8, algorithm: 'jaro_winkler' },
      ],
      survivorship_rules: [
        { field: 'email', strategy: 'most_trusted' },
        { field: 'customer_name', strategy: 'most_recent' },
      ],
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'MDM configuration "Created" created successfully' }));
  });

  it('mdm config dialog: the contract\'s own rules are sent, mapped as before', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness />);
    const dialog = await configDialog();
    await user.type(within(dialog).getByRole('textbox', { name: 'Configuration Name' }), 'CRM');
    await user.type(within(dialog).getByRole('textbox', { name: 'Description' }), 'From the CRM');
    await chooseContract(user, dialog, 'CRM contract');
    await within(dialog).findByText(/Loaded 4 matching rules/);
    await user.click(within(dialog).getByRole('button', { name: 'Create Configuration' }));
    await waitFor(() => expect(calls('POST', '/api/mdm/configs')).toHaveLength(1));
    expect(bodyOf(calls('POST', '/api/mdm/configs')[0])).toEqual({
      name: 'CRM',
      description: 'From the CRM',
      entity_type: 'customer',
      master_contract_id: 'c-rules',
      matching_rules: [
        { name: 'email_exact', type: 'deterministic', fields: ['email'], weight: 1, threshold: 1 },
        { name: 'name_fuzzy', type: 'probabilistic', fields: ['first_name', 'last_name'], weight: 0.6, threshold: 0.85, algorithm: 'levenshtein' },
        { name: 'phone', type: 'deterministic', fields: ['phone'], weight: 0.5, threshold: 1 },
        { name: 'postcode', type: 'probabilistic', fields: ['postcode'], weight: 0.3, threshold: 0.9 },
      ],
      survivorship_rules: [{ field: 'email', strategy: 'most_trusted', priority: ['CRM'] }],
    });
  });

  it('mdm config dialog: name and master contract are required, as before', async () => {
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness />);
    const dialog = await configDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Create Configuration' }));
    expect(await within(dialog).findByText('Name is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Master contract is required')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Configuration Name' })).toHaveAttribute('aria-invalid', 'true');
    expect(calls('POST', '/api/mdm/configs')).toHaveLength(0);
  });

  it('mdm config dialog: a double click sends one request, and Escape and Cancel wait while it is out', async () => {
    const held = deferred();
    mockBackend((url, init) => (url.pathname === '/api/mdm/configs' && init?.method === 'POST' ? held.promise : undefined));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness onClose={onClose} onSuccess={onSuccess} />);
    const dialog = await configDialog();
    await user.type(within(dialog).getByRole('textbox', { name: 'Configuration Name' }), 'Twice');
    await chooseContract(user, dialog, 'Web shop contract');
    await within(dialog).findByText(/Contract has no MDM rules defined/);
    await user.dblClick(within(dialog).getByRole('button', { name: 'Create Configuration' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Create Configuration' })).toBeDisabled());
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    held.release(json({ id: 'mdm-new', name: 'Twice' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(calls('POST', '/api/mdm/configs')).toHaveLength(1);
  });

  it('mdm config dialog: a failed create keeps the dialog and the input, and says why', async () => {
    mockBackend((url, init) => (url.pathname === '/api/mdm/configs' && init?.method === 'POST' ? json({ detail: 'Name taken' }, 409) : undefined));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness onSuccess={onSuccess} />);
    const dialog = await configDialog();
    await user.type(within(dialog).getByRole('textbox', { name: 'Configuration Name' }), 'Taken');
    await chooseContract(user, dialog, 'Web shop contract');
    await within(dialog).findByText(/Contract has no MDM rules defined/);
    await user.click(within(dialog).getByRole('button', { name: 'Create Configuration' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Name taken', variant: 'destructive' })));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('textbox', { name: 'Configuration Name' })).toHaveValue('Taken');
    expect(within(dialog).getByRole('button', { name: 'Create Configuration' })).toBeEnabled();
  });

  it('mdm config dialog: fields start afresh each time it opens', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithMantine(<ConfigHarness />);
    let dialog = await configDialog();
    await user.type(within(dialog).getByRole('textbox', { name: 'Configuration Name' }), 'Left over');
    await chooseContract(user, dialog, 'CRM contract');
    await within(dialog).findByText(/Loaded 4 matching rules/);
    rerender(<ConfigHarness open={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<ConfigHarness open />);
    dialog = await configDialog();
    expect(within(dialog).getByRole('textbox', { name: 'Configuration Name' })).toHaveValue('');
    expect(selectField(dialog, 'Master Data Contract')).toHaveValue('');
    expect(selectField(dialog, 'Entity Type')).toHaveValue('Customer');
    expect(within(dialog).queryByText(/Loaded 4 matching rules/)).toBeNull();
    // The list is fetched again on each open, as before
    await waitFor(() => expect(calls('GET', '/api/data-contracts')).toHaveLength(2));
  });

  it('mdm config dialog: a late answer for an earlier contract is dropped', async () => {
    const slow = deferred();
    mockBackend((url) => (url.pathname === '/api/data-contracts/c-rules' ? slow.promise : undefined));
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness />);
    const dialog = await configDialog();
    await chooseContract(user, dialog, 'CRM contract');
    await chooseContract(user, dialog, 'Web shop contract');
    await within(dialog).findByText(/Contract has no MDM rules defined/);
    slow.release(json(DETAILS['c-rules']));
    await new Promise((r) => setTimeout(r, 30));
    expect(within(dialog).getByText(/Contract has no MDM rules defined/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Loaded 4 matching rules/)).toBeNull();
  });

  it('mdm config dialog: a non-array contract list or a failed load shows no contracts, and does not crash', async () => {
    mockBackend((url) => (url.pathname === '/api/data-contracts' ? json({ detail: 'Unavailable' }, 500) : undefined));
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness />);
    const dialog = await configDialog();
    const contract = selectField(dialog, 'Master Data Contract');
    await waitFor(() => expect(contract).not.toBeDisabled());
    await user.click(contract);
    expect(await screen.findByText('No active contracts available')).toBeInTheDocument();
  });

  it('mdm config dialog: Escape in an open Select closes only the Select, in jsdom', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ConfigHarness onClose={onClose} />);
    const dialog = await configDialog();
    await user.type(within(dialog).getByRole('textbox', { name: 'Configuration Name' }), 'Keep me');
    const entity = selectField(dialog, 'Entity Type');
    await user.click(entity);
    expect(await screen.findByRole('option', { name: 'Product', hidden: true })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await new Promise((r) => setTimeout(r, 300));
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('textbox', { name: 'Configuration Name' })).toHaveValue('Keep me');
    // The next Escape is the dialog's
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Link Source Contract
// ---------------------------------------------------------------------------

function LinkHarness({ onClose = vi.fn(), onSuccess = vi.fn(), open = true, master = 'c-master' }: {
  onClose?: () => void; onSuccess?: () => void; open?: boolean; master?: string | null;
}) {
  return <LinkSourceDialog isOpen={open} configId="mdm-1" masterContractId={master ?? undefined} onClose={onClose} onSuccess={onSuccess} />;
}

const linkDialog = () => screen.findByRole('dialog', { name: 'Link Source Contract' });

async function chooseSource(user: User, dialog: HTMLElement, name: string) {
  const field = selectField(dialog, 'Source Data Contract');
  await waitFor(() => expect(field).not.toBeDisabled());
  await pick(user, field, name);
}

describe('Link Source Contract dialog', () => {
  it('link source dialog renders with Mantine and no Tailwind', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness />);
    const dialog = await linkDialog();
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(dialog.querySelector('[data-slot], .flex, .flex-wrap, .gap-2, .gap-4, .mb-2, .flex-1, .ml-1, [class*="hover:"]')).toBeNull();
    await chooseSource(user, dialog, 'CRM contract');
    await within(dialog).findByText('email_address → email');
    expectNoOldMarkup(dialog);
    expect(dialog.querySelector('.flex, .flex-wrap, .gap-2, .mb-2, .flex-1, .ml-1, [class*="hover:"]')).toBeNull();
  });

  it('link source dialog keeps every control and prop', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness onClose={onClose} />);
    const dialog = await linkDialog();
    expect(within(dialog).getByText('Link a source data contract to compare against the master.')).toBeInTheDocument();
    const source = selectField(dialog, 'Source Data Contract');
    await waitFor(() => expect(source).not.toBeDisabled());
    // Active contracts other than the master
    expect(await optionNames(user, source)).toEqual(['CRM contract', 'Web shop contract']);
    // Before a source: key column and mapping fields wait for one
    expect(within(dialog).getByRole('textbox', { name: 'Key Column' })).toBeDisabled();
    expect(within(dialog).getByRole('textbox', { name: 'Key Column' })).toHaveAttribute('placeholder', 'Select source contract first');
    expect(within(dialog).getByRole('spinbutton', { name: 'Priority' })).toHaveValue(1);
    expect(within(dialog).getByText('Higher priority sources are preferred for survivorship')).toBeInTheDocument();
    expect(within(dialog).getByText('Column Mapping (Source → Master)')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Source column' })).toBeDisabled();
    expect(within(dialog).getByRole('textbox', { name: 'Master column' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Suggest' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(buttonNames(dialog).sort()).toEqual(['Add', 'Cancel', 'Close', 'Link Source', 'Suggest']);
    // The master's schema is fetched for the mapping, once
    expect(calls('GET', '/api/data-contracts/c-master')).toHaveLength(1);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('link source dialog: choosing a source fills the key column, priority and mappings from the contract, and Link sends them', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness onSuccess={onSuccess} />);
    const dialog = await linkDialog();
    await chooseSource(user, dialog, 'CRM contract');
    // Mappings from customProperties (only real source columns), with a toast
    expect(await within(dialog).findByText('email_address → email')).toBeInTheDocument();
    expect(within(dialog).queryByText(/not_a_column/)).toBeNull();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'MDM Config Loaded' }));
    expect(within(dialog).getByText(/1 column mapping configured/)).toBeInTheDocument();
    // The key column is now a Select of the source's columns, set from mdmKeyColumn
    const key = selectField(dialog, 'Key Column');
    expect(key).toHaveValue('account_id');
    expect(await optionNames(user, key)).toEqual(['account_id', 'email_address', 'fullname', 'phone']);
    expect(within(dialog).getByRole('spinbutton', { name: 'Priority' })).toHaveValue(7);

    // Suggest: same name, then fuzzy
    await user.click(within(dialog).getByRole('button', { name: 'Suggest' }));
    expect(await within(dialog).findByText('phone → phone')).toBeInTheDocument();
    expect(within(dialog).getByText('fullname → full_name')).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mappings Suggested' }));

    // Remove one, then add one back by hand through the two Selects
    const removes = within(dialog).getAllByRole('button', { name: 'Remove' });
    expect(removes).toHaveLength(3);
    await user.click(within(within(dialog).getByText('phone → phone').closest('[data-mapping]') as HTMLElement).getByRole('button', { name: 'Remove' }));
    expect(within(dialog).queryByText('phone → phone')).toBeNull();
    const from = selectField(dialog, 'Source column');
    // Mapped source columns aren't offered again
    expect(await optionNames(user, from)).toEqual(['account_id', 'phone']);
    await pick(user, from, 'phone');
    await pick(user, selectField(dialog, 'Master column'), 'customer_id');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('phone → customer_id')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Link Source' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const posts = calls('POST', '/api/mdm/configs/mdm-1/sources');
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({
      source_contract_id: 'c-rules',
      key_column: 'account_id',
      column_mapping: { email_address: 'email', fullname: 'full_name', phone: 'customer_id' },
      priority: 7,
    });
  });

  it('link source dialog: without a master schema, mappings are typed', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness master={null} onSuccess={onSuccess} />);
    const dialog = await linkDialog();
    expect(calls('GET', /^\/api\/data-contracts\/.+/)).toHaveLength(0);
    await chooseSource(user, dialog, 'Web shop contract');
    // The key column guessed from the columns (an _id)
    await waitFor(() => expect(selectField(dialog, 'Key Column')).toHaveValue('web_id'));
    expect(within(dialog).getByRole('button', { name: 'Suggest' })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Source column' }), 'full_name');
    await user.type(within(dialog).getByRole('textbox', { name: 'Master column' }), 'name');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(within(dialog).getByText('full_name → name')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Source column' })).toHaveValue('');
    await user.clear(within(dialog).getByRole('spinbutton', { name: 'Priority' }));
    await user.type(within(dialog).getByRole('spinbutton', { name: 'Priority' }), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Link Source' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(bodyOf(calls('POST', '/api/mdm/configs/mdm-1/sources')[0])).toEqual({
      source_contract_id: 'c-plain', key_column: 'web_id', column_mapping: { full_name: 'name' }, priority: 3,
    });
  });

  it('link source dialog: a source without a schema says so, and the key column is typed', async () => {
    mockBackend((url) => (url.pathname === '/api/data-contracts/c-plain' ? json({ ...CONTRACTS[2], schema: [] }) : undefined));
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness />);
    const dialog = await linkDialog();
    await chooseSource(user, dialog, 'Web shop contract');
    expect(await within(dialog).findByText(/Could not load schema from source contract/)).toBeInTheDocument();
    const key = within(dialog).getByRole('textbox', { name: 'Key Column' });
    expect(key).toBeEnabled();
    await user.type(key, 'id');
    expect(key).toHaveValue('id');
  });

  it('link source dialog: source contract and key column are required, as before', async () => {
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness />);
    const dialog = await linkDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Link Source' }));
    expect(await within(dialog).findByText('Source contract is required')).toBeInTheDocument();
    expect(within(dialog).getByText('Key column is required')).toBeInTheDocument();
    expect(calls('POST', /sources$/)).toHaveLength(0);
  });

  it('link source dialog: a failed link keeps the dialog and says why (it used to report success)', async () => {
    mockBackend((_url, init) => (init?.method === 'POST' ? json({ detail: 'Already linked' }, 409) : undefined));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness onSuccess={onSuccess} />);
    const dialog = await linkDialog();
    await chooseSource(user, dialog, 'Web shop contract');
    await waitFor(() => expect(selectField(dialog, 'Key Column')).toHaveValue('web_id'));
    await user.click(within(dialog).getByRole('button', { name: 'Link Source' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Already linked', variant: 'destructive' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ description: 'Source contract linked successfully' }));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Link Source' })).toBeEnabled();
  });

  it('link source dialog: a double click sends one request, and Escape and Cancel wait while it is out', async () => {
    const held = deferred();
    mockBackend((_url, init) => (init?.method === 'POST' ? held.promise : undefined));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness onClose={onClose} onSuccess={onSuccess} />);
    const dialog = await linkDialog();
    await chooseSource(user, dialog, 'Web shop contract');
    await waitFor(() => expect(selectField(dialog, 'Key Column')).toHaveValue('web_id'));
    await user.dblClick(within(dialog).getByRole('button', { name: 'Link Source' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled());
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    held.release(json({ id: 'link-1' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(calls('POST', '/api/mdm/configs/mdm-1/sources')).toHaveLength(1);
  });

  it('link source dialog: fields start afresh each time it opens, and a late schema is dropped', async () => {
    const slow = deferred();
    mockBackend((url) => (url.pathname === '/api/data-contracts/c-rules' ? slow.promise : undefined));
    const user = userEvent.setup();
    const { rerender } = renderWithMantine(<LinkHarness />);
    let dialog = await linkDialog();
    await chooseSource(user, dialog, 'CRM contract');
    await chooseSource(user, dialog, 'Web shop contract');
    await waitFor(() => expect(selectField(dialog, 'Key Column')).toHaveValue('web_id'));
    // CRM's schema, late: its mapping and key column don't land on the web shop's
    slow.release(json(DETAILS['c-rules']));
    await new Promise((r) => setTimeout(r, 30));
    expect(within(dialog).queryByText('email_address → email')).toBeNull();
    expect(selectField(dialog, 'Key Column')).toHaveValue('web_id');

    rerender(<LinkHarness open={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<LinkHarness open />);
    dialog = await linkDialog();
    expect(selectField(dialog, 'Source Data Contract')).toHaveValue('');
    expect(within(dialog).getByRole('textbox', { name: 'Key Column' })).toHaveValue('');
    expect(within(dialog).getByRole('spinbutton', { name: 'Priority' })).toHaveValue(1);
  });

  it('link source dialog: a non-array contract list shows no contracts, and does not crash', async () => {
    mockBackend((url) => (url.pathname === '/api/data-contracts' ? json({ items: CONTRACTS }) : undefined));
    const user = userEvent.setup();
    renderWithMantine(<LinkHarness />);
    const dialog = await linkDialog();
    const source = selectField(dialog, 'Source Data Contract');
    await waitFor(() => expect(source).not.toBeDisabled());
    await user.click(source);
    expect(await screen.findByText('No active contracts available')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Create Match Review
// ---------------------------------------------------------------------------

function ReviewHarness({ onClose = vi.fn(), onSuccess = vi.fn(), open = true }: {
  onClose?: () => void; onSuccess?: (id: string) => void; open?: boolean;
}) {
  return <CreateReviewDialog isOpen={open} runId="run-1" candidateCount={2} onClose={onClose} onSuccess={onSuccess} />;
}

const reviewDialog = () => screen.findByRole('dialog', { name: 'Create Match Review' });

async function fillReview(user: User, dialog: HTMLElement, email = 'steward@example.com') {
  const picker = within(dialog).getByRole('textbox', { name: 'Reviewer' });
  await user.type(picker, `${email}{Enter}`);
}

describe('Create Match Review dialog', () => {
  it('create review dialog renders with Mantine and no Tailwind', async () => {
    renderWithMantine(<ReviewHarness />);
    const dialog = await reviewDialog();
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(dialog.querySelector('.p-4, .bg-muted, .text-foreground, .h-5, .flex')).toBeNull();
  });

  it('create review dialog keeps every control and prop', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ReviewHarness onClose={onClose} />);
    const dialog = await reviewDialog();
    expect(within(dialog).getByText('Create a data asset review request for stewards to approve or reject match candidates.')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('This will create a review request for 2 pending match candidates.');
    expect(within(dialog).getByRole('textbox', { name: 'Reviewer' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Notes for Reviewer' })).toHaveAttribute(
      'placeholder', 'Any additional context or instructions for the reviewer...');
    expect(buttonNames(dialog)).toEqual(expect.arrayContaining(['Cancel', 'Create Review Request', 'Close']));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('create review dialog sends the same payload and hands back the review id', async () => {
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ReviewHarness onSuccess={onSuccess} />);
    const dialog = await reviewDialog();
    await fillReview(user, dialog);
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes for Reviewer' }), 'Check the emails');
    await user.click(within(dialog).getByRole('button', { name: 'Create Review Request' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('rev-1'));
    const posts = calls('POST', '/api/mdm/runs/run-1/create-review');
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({ reviewer_email: 'steward@example.com', notes: 'Check the emails' });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Review request created with 2 candidates' }));
  });

  it('create review dialog: a reviewer is required, and an answer without an id is an error', async () => {
    mockBackend((url) => (url.pathname.endsWith('/create-review') ? json({ candidate_count: 2 }) : undefined));
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ReviewHarness onSuccess={onSuccess} />);
    const dialog = await reviewDialog();
    await user.click(within(dialog).getByRole('button', { name: 'Create Review Request' }));
    expect(await within(dialog).findByText('Valid email is required')).toBeInTheDocument();
    expect(calls('POST', /create-review$/)).toHaveLength(0);
    await fillReview(user, dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Create Review Request' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Failed to create review request - no review ID returned', variant: 'destructive' })));
    expect(onSuccess).not.toHaveBeenCalled();
    // Without notes, none is sent
    expect(bodyOf(calls('POST', /create-review$/)[0])).toEqual({ reviewer_email: 'steward@example.com' });
  });

  it('create review dialog: a double click sends one request, and Escape and Cancel wait while it is out', async () => {
    const held = deferred();
    mockBackend((url) => (url.pathname.endsWith('/create-review') ? held.promise : undefined));
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    renderWithMantine(<ReviewHarness onClose={onClose} onSuccess={onSuccess} />);
    const dialog = await reviewDialog();
    await fillReview(user, dialog);
    await user.dblClick(within(dialog).getByRole('button', { name: 'Create Review Request' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled());
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    held.release(json({ review_id: 'rev-2', candidate_count: 2 }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('rev-2'));
    expect(calls('POST', /create-review$/)).toHaveLength(1);
  });

  it('create review dialog: fields start afresh each time it opens', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithMantine(<ReviewHarness />);
    let dialog = await reviewDialog();
    await user.type(within(dialog).getByRole('textbox', { name: 'Notes for Reviewer' }), 'Left over');
    rerender(<ReviewHarness open={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    rerender(<ReviewHarness open />);
    dialog = await reviewDialog();
    expect(within(dialog).getByRole('textbox', { name: 'Notes for Reviewer' })).toHaveValue('');
  });
});
