/**
 * Wave 2 Task 8b: the approval wizard on the kit Dialog. Its title, the
 * state's description and the state's actions (the chooser's Cancel, a
 * step's Cancel and Next or Complete, the completion's Close) stay in the
 * kit's header and footer; the step's fields are Mantine, each Select named.
 * Every step, its navigation and its validation are covered by
 * approval-wizard.restyle.test.tsx and approval-wizard-dialog.test.tsx.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import ApprovalWizardDialog, { FetchedSelectField } from './approval-wizard-dialog';

const { mockGet, mockPost, mockToast } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn(), mockToast: vi.fn() }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: mockGet, post: mockPost }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (s: unknown) => unknown) =>
    selector({ userInfo: { email: 'a@example.com', groups: ['sales', 'finance'] }, fetchUserInfo: vi.fn() }),
}));

const STEPS = [
  {
    step_id: 'reason', name: 'Business reason', step_type: 'user_action', order: 0,
    config: {
      required_fields: [
        { id: 'reason', label: 'Business reason', type: 'text', required: true },
        { id: 'workspace', label: 'Target workspace', type: 'select', required: true, options: [{ value: 'prod', label: 'Production' }, { value: 'dev', label: 'Development' }] },
      ],
    },
  },
  {
    step_id: 'obo', name: 'On behalf of', step_type: 'on_behalf_of', order: 1,
    config: {},
  },
];

const WORKFLOWS = [
  { id: 'wf-1', name: 'Request access', steps: STEPS },
  { id: 'wf-2', name: 'Request review', steps: STEPS },
];

function renderWizard(props: Partial<Parameters<typeof ApprovalWizardDialog>[0]> = {}) {
  const onOpenChange = vi.fn();
  renderWithMantine(
    <ApprovalWizardDialog isOpen onOpenChange={onOpenChange} entityType="data_product" entityId="dp-1" entityName="Orders" {...props} />,
  );
  return { onOpenChange };
}

describe('ApprovalWizardDialog on the kit Dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation(async (url: string) =>
      url === '/api/workflows/wf-1' ? { data: WORKFLOWS[0] } : { data: { workflows: WORKFLOWS, total: 2 } });
    mockPost.mockImplementation(async (url: string, body: { step_id?: string }) => {
      if (url === '/api/approvals/sessions') return { data: { session_id: 's-1', current_step: STEPS[0], step_results: [] } };
      if (body.step_id === 'reason') return { data: { complete: false, current_step: STEPS[1], step_results: [] } };
      return { data: { complete: true, agreement_id: 'agr-1', pdf_storage_path: null, pdf_url: null } };
    });
  });

  it('approval wizard dialog renders on the kit Dialog', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderWizard();
    const dialog = await screen.findByRole('dialog', { name: 'Approval wizard' });
    expectKitDialog(dialog);
    expect(dialog).toHaveAccessibleDescription('Choose an approval workflow to run for this entity.');
    // The chooser: a row per workflow, Cancel in the footer, the corner close
    expect(await within(dialog).findAllByRole('button', { name: /^Request / })).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expectNoOldMarkup(dialog);
  });

  it('approval wizard dialog renders the preview badge in its title', async () => {
    renderWizard({ preselectedWorkflowId: 'wf-1', autoStartWithPreselected: true, previewMode: true });
    const dialog = await screen.findByRole('dialog', { name: /Approval wizard/ });
    expectKitDialog(dialog);
    expect(within(dialog).getByRole('heading', { name: /Approval wizard/ })).toHaveTextContent('Preview');
  });

  it('approval wizard dialog keeps its fields and actions', async () => {
    const user = userEvent.setup();
    renderWizard({ preselectedWorkflowId: 'wf-1', autoStartWithPreselected: true });
    const dialog = await screen.findByRole('dialog', { name: 'Approval wizard' });
    expect(await within(dialog).findByRole('textbox', { name: /Business reason/ })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription('Step: Business reason');

    // user_action: a named Select with the field's options; Next waits for both
    const workspace = selectField(dialog, /Target workspace/);
    expect(workspace).toHaveAttribute('placeholder', 'Target workspace');
    expect(await optionNames(user, workspace)).toEqual(['Production', 'Development']);
    const next = within(dialog).getByRole('button', { name: 'Next' });
    await user.type(within(dialog).getByRole('textbox', { name: /Business reason/ }), 'Quarterly report');
    expect(next).toBeDisabled();
    await pick(user, workspace, 'Development');
    expect(next).toBeEnabled();
    expectNoOldMarkup(dialog);
    await user.click(next);
    expect(mockPost).toHaveBeenLastCalledWith('/api/approvals/sessions/s-1/steps', {
      step_id: 'reason', payload: { reason: 'Quarterly report', workspace: 'dev' },
    });

    // on_behalf_of: the three modes; the group and the principal type are named Selects
    const self = await within(dialog).findByRole('radio', { name: 'For myself' });
    expect(self).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: "For a group I'm part of" }));
    const group = selectField(dialog, 'Select one of your groups');
    expect(await optionNames(user, group)).toEqual(['sales', 'finance']);
    const complete = within(dialog).getByRole('button', { name: 'Complete' });
    expect(complete).toBeDisabled();
    await pick(user, group, 'finance');
    expect(complete).toBeEnabled();

    await user.click(within(dialog).getByRole('radio', { name: 'Other group or service principal' }));
    const type = selectField(dialog, 'Principal type');
    expect(type).toHaveValue('Group (display name)');
    expect(await optionNames(user, type)).toEqual(['Group (display name)', 'Service principal (display name or applicationId)']);
    await pick(user, type, /^Service principal/);
    await user.type(within(dialog).getByPlaceholderText('e.g., 11111111-2222-3333-4444-555555555555'), 'app-1');
    expectNoOldMarkup(dialog);
    await user.click(complete);
    expect(mockPost).toHaveBeenLastCalledWith('/api/approvals/sessions/s-1/steps', {
      step_id: 'obo', payload: { type: 'service_principal', value: 'app-1', display: 'app-1' },
    });

    // Completion: Close in the footer
    expect(await within(dialog).findByText('Agreement recorded.')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Close' })).toHaveLength(2);
  });

  it('approval wizard dialog says when a fetched Select has no options', async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn().mockResolvedValue({ error: 'boom' });
    renderWithMantine(
      <FetchedSelectField
        field={{ id: 'ws', label: 'Workspace', type: 'select', options_endpoint: '/api/ws' }}
        value=""
        onChange={vi.fn()}
        fetcher={fetcher}
      />,
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/ws'));
    const field = screen.getByRole('textbox');
    await waitFor(() => expect(field).toBeEnabled());
    await user.click(field);
    const list = document.getElementById(field.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(within(list).getByText('boom')).toBeInTheDocument();
  });
});
