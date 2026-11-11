/**
 * Wave 2 Task 8a: linking a contract to a deliverable, on the kit Dialog.
 * The shared EntityVersionPicker is consumed as it is (stubbed here, so the
 * test drives the dialog); the product read, the PUT with the port's new
 * contract, and the toasts are the Radix dialog's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import LinkContractToPortDialog from './link-contract-to-port-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

vi.mock('@/components/common/entity-version-picker', () => ({
  default: ({ onChange, placeholder, statusFilter }: { onChange: (v: unknown) => void; placeholder?: string; statusFilter?: string[] }) => (
    <button type="button" data-status={statusFilter?.join(',')} onClick={() => onChange({ scope: 'entity', entityKind: 'contract', entityId: 'c-9' })}>
      {placeholder}
    </button>
  ),
}));

const PRODUCT = {
  id: 'p-1', name: 'Orders', tags: [{ tag_id: 't-1', fully_qualified_name: 'pii/none' }],
  outputPorts: [{ name: 'orders_gold', version: '1.0.0' }, { name: 'orders_api', version: '2.0.0' }],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let putStatus = 200;
const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
  init?.method === 'PUT' ? json({}, putStatus) : json(PRODUCT));

beforeEach(() => {
  toast.mockClear();
  fetchMock.mockClear();
  putStatus = 200;
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render() {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  renderWithMantine(
    <LinkContractToPortDialog isOpen onOpenChange={onOpenChange} productId="p-1" portIndex={1}
      currentPort={{ name: 'orders_api', version: '2.0.0', description: 'The API' }} onSuccess={onSuccess} />,
  );
  return { onOpenChange, onSuccess };
}

const TITLE = 'Link Contract to Deliverable';

describe('link contract to port dialog', () => {
  it('link contract to port dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Select an existing contract or create a new one to link to orders_api');
  });

  it('link contract to port dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(within(dialog).getByText('Deliverable')).toBeInTheDocument();
    expect(within(dialog).getByText('v2.0.0')).toBeInTheDocument();
    expect(within(dialog).getByText('The API')).toBeInTheDocument();
    expect(within(dialog).getByText('Select Contract')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Choose a contract…' })).toHaveAttribute('data-status', 'active,approved');
    expect(within(dialog).getByText(/Only showing contracts with 'active' or 'approved' status/)).toBeInTheDocument();
    expect(within(dialog).getByText('OR')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create New Contract' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Link Contract' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expectNoOldMarkup(dialog);
  });

  it('link contract to port dialog puts the chosen contract on the port', async () => {
    const user = userEvent.setup();
    const { onSuccess } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(within(dialog).getByRole('button', { name: 'Choose a contract…' }));
    await user.click(within(dialog).getByRole('button', { name: 'Link Contract' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!;
    expect(put[0]).toBe('/api/data-products/p-1');
    const body = JSON.parse(String(put[1]!.body));
    expect(body.outputPorts).toEqual([{ name: 'orders_gold', version: '1.0.0' }, { name: 'orders_api', version: '2.0.0', contractId: 'c-9' }]);
    expect(body.tags).toEqual(['pii/none']);
    expect(toast).toHaveBeenCalledWith({ title: 'Contract Linked', description: 'Contract successfully linked to deliverable' });
  });

  it('link contract to port dialog shows no success toast when the link fails', async () => {
    const user = userEvent.setup();
    putStatus = 500;
    const { onSuccess } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(within(dialog).getByRole('button', { name: 'Choose a contract…' }));
    await user.click(within(dialog).getByRole('button', { name: 'Link Contract' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Failed to link contract', variant: 'destructive' })));
    expect(toast.mock.calls.filter(([arg]) => arg.title === 'Contract Linked')).toHaveLength(0);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Link Contract' })).toBeEnabled();
  });
});
