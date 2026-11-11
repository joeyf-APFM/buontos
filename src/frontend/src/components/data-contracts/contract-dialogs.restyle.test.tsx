/**
 * Wave 2 Task 11 (part 2): the remaining Data Contract dialogs on the kit
 * Dialog, with Mantine fields: the catalog inference, the DQX schema choice,
 * linking a product, the request dialog (with the shared access fields), and
 * the inline contract create opened from a port's form. Every field,
 * default, check, payload and toast is the Radix dialogs'; a failed save shows
 * no success toast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import type { DataContract } from '@/types/data-contract';
import InferFromCatalogDialog from './infer-from-catalog-dialog';
import DqxSchemaSelectDialog from './dqx-schema-select-dialog';
import LinkProductToContractDialog from './link-product-to-contract-dialog';
import RequestContractActionDialog from './request-contract-action-dialog';
import CreateContractInlineDialog from './create-contract-inline-dialog';

const { toast, apiGet, apiPost } = vi.hoisted(() => ({ toast: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: apiGet, post: apiPost, put: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/hooks/use-domains', () => ({
  useDomains: () => ({ domains: [], loading: false, error: null, getDomainName: () => undefined, getDomainNames: () => [], getDomainById: () => undefined }),
}));
vi.mock('@/stores/notifications-store', () => ({
  useNotificationsStore: (selector: (s: { refreshNotifications: () => void }) => unknown) => selector({ refreshNotifications: vi.fn() }),
}));
// The catalog tree is the schema importer's, unchanged: a stand-in that selects one table
vi.mock('@/components/schema-importer/schema-browser', () => ({
  default: ({ connectionId, onSelectionChange }: { connectionId: string | null; onSelectionChange: (paths: Set<string>) => void }) => (
    <button type="button" disabled={!connectionId} onClick={() => onSelectionChange(new Set(['main.sales.orders']))}>Pick orders</button>
  ),
}));

const json = (body: unknown, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => JSON.stringify(body) } as Response);
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toast.mockClear();
  apiGet.mockReset();
  apiPost.mockReset();
  apiGet.mockResolvedValue({ data: [] });
  fetchMock = vi.fn((url: string) => json(url.includes('/api/access-grants/config') ? { duration_options: [30, 90], default_duration: 30 } : []));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const success = () => toast.mock.calls.filter(([arg]) => arg.variant !== 'destructive');
/** Lets open-time lookups and Mantine's mount effects finish inside act. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('infer from catalog dialog', () => {
  const render = () => {
    const onOpenChange = vi.fn();
    const onInfer = vi.fn();
    renderWithMantine(<InferFromCatalogDialog isOpen onOpenChange={onOpenChange} onInfer={onInfer} />);
    return { onOpenChange, onInfer };
  };

  it('infer from catalog dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Infer Schema from Catalog' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Browse a connected catalog and select tables or views to infer their schema into this contract.');
    await settle();
  });

  it('infer from catalog dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    apiGet.mockResolvedValue({ data: [
      { id: 'c-1', name: 'Prod UC', connector_type: 'databricks', enabled: true },
      { id: 'c-2', name: 'Lake', connector_type: 's3', enabled: true },
      { id: 'c-3', name: 'Old', connector_type: 's3', enabled: false },
    ] });
    fetchMock.mockImplementation(() => json({
      name: 'orders', path: 'main.sales.orders', asset_type: 'table',
      schema_info: { columns: [{ name: 'id', data_type: 'bigint', nullable: false }] },
    }));
    const { onInfer } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Infer Schema from Catalog' });
    const connection = await waitFor(() => selectField(dialog, 'Connection:'));
    expect(await optionNames(user, connection)).toEqual(['Prod UCdatabricks', 'Lakes3']);
    const infer = within(dialog).getByRole('button', { name: 'Infer Schema' });
    expect(infer).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);

    await pick(user, connection, /Lake/);
    expect(connection).toHaveValue('Lake');
    // The chosen connection's type shows in the field
    expect(connection.parentElement).toHaveTextContent('s3');
    await user.click(within(dialog).getByRole('button', { name: 'Pick orders' }));
    expect(within(dialog).getByText('1 selected')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Infer 1 Schema' }));
    await waitFor(() => expect(onInfer).toHaveBeenCalledWith([{
      name: 'orders', physicalName: 'main.sales.orders', description: '', physicalType: 'table',
      properties: [{ name: 'id', physicalType: 'bigint', logicalType: 'string', required: true, description: '', partitioned: false }],
    }]));
    expect(fetchMock).toHaveBeenCalledWith('/api/schema-import/metadata/c-2?path=main.sales.orders');
  });

  it('infer from catalog dialog says when no connection is configured', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Infer Schema from Catalog' });
    expect(await within(dialog).findByText('No connections configured. Add one in Settings > Connectors.')).toBeInTheDocument();
  });
});

describe('DQX schema select dialog', () => {
  const contract = { schema: [
    { name: 'orders', physicalName: 'main.sales.orders', propertyCount: 3 },
    { name: 'customers', properties: [{ name: 'id' }] },
  ] } as unknown as DataContract;
  const render = (props: Partial<Parameters<typeof DqxSchemaSelectDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn(async () => {});
    renderWithMantine(<DqxSchemaSelectDialog isOpen onOpenChange={onOpenChange} contract={contract} onConfirm={onConfirm} {...props} />);
    return { onOpenChange, onConfirm };
  };

  it('DQX schema select dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Profile Schemas with DQX' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription(/Select schemas to profile using Databricks DQX/);
  });

  it('DQX schema select dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onConfirm, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Profile Schemas with DQX' });
    expect(within(dialog).getByRole('heading', { name: 'Available Schemas' })).toBeInTheDocument();
    expect(within(dialog).getByText('main.sales.orders')).toBeInTheDocument();
    expect(within(dialog).getByText('3 columns')).toBeInTheDocument();
    expect(within(dialog).getByText('1 column')).toBeInTheDocument();
    const profile = within(dialog).getByRole('button', { name: 'Profile 0 Schemas' });
    expect(profile).toBeDisabled();
    expectNoOldMarkup(dialog);

    // Select All, then Deselect All
    await user.click(within(dialog).getByRole('button', { name: 'Select All' }));
    expect(within(dialog).getByRole('checkbox', { name: 'orders' })).toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'customers' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Deselect All' }));
    // The row toggles its schema, as does its checkbox
    await user.click(within(dialog).getByText('main.sales.orders'));
    expect(within(dialog).getByRole('checkbox', { name: 'orders' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: 'customers' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'customers' }));
    expect(within(dialog).getByRole('checkbox', { name: 'customers' })).not.toBeChecked();
    // The button's count (one schema: the locale's own plural)
    await user.click(within(dialog).getByRole('button', { name: /^Profile 1 Schema/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(['orders']));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('DQX schema select dialog says when the contract has no schema', async () => {
    render({ contract: { schema: [] } as unknown as DataContract });
    const dialog = await screen.findByRole('dialog', { name: 'Profile Schemas with DQX' });
    expect(within(dialog).getByText('No schemas defined in this contract. Add schemas first before profiling.')).toBeInTheDocument();
  });
});

describe('link product to contract dialog', () => {
  const PRODUCTS = [
    { id: 'p-1', name: 'Orders product', version: '2.0.0', status: 'active' },
    { id: 'p-2', name: '', version: '', status: 'draft' },
  ];
  const DETAIL = {
    id: 'p-1', name: 'Orders product', version: '2.0.0', status: 'active', tags: [{ tag_id: 't-1', fully_qualified_name: 'sales.orders' }],
    outputPorts: [{ name: 'linked', version: '1.0.0', contractId: 'c-9' }, { name: 'raw', version: '1.1.0' }],
  };
  const route = (putOk = true) => (url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return json({}, putOk);
    if (url === '/api/data-products') return json(PRODUCTS);
    if (url === '/api/data-products/p-1') return json(DETAIL);
    return json([]);
  };
  const render = () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    renderWithMantine(<LinkProductToContractDialog isOpen onOpenChange={onOpenChange} contractId="c-1" contractName="Orders" onSuccess={onSuccess} />);
    return { onOpenChange, onSuccess };
  };

  it('link product to contract dialog renders on the kit Dialog', async () => {
    fetchMock.mockImplementation(route());
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Link Contract to Existing Product' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Link Orders to a deliverable of an existing data product');
    await settle();
  });

  it('link product to contract dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(route());
    const { onSuccess } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Link Contract to Existing Product' });
    const product = await waitFor(() => selectField(dialog, /Select Product/));
    expect(product).toBeRequired();
    expect(await optionNames(user, product)).toEqual(['Orders productv2.0.0active', 'Unnamed ProductvN/Adraft']);
    expect(within(dialog).getByRole('button', { name: 'Link to Product' })).toBeDisabled();
    expectNoOldMarkup(dialog);

    await pick(user, product, /Orders product/);
    const assignment = await within(dialog).findByRole('radiogroup', { name: 'Deliverable Assignment' });
    expect(within(assignment).getByRole('radio', { name: 'Assign to Existing Deliverable' })).toBeChecked();
    expect(within(assignment).getByRole('radio', { name: 'Create New Deliverable' })).not.toBeChecked();
    const port = selectField(dialog, 'Select Deliverable');
    expect(port).toHaveAccessibleDescription('Only showing deliverables without an assigned contract');
    // Only the deliverable with no contract, by its index in the product's ports
    expect(await optionNames(user, port)).toEqual(['rawv1.1.0']);
    expect(within(dialog).getByText('Current deliverables: 2 (1 available for linking)')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Link to Product' }));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Please select a deliverable', variant: 'destructive' }));
    await pick(user, port, /raw/);
    await user.click(within(dialog).getByRole('button', { name: 'Link to Product' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT')!;
    expect(JSON.parse(init.body)).toMatchObject({
      tags: ['sales.orders'],
      outputPorts: [{ name: 'linked', contractId: 'c-9' }, { name: 'raw', version: '1.1.0', contractId: 'c-1' }],
    });
    expect(toast).toHaveBeenLastCalledWith({ title: 'Contract Linked', description: 'Contract "Orders" successfully linked to product deliverable' });
  });

  it('link product to contract dialog creates a new deliverable, and shows no success toast when the link fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(route(false));
    const { onSuccess } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Link Contract to Existing Product' });
    await pick(user, await waitFor(() => selectField(dialog, /Select Product/)), /Orders product/);
    await user.click(await within(dialog).findByRole('radio', { name: 'Create New Deliverable' }));
    const name = within(dialog).getByRole('textbox', { name: /Deliverable Name/ });
    expect(name).toBeRequired();
    expect(within(dialog).getByRole('textbox', { name: /Deliverable Version/ })).toHaveValue('1.0.0');
    await user.type(name, 'analytics-output');
    await user.click(within(dialog).getByRole('button', { name: 'Link to Product' }));
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Failed to link contract to product', variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('request contract action dialog', () => {
  const render = (props: Partial<Parameters<typeof RequestContractActionDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    renderWithMantine(
      <RequestContractActionDialog isOpen onOpenChange={onOpenChange} contractId="c-1" contractName="Orders" contractStatus="active" onSuccess={onSuccess} {...props} />,
    );
    return { onOpenChange, onSuccess };
  };
  beforeEach(() => {
    apiGet.mockImplementation(async (url: string) => (
      url.includes('deployment-policy')
        ? { data: { allowed_catalogs: ['main', 'sandbox'], allowed_schemas: ['*'], default_catalog: 'main', require_approval: true } }
        : url.includes('certification-levels')
          ? { data: [{ id: 'l-1', level_order: 1, name: 'Bronze', color: null }, { id: 'l-1b', level_order: 1, name: 'Bronze again', color: null }] }
          : { data: [] }
    ));
  });

  it('request contract action dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Request Action' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Select the type of request you want to submit for this data contract.');
    await settle();
  });

  it('request contract action dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Request Action' });
    expect(within(dialog).getByText('c-1')).toBeInTheDocument();
    const type = selectField(dialog, 'Request Type *');
    expect(type).toHaveValue('Request Deploy to Unity Catalog');
    expect(await optionNames(user, type)).toEqual([
      'Request Status Change', 'Request Deploy to Unity Catalog', 'Request Data Steward Review',
      'Request Publish', 'Request Certification', 'Request Access to Contract',
    ]);
    // Review needs a draft: its option is disabled for an active contract
    await user.click(type);
    expect(screen.getByRole('option', { name: 'Request Data Steward Review', hidden: true })).toHaveAttribute('data-combobox-disabled', 'true');
    await user.click(type);

    // Deploy: the policy's catalogs as a Select, any schema as text
    const catalog = await waitFor(() => selectField(dialog, 'Target Catalog (Optional)'));
    expect(catalog).toHaveValue('main');
    expect(await optionNames(user, catalog)).toEqual(['main', 'sandbox']);
    expect(within(dialog).getByText('Default catalog for your role')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Target Schema (Optional)' })).toBeInTheDocument();
    expect(within(dialog).getByText('You can deploy to any schema')).toBeInTheDocument();
    expect(within(dialog).getByText(/allowed catalogs/)).toHaveTextContent('Deployment Policy: You can deploy to 2 allowed catalogs (requires approval)');
    expect(within(dialog).getByRole('button', { name: 'Send Request' })).toBeEnabled();
    expectNoOldMarkup(dialog);

    // Certify: one option per level
    await pick(user, type, 'Request Certification');
    expect(await optionNames(user, selectField(dialog, 'Certification Level *'))).toEqual(['Bronze']);

    // Status change: the transitions, and the lifecycle with the current status picked out
    await pick(user, type, 'Request Status Change');
    expect(selectField(dialog, 'Select Target Status *')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Justification *' })).toHaveAccessibleDescription('Minimum 20 characters required. This will be reviewed by an admin.');
    expect(within(dialog).getByText('active', { selector: 'span' })).toHaveClass(/current/);
  });

  it('request contract action dialog sends an access request through the shared access fields', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue({ data: {} });
    const { onSuccess, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Request Action' });
    await pick(user, selectField(dialog, 'Request Type *'), 'Request Access to Contract');
    const reason = within(dialog).getByRole('textbox', { name: /Reason for Access/ });
    const duration = selectField(dialog, 'Access Duration');
    await waitFor(() => expect(duration).toBeEnabled());
    // The config's two durations (the months' plural is the locale's own)
    expect(await optionNames(user, duration)).toHaveLength(2);
    await user.click(within(dialog).getByRole('button', { name: 'Send Request' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please provide a reason for requesting access');
    expect(apiPost).not.toHaveBeenCalled();

    await user.type(reason, 'Quarterly revenue reporting');
    await pick(user, duration, /^3 /);
    await user.click(within(dialog).getByRole('button', { name: 'Send Request' }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith('/api/access-grants/request', {
      entity_type: 'data_contract', entity_id: 'c-1', reason: 'Quarterly revenue reporting',
      requested_permission_level: 'READ', requested_duration_days: 90,
    }));
    expect(onSuccess).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('request contract action dialog shows no success toast when the request fails', async () => {
    const user = userEvent.setup();
    apiPost.mockResolvedValue({ data: {}, error: 'Deploy refused' });
    const { onSuccess, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Request Action' });
    await user.click(within(dialog).getByRole('button', { name: 'Send Request' }));
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    // The error stays in the dialog too
    expect(within(dialog).getByText(toast.mock.calls[toast.mock.calls.length - 1][0].description)).toBeInTheDocument();
  });
});

describe('create contract inline dialog', () => {
  const render = () => {
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    renderWithMantine(<CreateContractInlineDialog isOpen onOpenChange={onOpenChange} onSuccess={onSuccess} prefillData={{ tenant: 'acme', owner_team_id: 't-1' }} />);
    return { onOpenChange, onSuccess };
  };

  it('create contract inline dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Create New Contract' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Create a minimal data contract. You can add schemas and quality rules later.');
  });

  it('create contract inline dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() => json({ id: 'c-new' }));
    const { onSuccess, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Create New Contract' });
    const name = within(dialog).getByRole('textbox', { name: /Contract Name/ });
    expect(name).toHaveFocus();
    expect(name).toBeRequired();
    expect(within(dialog).getByRole('textbox', { name: /Version/ })).toHaveValue('1.0.0');
    const status = selectField(dialog, 'Status');
    expect(status).toHaveValue('Draft');
    expect(await optionNames(user, status)).toEqual(['Draft', 'Proposed', 'Under Review', 'Active', 'Approved']);
    expect(within(dialog).getByText('Domains')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Tenant' })).toHaveValue('acme');
    const owner = within(dialog).getByRole('textbox', { name: 'Owner Team ID' });
    expect(owner).toHaveValue('t-1');
    expect(owner).toHaveAccessibleDescription('Optional: Inherited from product if available');
    // The domain picker is the shared one, unchanged: the rest of the form is checked
    const copy = dialog.cloneNode(true) as HTMLElement;
    const domains = within(copy).getByText('Domains').closest('.mantine-InputWrapper-root')!;
    [...domains.children].filter((child) => child.textContent !== 'Domains').forEach((child) => child.remove());
    expectNoOldMarkup(copy);

    await user.click(within(dialog).getByRole('button', { name: 'Create Contract' }));
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Contract name is required', variant: 'destructive' }));
    await user.type(name, 'Orders');
    await pick(user, status, 'Proposed');
    await user.click(within(dialog).getByRole('button', { name: 'Create Contract' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('c-new'));
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(url).toBe('/api/data-contracts');
    expect(JSON.parse(init.body)).toEqual({
      name: 'Orders', version: '1.0.0', status: 'proposed', kind: 'DataContract', apiVersion: '3.0.2', owner_team_id: 't-1', tenant: 'acme',
    });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenLastCalledWith({ title: 'Contract Created', description: 'Contract "Orders" (v1.0.0) created successfully' });
  });

  it('create contract inline dialog shows no success toast when the create fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(() => json('Name taken', false));
    const { onSuccess, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Create New Contract' });
    await user.type(within(dialog).getByRole('textbox', { name: /Contract Name/ }), 'Orders');
    await user.click(within(dialog).getByRole('button', { name: 'Create Contract' }));
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'destructive' })));
    expect(success()).toHaveLength(0);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
