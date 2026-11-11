/**
 * Wave 2 Task 11 fix round 1 (ruling R40): the self-service dialog (Home,
 * Data Curation) on the kit Dialog, with Mantine fields, so the column
 * editor's quality check form (a kit Dialog) opens on top of it. The fields,
 * defaults, payload and the pre-creation checks are the Radix dialog's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import SelfServiceDialog from './self-service-dialog';

vi.mock('@/stores/project-store', () => ({ useProjectContext: () => ({ currentProject: { id: 'proj-1' } }) }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: vi.fn(async () => ({ data: [] })), post: vi.fn() }) }));

const reply = (body: unknown, status = 200) => ({
  ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => body, text: async () => JSON.stringify(body),
});
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => (url === '/api/self-service/bootstrap' ? reply({ defaults: { catalog: 'user_jdoe', schema: 'sandbox' } }) : reply({})));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const render = (initialType?: 'catalog' | 'schema' | 'table') => {
  const onOpenChange = vi.fn();
  renderWithMantine(<SelfServiceDialog isOpen onOpenChange={onOpenChange} initialType={initialType} />);
  return { onOpenChange };
};

describe('self-service dialog', () => {
  it('self-service dialog renders on the kit Dialog', async () => {
    render();
    const dialog = await screen.findByRole('dialog', { name: 'Self-service data curation' });
    expectKitDialog(dialog);
    await settle();
  });

  it('self-service dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = render('table');
    const dialog = await screen.findByRole('dialog', { name: 'Self-service data curation' });
    const type = selectField(dialog, 'What to create');
    expect(type).toHaveValue('Table');
    expect(await optionNames(user, type)).toEqual(['Catalog', 'Schema', 'Table']);
    // The bootstrap's defaults
    await waitFor(() => expect(within(dialog).getByRole('textbox', { name: 'Catalog' })).toHaveValue('user_jdoe'));
    expect(within(dialog).getByRole('textbox', { name: 'Schema' })).toHaveValue('sandbox');
    const table = within(dialog).getByRole('region', { name: 'Table definition' });
    expect(within(table).getByRole('textbox', { name: 'Table name' })).toBeInTheDocument();
    const contract = within(dialog).getByRole('checkbox', { name: 'Create as Data Contract' });
    expect(contract).toBeChecked();
    const create = within(dialog).getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();
    // The column editor (SchemaPropertyEditor) is shared and unchanged: the rest is checked
    const copy = dialog.cloneNode(true) as HTMLElement;
    [...copy.querySelector('section')!.children].slice(2).forEach((child) => child.remove());
    expectNoOldMarkup(copy);

    await user.type(within(table).getByRole('textbox', { name: 'Table name' }), 'clicks');
    await user.click(contract);
    await user.click(create);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/self-service/create', expect.anything()));
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/self-service/create')!;
    expect(JSON.parse(init.body)).toEqual({
      type: 'table', catalog: 'user_jdoe', schema: 'sandbox', createContract: false,
      defaultToUserCatalog: true, projectId: 'proj-1', table: { name: 'clicks', columns: [] },
    });
    expect(await within(dialog).findByText(/Created:/)).toBeInTheDocument();

    // The footer's Close (the corner close, last in the content, has the same name)
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('self-service dialog shows the pre-creation checks that failed', async () => {
    const user = userEvent.setup();
    render('catalog');
    const dialog = await screen.findByRole('dialog', { name: 'Self-service data curation' });
    fetchMock.mockImplementation(async () => reply({
      detail: {
        message: 'Naming rules not met',
        workflows: [
          { workflow_name: 'Naming', status: 'failed', step_results: [{ step_id: 's-1', passed: false, policy_name: 'Prefix', message: 'Use a user_ prefix' }] },
          { workflow_name: 'Owner', status: 'passed' },
        ],
      },
    }, 400));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Create' })).toBeEnabled());
    await pick(user, selectField(dialog, 'What to create'), 'Catalog');
    await user.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await within(dialog).findByText('Pre-creation validation failed')).toBeInTheDocument();
    expect(within(dialog).getByText('Naming rules not met')).toBeInTheDocument();
    expect(within(dialog).getByText('Prefix:')).toBeInTheDocument();
    expect(within(dialog).getByText('Use a user_ prefix')).toBeInTheDocument();
    expect(within(dialog).getByText('passed')).toBeInTheDocument();
  });
});
