/**
 * The contract metadata dialog's status: chosen when creating, read-only when
 * editing (a status change goes through Change Status), and only lifecycle
 * statuses are offered.
 */
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import DataContractBasicFormDialog from './data-contract-basic-form-dialog';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Stable, as the real store's: the dialog loads the projects when it changes
const { fetchUserProjects } = vi.hoisted(() => ({ fetchUserProjects: () => {} }));
vi.mock('@/stores/project-store', () => ({
  useProjectContext: () => ({
    currentProject: null,
    availableProjects: [],
    isLoading: false,
    fetchUserProjects,
  }),
}));

/** The dialog, once its teams (and the pickers' lists) have loaded. Creating hides the status behind "Add details". */
async function settled() {
  const details = screen.queryByRole('button', { name: 'Add details' });
  if (details) fireEvent.click(details);
  const status = await screen.findByRole('textbox', { name: /Status/ });
  await waitFor(() => expect(screen.getByRole('textbox', { name: /Owner Team/ })).toBeEnabled());
  return status;
}

describe('DataContractBasicFormDialog — status', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) } as Response),
    ) as any;
  });

  it('keeps the status read-only when editing, pointing to Change Status', async () => {
    renderWithProviders(
      <DataContractBasicFormDialog
        isOpen={true}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        initial={{ name: 'Orders', version: '1.0.0', status: 'active' }}
      />,
    );

    // A Mantine Select: jsdom gives its field the textbox role
    expect(await settled()).toBeDisabled();
    expect(screen.getByText(/The status changes with Change Status on the page/)).toBeInTheDocument();
  });

  it('offers the lifecycle statuses when creating, without certified or archived', async () => {
    renderWithProviders(
      <DataContractBasicFormDialog isOpen={true} onOpenChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    const select = await settled();
    expect(select).not.toBeDisabled();
    fireEvent.click(select);
    // Its own list (jsdom leaves a Mantine list display: none: hence hidden)
    const list = document.getElementById(select.getAttribute('aria-controls') ?? '') as HTMLElement;
    const options = within(list).getAllByRole('option', { hidden: true }).map(o => o.textContent);
    expect(options).toEqual(['Draft', 'Proposed', 'Under Review', 'Approved', 'Active', 'Deprecated', 'Retired']);
  });
});
