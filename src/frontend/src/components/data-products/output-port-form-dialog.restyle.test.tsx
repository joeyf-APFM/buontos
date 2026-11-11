/**
 * Wave 2 Task 8a: the Data Product deliverable (output port) form on the kit
 * Dialog, with Mantine fields: the delivery methods, the contract choice
 * (none, an existing active or approved contract, or a new one), the PII and
 * auto-approve switches, and the payload, as the Radix dialog's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import OutputPortFormDialog from './output-port-form-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  toast.mockClear();
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/delivery-methods?status=active') {
      // The same method twice must not break the field
      return json([{ id: 'dm-1', name: 'Table Access', category: 'table' }, { id: 'dm-2', name: 'Serving Endpoint' }, { id: 'dm-1', name: 'Table Access' }]);
    }
    if (url === '/api/data-contracts') {
      return json([
        { id: 'c-1', name: 'Orders', version: '1.0.0', status: 'active' },
        { id: 'c-2', name: 'Drafty', version: '0.1.0', status: 'draft' },
        { id: 'c-3', name: 'Billing', version: '2.0.0', status: 'Approved' },
      ]);
    }
    return json([]);
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(props: Partial<Parameters<typeof OutputPortFormDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  const onSubmit = vi.fn(async () => {});
  renderWithMantine(<OutputPortFormDialog isOpen onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
  return { onOpenChange, onSubmit };
}

describe('output port form dialog', () => {
  it('output port form dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Deliverable' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Define a deliverable for this data product. Assets can be linked after creation.');
  });

  it('output port form dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Deliverable' });
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveFocus();
    expect(within(dialog).getByRole('textbox', { name: /Version/ })).toHaveValue('1.0.0');
    const method = await waitFor(() => selectField(dialog, 'Delivery Method'));
    expect(method).toHaveAttribute('placeholder', 'Select delivery method...');
    expect(await optionNames(user, method)).toEqual(['Table Accesstable', 'Serving Endpoint']);
    expect(within(dialog).getByRole('textbox', { name: 'Description' })).toHaveProperty('tagName', 'TEXTAREA');
    expect(within(dialog).getByRole('textbox', { name: 'Type' })).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox', { name: 'Status' })).toBeInTheDocument();

    const choices = within(dialog).getByRole('radiogroup', { name: 'Contract Assignment' });
    expect(within(choices).getAllByRole('radio').map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(
      ['No Contract', 'Select Existing Contract', 'Create New Contract'],
    );
    expect(within(choices).getByRole('radio', { name: 'No Contract' })).toBeChecked();

    expect(within(dialog).getByRole('switch', { name: 'Contains PII' })).not.toBeChecked();
    expect(within(dialog).getByRole('switch', { name: 'Contains PII' })).toHaveAccessibleDescription('Does this deliverable contain personally identifiable information?');
    expect(within(dialog).getByRole('switch', { name: 'Auto Approve' })).not.toBeChecked();
    expect(within(dialog).getByText(/After creating this deliverable, you can link assets/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add Deliverable' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expectNoOldMarkup(dialog);
  });

  it('output port form dialog lists only active and approved contracts, and offers a new one', async () => {
    const user = userEvent.setup();
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Add Deliverable' });
    await user.click(within(dialog).getByRole('radio', { name: 'Select Existing Contract' }));
    const contract = await waitFor(() => selectField(dialog, 'Select Existing Contract'));
    expect(contract).toHaveAttribute('placeholder', 'Choose a contract...');
    expect(await optionNames(user, contract)).toEqual(['Ordersv1.0.0', 'Billingv2.0.0']);
    expect(within(dialog).getByText('Only showing active/approved/certified contracts')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: 'Create New Contract' }));
    expect(within(dialog).getByRole('button', { name: 'Create New Contract' })).toBeInTheDocument();
  });

  it('output port form dialog submits the deliverable, and no success toast when it fails', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(async () => {});
    const { onOpenChange } = render({ onSubmit });
    const dialog = await screen.findByRole('dialog', { name: 'Add Deliverable' });
    await user.type(within(dialog).getByRole('textbox', { name: /Name/ }), 'orders_gold');
    await pick(user, await waitFor(() => selectField(dialog, 'Delivery Method')), /Serving Endpoint/);
    await user.click(within(dialog).getByRole('radio', { name: 'Select Existing Contract' }));
    await pick(user, await waitFor(() => selectField(dialog, 'Select Existing Contract')), /Billing/);
    await user.click(within(dialog).getByRole('switch', { name: 'Contains PII' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add Deliverable' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
      id: undefined, name: 'orders_gold', version: '1.0.0', description: undefined, type: undefined,
      contractId: 'c-3', deliveryMethodId: 'dm-2', status: undefined, containsPii: true, autoApprove: false,
    }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenLastCalledWith({ title: 'Success', description: 'Deliverable added' });

    // "No Contract" clears the chosen contract
    toast.mockClear();
    onSubmit.mockClear();
    onSubmit.mockRejectedValueOnce(new Error('Name taken'));
    onOpenChange.mockClear();
    await user.click(within(dialog).getByRole('radio', { name: 'No Contract' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add Deliverable' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Name taken', variant: 'destructive' })));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ contractId: undefined }));
    expect(toast.mock.calls.filter(([arg]) => arg.title === 'Success')).toHaveLength(0);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('output port form dialog fills an edited deliverable', async () => {
    render({ initial: { id: 'op-1', name: 'orders', version: '2.0.0', contractId: 'c-1', deliveryMethodId: 'dm-1', autoApprove: true } });
    const dialog = await screen.findByRole('dialog', { name: 'Edit Deliverable' });
    expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('orders');
    expect(within(dialog).getByRole('radio', { name: 'Select Existing Contract' })).toBeChecked();
    await waitFor(() => expect(selectField(dialog, 'Delivery Method')).toHaveValue('Table Access'));
    await waitFor(() => expect(selectField(dialog, 'Select Existing Contract')).toHaveValue('Orders'));
    expect(within(dialog).getByRole('switch', { name: 'Auto Approve' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });
});
