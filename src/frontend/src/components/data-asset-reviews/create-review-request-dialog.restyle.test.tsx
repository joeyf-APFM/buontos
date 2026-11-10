/**
 * Task 15: the create review request dialog on a Mantine Modal with Mantine
 * fields. Its fields, validation, payload and its (shared) reviewer picker and
 * asset tree are unchanged. Its look, focus and the picker's results above it
 * are checked in a real browser in tests/e2e/data-asset-reviews.spec.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import CreateReviewRequestDialog from './create-review-request-dialog';
import classes from './create-review-request-dialog.module.css';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const CATALOGS = [{ id: 'main', name: 'main', type: 'catalog', hasChildren: true }];
const SCHEMAS = [{ id: 'main.sales', name: 'sales', type: 'schema', hasChildren: true }];
const TABLES = [{ id: 'main.sales.orders', name: 'orders', type: 'table', hasChildren: false }];

type Api = { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

function makeApi(overrides: Partial<Record<string, unknown>> = {}): Api {
  const answers: Record<string, unknown> = {
    '/api/user/info': { data: { email: 'rita@example.com' } },
    '/api/catalogs': { data: CATALOGS },
    '/api/catalogs/main/schemas': { data: SCHEMAS },
    '/api/catalogs/main/schemas/sales/tables': { data: TABLES },
    '/api/catalogs/main/schemas/sales/views': { data: [] },
    '/api/catalogs/main/schemas/sales/functions': { data: [] },
    ...overrides,
  };
  return {
    get: vi.fn(async (url: string) => answers[url] ?? { data: [] }),
    post: vi.fn(async () => ({ data: { id: 'r-1', title: 'Orders' } })),
  };
}

function renderDialog(api: Api = makeApi()) {
  const onOpenChange = vi.fn();
  const onSubmitSuccess = vi.fn();
  renderWithMantine(
    <CreateReviewRequestDialog isOpen onOpenChange={onOpenChange} api={api as any} onSubmitSuccess={onSubmitSuccess} />,
  );
  return { api, onOpenChange, onSubmitSuccess };
}

const dialog = () => screen.findByRole('dialog', { name: 'Create New Data Asset Review Request' });
const treeRow = (id: string) => document.querySelector(`[data-node-id="${id}"]`) as HTMLElement;

async function pickOrders(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(treeRow('main')).not.toBeNull());
  await user.click(within(treeRow('main')).getByRole('button'));
  await waitFor(() => expect(treeRow('main.sales')).not.toBeNull());
  await user.click(within(treeRow('main.sales')).getByRole('button'));
  await waitFor(() => expect(treeRow('main.sales.orders')).not.toBeNull());
  await user.click(treeRow('main.sales.orders'));
}

async function addReviewer(user: ReturnType<typeof userEvent.setup>, email: string) {
  const reviewer = screen.getByRole('textbox', { name: 'Reviewer' });
  await user.type(reviewer, `${email}{Enter}`);
}

describe('the create review request dialog on Mantine', () => {
  beforeEach(() => toast.mockClear());
  afterEach(() => vi.restoreAllMocks());

  it('is a Mantine Modal with the dialog look', async () => {
    renderDialog();
    const modal = await dialog();
    expect(modal).toHaveClass('mantine-Modal-content');
    expect(modal).toHaveClass(classes.content);
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveAccessibleDescription('Select assets and assign a reviewer.');
    // No Tailwind class in the dialog's own markup (the shared asset tree
    // keeps its own until its wave)
    await waitFor(() => expect(treeRow('main')).not.toBeNull());
    const own = [...modal.querySelectorAll('[class]')].filter((el) => !el.closest(`.${classes.treeBody}`));
    expect(own.filter((el) => /(^|\s)((p|px|py|mx|mt|pt|space-y|grid-cols|h)-\S+|border-b|flex-1|flex-col)(\s|$)/.test(el.getAttribute('class') ?? ''))).toEqual([]);
  });

  it('keeps every control', async () => {
    const user = userEvent.setup();
    renderDialog();
    const modal = await dialog();

    const email = within(modal).getByRole('textbox', { name: 'Your Email' });
    await waitFor(() => expect(email).toHaveValue('rita@example.com'));
    expect(email).toBeDisabled();
    expect(email).toHaveClass('mantine-TextInput-input');
    const reviewer = within(modal).getByRole('textbox', { name: 'Reviewer' });
    expect(reviewer).toHaveAttribute('id', 'reviewer-email');
    expect(reviewer).toHaveAttribute('placeholder', 'user@example.com');
    expect(within(modal).getByText('Reviewer *').tagName).toBe('LABEL');
    expect(within(modal).getByText('Reviewer *')).toHaveAttribute('for', 'reviewer-email');
    const title = within(modal).getByRole('textbox', { name: 'Title (Optional)' });
    expect(title).toHaveAttribute('maxLength', '200');
    expect(title).toHaveAttribute('placeholder', 'Leave empty to auto-generate from selected assets');
    expect(title).toHaveClass('mantine-TextInput-input');
    const notes = within(modal).getByRole('textbox', { name: 'Notes (Optional)' });
    expect(notes.tagName).toBe('TEXTAREA');
    expect(notes).toHaveAttribute('placeholder', 'Add any relevant context for the reviewer...');
    expect(within(modal).getAllByRole('textbox')).toHaveLength(4);
    expect(within(modal).getByText('Select Assets *')).toHaveClass(classes.treeLabel);

    // The tree: the catalog, opened down to a table
    await pickOrders(user);
    expect(treeRow('main.sales.orders')).toHaveTextContent('orders');

    // Exactly these buttons: the tree's toggles (unnamed, as before: R16),
    // the corner Close, Cancel and Submit
    expect(names(within(modal).getAllByRole('button'))).toEqual(['', '', 'Cancel', 'Submit Request', 'Close']);
    expect(within(modal).getByRole('button', { name: 'Submit Request' })).toBeEnabled();
  });

  it('keeps Submit disabled until an asset is picked', async () => {
    const user = userEvent.setup();
    renderDialog();
    const modal = await dialog();
    const submit = within(modal).getByRole('button', { name: 'Submit Request' });
    expect(submit).toBeDisabled();
    await pickOrders(user);
    expect(submit).toBeEnabled();
    // A second click on the table unpicks it
    await user.click(treeRow('main.sales.orders'));
    expect(submit).toBeDisabled();
  });

  it('asks for a reviewer, in an alert in the dialog', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    const modal = await dialog();
    await pickOrders(user);
    await user.click(within(modal).getByRole('button', { name: 'Submit Request' }));
    const alert = within(modal).getByRole('alert');
    expect(alert).toHaveClass('mantine-Alert-root');
    expect(alert).toHaveTextContent('Reviewer email is required.');
    expect(api.post).not.toHaveBeenCalled();
    // Changing the title clears it
    await user.type(within(modal).getByRole('textbox', { name: 'Title (Optional)' }), 'x');
    expect(within(modal).queryByRole('alert')).toBeNull();
  });

  it('refuses to send without the requester\'s email', async () => {
    const user = userEvent.setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { api } = renderDialog(makeApi({ '/api/user/info': { error: 'down' } }));
    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByRole('textbox', { name: 'Your Email' })).toHaveValue('error@example.com'));
    await pickOrders(user);
    await addReviewer(user, 'sam@example.com');
    await user.click(within(modal).getByRole('button', { name: 'Submit Request' }));
    expect(within(modal).getByRole('alert')).toHaveTextContent('Could not verify requester email. Please refresh.');
    expect(api.post).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({ title: 'Error', description: 'Could not fetch your email.', variant: 'destructive' });
    expect(logged).toHaveBeenCalledWith('Error fetching user info:', new Error('User Info creation failed: down'));
  });

  it('sends the payload, with the title trimmed and empty notes as null', async () => {
    const user = userEvent.setup();
    const { api, onSubmitSuccess, onOpenChange } = renderDialog();
    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByRole('textbox', { name: 'Your Email' })).toHaveValue('rita@example.com'));
    await pickOrders(user);
    await addReviewer(user, 'sam@example.com');
    await user.type(within(modal).getByRole('textbox', { name: 'Title (Optional)' }), '  Orders  ');
    await user.click(within(modal).getByRole('button', { name: 'Submit Request' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith('/api/data-asset-reviews', {
      requester_email: 'rita@example.com',
      reviewer_email: 'sam@example.com',
      asset_fqns: ['main.sales.orders'],
      title: 'Orders',
      notes: null,
    });
    expect(onSubmitSuccess).toHaveBeenCalledWith({ id: 'r-1', title: 'Orders' });
    // The page closes it on success
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('stays open with the error when the request fails', async () => {
    const user = userEvent.setup();
    const api = makeApi();
    api.post.mockResolvedValue({ error: 'Reviewer unknown' });
    const { onSubmitSuccess } = renderDialog(api);
    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByRole('textbox', { name: 'Your Email' })).toHaveValue('rita@example.com'));
    await pickOrders(user);
    await addReviewer(user, 'sam@example.com');
    await user.click(within(modal).getByRole('button', { name: 'Submit Request' }));
    expect(await within(modal).findByRole('alert')).toHaveTextContent('Create Review Request creation failed: Reviewer unknown');
    expect(toast).toHaveBeenCalledWith({
      title: 'Submission Failed', description: 'Create Review Request creation failed: Reviewer unknown', variant: 'destructive',
    });
    expect(onSubmitSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(modal);
  });

  it('shows a catalog load error in the tree\'s frame', async () => {
    renderDialog(makeApi({ '/api/catalogs': { error: 'no access' } }));
    const modal = await dialog();
    const alert = await within(modal).findByRole('alert');
    expect(alert).toHaveTextContent('Catalogs creation failed: no access');
    expect(alert.closest(`.${classes.tree}`)).not.toBeNull();
  });

  it('treats a non-array catalog list as empty', async () => {
    renderDialog(makeApi({ '/api/catalogs': { data: { items: CATALOGS } } }));
    const modal = await dialog();
    await waitFor(() => expect(within(modal).getByText('Select Assets *')).toBeInTheDocument());
    await waitFor(() => expect(modal.querySelector(`.${classes.tree} .mantine-Loader-root`)).toBeNull());
    expect(treeRow('main')).toBeNull();
  });

  it('Cancel and the corner Close both close it', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    const modal = await dialog();
    await user.click(within(modal).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await user.click(within(modal).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('Escape closes it, unless a layer above it (a Radix popover or dialog) took the Escape', async () => {
    const { onOpenChange } = renderDialog();
    const modal = await dialog();
    const reviewer = within(modal).getByRole('textbox', { name: 'Reviewer' });
    // As Radix's DismissableLayer does: it handles Escape first and prevents the default
    const takeEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') e.preventDefault(); };
    document.addEventListener('keydown', takeEscape, true);
    fireEvent.keyDown(reviewer, { key: 'Escape' });
    document.removeEventListener('keydown', takeEscape, true);
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(reviewer, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

function names(els: HTMLElement[]) {
  return els.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim());
}
