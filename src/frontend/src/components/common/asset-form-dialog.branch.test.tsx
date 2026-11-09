/**
 * The asset and connection forms offer a Branch select (where the data lives) and send it on save.
 *
 * Radix Select hangs when opened in jsdom, so the select is replaced by a plain listbox that
 * is always open; what is under test is the form's options, values and payload.
 */
import { createContext, useContext } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AssetFormDialog } from './asset-form-dialog';
import { ConnectionFormDialog } from '@/components/settings/connection-form-dialog';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => api }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/ui/domain-multi-selector', () => ({ default: () => null }));
vi.mock('@/components/ui/select', () => {
  type Ctx = { value?: string; onValueChange?: (v: string) => void };
  const SelectCtx = createContext<Ctx>({});
  return {
    Select: ({ value, onValueChange, children }: Ctx & { children: React.ReactNode }) => (
      <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>
    ),
    SelectTrigger: ({ children, ...rest }: any) => <button type="button" role="combobox" {...rest}>{children}</button>,
    SelectValue: () => null,
    SelectContent: ({ children }: any) => <div role="listbox">{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const ctx = useContext(SelectCtx);
      return (
        <div role="option" aria-selected={ctx.value === value} onClick={() => ctx.onValueChange?.(value)}>
          {children}
        </div>
      );
    },
  };
});

/** The option list of the Branch select: the listbox that has a "Not set" option. */
function branchOptions() {
  const listbox = screen.getAllByRole('listbox').find((l) => within(l).queryByRole('option', { name: 'Not set' }));
  expect(listbox).toBeDefined();
  return within(listbox!).getAllByRole('option');
}

describe('asset form branch', () => {
  const props = {
    isOpen: true, onOpenChange: vi.fn(), onSuccess: vi.fn(),
    assetTypeId: 'type-1', assetTypeName: 'Table',
  };

  it('offers Unity Catalog, Internal, External and Not set', async () => {
    render(<AssetFormDialog {...props} />);
    expect(await screen.findByRole('combobox', { name: 'Branch' })).toBeInTheDocument();
    expect(branchOptions().map((o) => o.textContent)).toEqual(['Unity Catalog', 'Internal', 'External', 'Not set']);
  });

  it('sends the chosen branch when saving', async () => {
    api.post.mockResolvedValue({ data: { id: 'a1' } });
    render(<AssetFormDialog {...props} />);
    await userEvent.type(await screen.findByPlaceholderText(/Enter table name/i), 'Orders');
    await userEvent.click(within(screen.getAllByRole('listbox').find((l) => within(l).queryByRole('option', { name: 'Not set' }))!)
      .getByRole('option', { name: 'External' }));
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.lastCall![1]).toMatchObject({ name: 'Orders', data_branch: 'external' });
  });

  it('sends null when the branch is not set', async () => {
    api.post.mockClear();
    api.post.mockResolvedValue({ data: { id: 'a1' } });
    render(<AssetFormDialog {...props} />);
    await userEvent.type(await screen.findByPlaceholderText(/Enter table name/i), 'Orders');
    await userEvent.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.lastCall![1].data_branch).toBeNull();
  });

  it('shows the branch of the asset being edited', async () => {
    render(<AssetFormDialog {...props} asset={{
      id: 'a1', name: 'Orders', asset_type_id: 'type-1', status: 'active', data_branch: 'internal',
      relationships: [], created_at: '', updated_at: '',
    }} />);
    await screen.findByRole('combobox', { name: 'Branch' });
    await waitFor(() => {
      const selected = branchOptions().filter((o) => o.getAttribute('aria-selected') === 'true');
      expect(selected.map((o) => o.textContent)).toEqual(['Internal']);
    });
  });
});

describe('connection form branch', () => {
  const connection = (connector_type: string) => ({
    id: 'c1', name: 'Conn', connector_type, description: null, config: {},
    enabled: true, is_default: false, system_asset_id: null, data_branch: 'internal' as const,
    created_by: 'me', created_at: '', updated_at: '',
  });
  const renderForm = (connector_type: string) => {
    api.get.mockResolvedValue({ data: [] });
    return render(
      <ConnectionFormDialog isOpen onOpenChange={vi.fn()} onSubmitSuccess={vi.fn()}
        initialConnection={connection(connector_type)} />,
    );
  };

  it('offers Internal, External and Not set', async () => {
    renderForm('snowflake');
    await screen.findByRole('combobox', { name: 'Branch' });
    await waitFor(() => {
      const options = branchOptions();
      expect(options.map((o) => o.textContent)).toEqual(['Internal', 'External', 'Not set']);
      expect(options.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent))
        .toEqual(['Internal']);
    });
  });

  it('has no branch for Databricks, whose assets are always Unity Catalog', async () => {
    renderForm('databricks');
    await screen.findByDisplayValue('Conn');
    expect(screen.queryByRole('combobox', { name: 'Branch' })).not.toBeInTheDocument();
  });
});
