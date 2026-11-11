/**
 * Wave 2 Task 8b: the Data Product request dialog on the kit Dialog, with
 * named Mantine Selects for the request type, the target status, the
 * publication scope and the certification level. The payloads, toasts and
 * the wizard hand-off are unchanged (request-product-action-dialog.test.tsx).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import RequestProductActionDialog from './request-product-action-dialog';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockToast = vi.fn();
const mockLookupWorkflowId = vi.fn();

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: mockGet, post: mockPost }) }));
vi.mock('@/hooks/use-approval-wizard-trigger', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-approval-wizard-trigger')>(
    '@/hooks/use-approval-wizard-trigger',
  );
  return { ...actual, useApprovalWizardTrigger: () => ({ lookupWorkflowId: mockLookupWorkflowId }) };
});
vi.mock('@/stores/notifications-store', () => ({
  useNotificationsStore: (selector: (s: unknown) => unknown) => selector({ refreshNotifications: vi.fn() }),
}));

const LEVELS = [
  { id: 'l-2', level_order: 2, name: 'Silver', color: null },
  { id: 'l-1', level_order: 1, name: 'Bronze', color: null },
];

function renderDialog(props: Partial<Parameters<typeof RequestProductActionDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  renderWithMantine(
    <RequestProductActionDialog
      isOpen
      onOpenChange={onOpenChange}
      productId="prod-1"
      productName="Orders"
      productStatus="draft"
      {...props}
    />,
  );
  return { onOpenChange };
}

describe('RequestProductActionDialog on the kit Dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(async (url: string) =>
      url === '/api/certification-levels' ? { data: LEVELS } : { data: [] });
    mockPost.mockResolvedValue({ data: { id: 'req-1' } });
    mockLookupWorkflowId.mockResolvedValue(null);
  });

  it('request product action dialog renders on the kit Dialog', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Request Access to Product' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Orders (draft)');
  });

  it('request product action dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Request Access to Product' });

    // The request type: every type, in the old order, with review and
    // publish only where the status allows them
    const type = selectField(dialog, 'Request Type');
    expect(type).toHaveValue('Request Access');
    // The chosen type's icon stays in the field
    expect(type.closest('.mantine-InputWrapper-root')!.querySelector('.mantine-Select-section[data-position="left"] svg')).not.toBeNull();
    expect(await optionNames(user, type)).toEqual([
      'Request Status Change', 'Request Review', 'Request Publish', 'Request Certification', 'Request Access',
    ]);
    await user.click(type);
    const list = document.getElementById(type.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(within(list).getByRole('option', { name: 'Request Publish', hidden: true })).toHaveAttribute('data-combobox-disabled', 'true');
    expect(within(list).getByRole('option', { name: 'Request Review', hidden: true })).not.toHaveAttribute('data-combobox-disabled');
    await user.click(type);
    expect(within(dialog).getByText('Request permission to view and use this data product.')).toBeInTheDocument();
    // Access: the shared access fields (AccessRequestFields, also on the contract page)
    expect(within(dialog).getByRole('textbox', { name: /Reason for Access/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Access Duration' })).toBeInTheDocument();

    // Status change: the target status, from the allowed transitions, and the justification
    await pick(user, type, 'Request Status Change');
    const target = selectField(dialog, /Target Status/);
    expect(target).toHaveAttribute('placeholder', 'Select target status');
    expect(await optionNames(user, target)).toEqual(['Move to Sandbox', 'Submit for Review']);
    expect(within(dialog).getByRole('textbox', { name: /^Justification/ })).toBeInTheDocument();

    // Publish isn't offered for a draft; certify: the level, from the API, and a message
    await pick(user, type, 'Request Certification');
    const level = selectField(dialog, /Certification Level/);
    expect(level).toHaveAttribute('placeholder', 'Select certification level');
    expect(await optionNames(user, level)).toEqual(['Silver', 'Bronze']);
    expect(within(dialog).getByRole('textbox', { name: 'Message (optional)' })).toBeInTheDocument();

    // Review: a message
    await pick(user, type, 'Request Review');
    expect(within(dialog).getByRole('textbox', { name: 'Message (optional)' })).toBeInTheDocument();

    expect(within(dialog).getByRole('button', { name: 'Send Request' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(mockPost).not.toHaveBeenCalled();
    expectNoOldMarkup(dialog);
  });

  it('request product action dialog sends the chosen publication scope', async () => {
    const user = userEvent.setup();
    renderDialog({ productStatus: 'active', defaultRequestType: 'publish' });
    const dialog = await screen.findByRole('dialog', { name: 'Request Publish to Marketplace' });
    const scope = selectField(dialog, /Publication Scope/);
    expect(scope).toHaveValue('Organization');
    expect(await optionNames(user, scope)).toEqual(['Domain', 'Organization', 'External']);
    await pick(user, scope, 'External');
    await user.type(within(dialog).getByRole('textbox', { name: 'Justification (optional)' }), 'Partners ask');
    await user.click(within(dialog).getByRole('button', { name: 'Send Request' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/data-products/prod-1/request-publish', {
      scope: 'external', justification: 'Partners ask',
    }));
  });

  it('request product action dialog sends the chosen certification level', async () => {
    const user = userEvent.setup();
    renderDialog({ defaultRequestType: 'certify' });
    const dialog = await screen.findByRole('dialog', { name: 'Request Certification' });
    await user.click(within(dialog).getByRole('button', { name: 'Send Request' }));
    expect(await within(dialog).findByText('Please select a certification level')).toBeInTheDocument();
    await pick(user, selectField(dialog, /Certification Level/), 'Bronze');
    await user.click(within(dialog).getByRole('button', { name: 'Send Request' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/data-products/prod-1/request-certify', {
      certification_level: 1, message: undefined,
    }));
  });

  it('request product action dialog shows no success toast when the request fails', async () => {
    const user = userEvent.setup();
    mockPost.mockResolvedValue({ data: {}, error: 'Server said no' });
    const { onOpenChange } = renderDialog({ defaultRequestType: 'status_change', canDirectStatusChange: true });
    const dialog = await screen.findByRole('dialog', { name: 'Change Status' });
    await pick(user, selectField(dialog, /Target Status/), 'Move to Sandbox');
    await user.click(within(dialog).getByRole('button', { name: 'Change Status' }));
    expect(await within(dialog).findByText('Server said no')).toBeInTheDocument();
    expect(mockPost).toHaveBeenCalledWith('/api/data-products/prod-1/change-status', { new_status: 'sandbox' });
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
