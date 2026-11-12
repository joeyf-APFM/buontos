/**
 * Wave 2 Task 11: the contract page's "create a data product from this
 * contract" dialog on the kit Dialog, with Mantine fields. The fields,
 * defaults, checks, payload and toasts are the Radix dialog's; a failed create
 * shows its error and no success toast.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import CreateFromContractDialog from './create-from-contract-dialog';

const { toast, post } = vi.hoisted(() => ({ toast: vi.fn(), post: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: vi.fn(), post, put: vi.fn(), delete: vi.fn() }) }));

beforeEach(() => {
  toast.mockClear();
  post.mockReset();
});

const render = () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  renderWithMantine(<CreateFromContractDialog isOpen onOpenChange={onOpenChange} contractId="c-1" contractName="Orders" onSuccess={onSuccess} />);
  return { onOpenChange, onSuccess };
};

describe('create from contract dialog', () => {
  it('create from contract dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product from Contract' });
    expectKitDialog(dialog);
  });

  it('create from contract dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: { id: 'p-9' } });
    const { onSuccess, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product from Contract' });
    expect(within(dialog).getByText('c-1')).toBeInTheDocument();
    expect(within(dialog).getByText('Orders')).toBeInTheDocument();
    const name = within(dialog).getByRole('textbox', { name: /Product Name/ });
    const type = selectField(dialog, /Product Type/);
    expect(type).toHaveValue('Source Aligned');
    expect(await optionNames(user, type)).toEqual(['Source', 'Source Aligned', 'Aggregate', 'Consumer Aligned', 'Sink']);
    expect(within(dialog).getByRole('textbox', { name: /Version/ })).toHaveValue('v1.0.0');
    const port = within(dialog).getByRole('textbox', { name: /Deliverable Name/ });
    expect(port).toHaveAccessibleDescription(/.+/);
    const create = within(dialog).getByRole('button', { name: 'Create Product' });
    expect(create).toBeDisabled();
    expectNoOldMarkup(dialog);

    await user.type(name, ' Orders product ');
    await pick(user, type, 'Aggregate');
    await user.click(create);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/data-products/from-contract', {
      contract_id: 'c-1', product_name: 'Orders product', product_type: 'aggregate', version: 'v1.0.0', output_port_name: undefined,
    }));
    expect(onSuccess).toHaveBeenCalledWith('p-9');
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0].variant).toBeUndefined();
  });

  it('create from contract dialog shows its error and no success toast when the create fails', async () => {
    const user = userEvent.setup();
    post.mockResolvedValue({ data: null, error: 'Name taken' });
    const { onSuccess, onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: 'Create Data Product from Contract' });
    await user.type(within(dialog).getByRole('textbox', { name: /Product Name/ }), 'Orders product');
    await user.click(within(dialog).getByRole('button', { name: 'Create Product' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Name taken');
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Name taken', variant: 'destructive' }));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
