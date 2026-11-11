/**
 * Wave 2 Task 8a fix round 1 (ruling R37): the DQX suggestions dialog
 * (contract page) on the kit Dialog, so the new-version prompt it opens for a
 * non-draft contract stacks over it. The suggestions, the selection, the
 * accept and reject calls and the toasts are the Radix dialog's. The stacking
 * in a real browser is in tests/e2e/dqx-suggestions.spec.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import type { DataContract } from '@/types/data-contract';
import table from '@/components/ui/data-table.module.css';
import DqxSuggestionsDialog from './dqx-suggestions-dialog';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const suggestion = (id: string, schema: string, property: string | null, status = 'pending') => ({
  id, schema_name: schema, property_name: property, status, name: 'not_null', dimension: 'completeness',
  severity: 'error', rule: `${property ?? 'row'} IS NOT NULL`,
});

let suggestions: unknown[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith('/suggestions/accept')) return new Response(JSON.stringify({ accepted_count: 1 }), { status: 200 });
  if (url.endsWith('/suggestions/reject')) return new Response(JSON.stringify({ rejected_count: 1 }), { status: 200 });
  void init;
  return new Response(JSON.stringify(suggestions), { status: 200 });
});

beforeEach(() => {
  toast.mockClear();
  fetchMock.mockClear();
  suggestions = [suggestion('s-1', 'orders', 'order_id'), suggestion('s-2', 'orders', null), suggestion('s-3', 'orders', 'x', 'accepted')];
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const CONTRACT = { id: 'c-1', name: 'Orders', version: '1.0.0', status: 'active' } as unknown as DataContract;
const TITLE = 'Review Quality Check Suggestions';

function render(contract: DataContract = CONTRACT) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  renderWithMantine(
    <DqxSuggestionsDialog isOpen onOpenChange={onOpenChange} contractId="c-1" contract={contract} profileRunId="run-1" onSuccess={onSuccess} />,
  );
  return { onOpenChange, onSuccess };
}

describe('DQX suggestions dialog', () => {
  it('DQX suggestions dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Review and accept DQX-generated quality check suggestions for your contract');
  });

  it('DQX suggestions dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(await within(dialog).findByText('2 pending suggestions')).toBeInTheDocument();
    expect(within(dialog).getByText('0 selected')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/data-contracts/c-1/profile-runs/run-1/suggestions');
    // One schema: its name over the table of its pending suggestions
    expect(within(dialog).getByText('orders')).toBeInTheDocument();
    for (const name of ['Column', 'Rule Type', 'Dimension', 'Severity', 'Rule']) {
      expect(within(dialog).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(within(dialog).getByText('Table-level')).toBeInTheDocument();
    const rule = within(dialog).getByText('order_id IS NOT NULL');
    expect(rule).toHaveAttribute('title', 'order_id IS NOT NULL');

    expect(within(dialog).getByRole('button', { name: 'Reject Selected' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Accept Selected' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Select All' }));
    expect(within(dialog).getByText('2 selected')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Deselect All' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Accept Selected' })).toBeEnabled();

    const closes = within(dialog).getAllByRole('button', { name: 'Close' });
    await user.click(closes[0]);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    // The dialog's own markup: the shared DataTable is consumed as it is, but
    // the cells this dialog draws in it are checked
    const own = dialog.cloneNode(true) as HTMLElement;
    own.querySelectorAll(`.${table.root}`).forEach((node) => node.remove());
    expectNoOldMarkup(own);
    for (const cell of within(dialog).getAllByRole('cell')) {
      expect(cell.querySelector('.font-mono, .text-muted-foreground, .italic, .truncate, .text-xs, .text-sm')).toBeNull();
    }
  });

  it('DQX suggestions dialog puts several schemas in tabs, with their counts', async () => {
    const user = userEvent.setup();
    suggestions = [suggestion('s-1', 'orders', 'a'), suggestion('s-2', 'orders', 'b'), suggestion('s-3', 'customers', 'c')];
    render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    const tabs = await within(dialog).findByRole('tablist');
    expect(within(tabs).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['orders2', 'customers1']);
    await user.click(within(tabs).getByRole('tab', { name: /customers/ }));
    expect(within(within(dialog).getByRole('tabpanel')).getByText('c IS NOT NULL')).toBeInTheDocument();
  });

  it('DQX suggestions dialog says so when nothing is pending', async () => {
    suggestions = [suggestion('s-3', 'orders', 'x', 'accepted')];
    render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    expect(await within(dialog).findByText('No pending suggestions. All suggestions have been reviewed.')).toBeInTheDocument();
  });

  it('DQX suggestions dialog accepts a draft contract\'s suggestions directly', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = render({ ...CONTRACT, status: 'draft' } as DataContract);
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(await within(dialog).findByRole('button', { name: 'Select All' }));
    await user.click(within(dialog).getByRole('button', { name: 'Accept Selected' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const accept = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/accept'))!;
    expect(JSON.parse(String(accept[1]!.body))).toEqual({ suggestion_ids: ['s-1', 's-2'] });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('DQX suggestions dialog stacks the version prompt over itself for a non-draft contract; Escape closes only the prompt', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onSuccess } = render();
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(await within(dialog).findByRole('button', { name: 'Select All' }));
    await user.click(within(dialog).getByRole('button', { name: 'Accept Selected' }));
    const prompt = await screen.findByRole('alertdialog', { name: 'Create New Version' });
    expectKitDialog(prompt);
    // Both are kit Dialogs, so the prompt opened last is on top
    await waitFor(() => expect(within(prompt).getByRole('button', { name: 'Cancel' })).toHaveFocus());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByRole('dialog', { name: TITLE })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    // Through the prompt: the new version goes with the accept
    await user.click(within(dialog).getByRole('button', { name: 'Accept Selected' }));
    const again = await screen.findByRole('alertdialog', { name: 'Create New Version' });
    const field = within(again).getByRole('textbox', { name: 'New Version String' });
    await user.clear(field);
    await user.type(field, '2.0.0');
    await user.click(within(again).getByRole('button', { name: 'Create Version' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const accept = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/accept'))!;
    expect(JSON.parse(String(accept[1]!.body))).toEqual({ suggestion_ids: ['s-1', 's-2'], bump_version: { new_version: '2.0.0' } });
  });

  it('DQX suggestions dialog shows no success toast when the accept fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) =>
      String(input).endsWith('/accept') ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(suggestions), { status: 200 }));
    const { onOpenChange, onSuccess } = render({ ...CONTRACT, status: 'draft' } as DataContract);
    const dialog = await screen.findByRole('dialog', { name: TITLE });
    await user.click(await within(dialog).findByRole('button', { name: 'Select All' }));
    await user.click(within(dialog).getByRole('button', { name: 'Accept Selected' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Failed to accept suggestions', variant: 'destructive' })));
    expect(toast.mock.calls.filter(([arg]) => arg.title === 'Success')).toHaveLength(0);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
