/**
 * Task 9: the approval wizard on Mantine layout and a CSS module. This walks a
 * whole session (every visual step type, then the completion screen) and
 * checks each step keeps its fields and buttons, by role and label. The pixel
 * values (12px text, 28px controls, the 1px document pane, AA contrast) are
 * measured in a real browser in tests/e2e/approval-wizard.spec.ts (ruling R10).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ApprovalWizardDialog from './approval-wizard-dialog';
import classes from './approval-wizard.module.css';

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
vi.mock('@/hooks/use-api', () => ({ useApi: () => ({ get: mockGet, post: mockPost }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/stores/user-store', () => ({
  useUserStore: (selector: (s: unknown) => unknown) =>
    selector({ userInfo: { email: 'a@example.com', groups: ['sales'] }, fetchUserInfo: vi.fn() }),
}));

const STEPS = [
  {
    step_id: 'reason', name: 'Business reason', step_type: 'user_action', order: 0,
    config: {
      title: 'Tell us why',
      requires_input: true,
      primary_field_id: 'reason',
      required_fields: [
        { id: 'reason', label: 'Business reason', type: 'text', required: true },
        { id: 'ticket', label: 'Ticket number', type: 'string' },
        { id: 'workspace', label: 'Target workspace', type: 'select', options: [{ value: 'prod', label: 'Production' }] },
      ],
      references: [{ label: 'Access policy', url: 'https://example.com/policy' }],
    },
  },
  {
    step_id: 'terms', name: 'Terms', step_type: 'legal_document', order: 1,
    config: {
      title: 'Terms of use',
      body_markdown: '## Clause 1\nKeep the data inside the workspace.',
      require_scroll_to_end: true,
      require_acknowledgement_checkbox: true,
      acknowledgement_label: 'I have read the terms',
    },
  },
  {
    step_id: 'checks', name: 'Checklist', step_type: 'acknowledgement_checklist', order: 2,
    config: {
      items: [
        { id: 'pii', label: 'I will not share PII' },
        { id: 'retention', label: 'I follow the retention policy' },
        { id: 'updates', label: 'Send me updates', required: false },
      ],
    },
  },
  {
    step_id: 'cosign', name: 'Co-signers', step_type: 'co_signers', order: 3,
    config: { label: 'Co-signer email', min_count: 1, max_count: 3 },
  },
  {
    step_id: 'obo', name: 'On behalf of', step_type: 'on_behalf_of', order: 4,
    config: { require_justification: true },
  },
];

/** Tailwind classes the shadcn markup used, now in the module */
const LEGACY = /(^|\s)(text-sm|text-base|space-y-\d|py-[48]|px-1|text-amber-\d+|bg-amber-\d+|bg-muted|prose|max-h-64|ml-6|text-destructive|text-muted-foreground)(\s|$)/;

function legacyClasses(dialog: HTMLElement) {
  // The dialog's own title and description keep the Task 7 classes
  const shell = new Set(['aria-labelledby', 'aria-describedby'].map((a) => dialog.getAttribute(a)));
  return [...dialog.querySelectorAll<HTMLElement>('[class]')]
    .filter((el) => !shell.has(el.id) && LEGACY.test(el.getAttribute('class') ?? ''))
    .map((el) => el.getAttribute('class'));
}

const next = () => screen.getByRole('button', { name: 'Next' });

describe('ApprovalWizardDialog restyle', () => {
  beforeEach(() => {
    mockGet.mockResolvedValue({ data: { id: 'wf-1', name: 'Request access', steps: STEPS } });
    mockPost.mockImplementation(async (url: string, body: { step_id?: string }) => {
      if (url === '/api/approvals/sessions') return { data: { session_id: 's-1', current_step: STEPS[0], step_results: [] } };
      const i = STEPS.findIndex((s) => s.step_id === body.step_id);
      if (i === STEPS.length - 1) {
        return { data: { complete: true, agreement_id: 'agr-1', pdf_storage_path: 'a.pdf', pdf_url: 'https://example.com/a.pdf' } };
      }
      return { data: { complete: false, current_step: STEPS[i + 1], step_results: [] } };
    });
  });

  it("every step's fields and buttons are present and the dialog uses Aura density", async () => {
    render(
      <ApprovalWizardDialog
        isOpen
        onOpenChange={vi.fn()}
        entityType="data_product"
        entityId="dp-1"
        entityName="Customer 360"
        completionAction="subscribe"
        preselectedWorkflowId="wf-1"
        autoStartWithPreselected
      />,
    );
    const dialog = await screen.findByRole('dialog', { name: /Approval wizard/ });
    expect(dialog).toHaveClass(classes.content);
    const reason = await screen.findByRole('textbox', { name: /Business reason/ });

    // Header: progress and the entity
    expect(screen.getByText('Step 1: Business reason')).toHaveClass(classes.progressText);
    expect(screen.getByText('Customer 360').closest('p')).toHaveClass(classes.context);

    // user_action: the three fields, the reference link, the hint, Cancel and Next
    expect(screen.getByText('Tell us why')).toHaveClass(classes.stepTitle);
    expect(screen.getByRole('textbox', { name: 'Ticket number' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Target workspace' })).toBeInTheDocument();
    const refs = screen.getByRole('region', { name: 'Reference documents' });
    expect(refs).toHaveClass(classes.refs);
    expect(within(refs).getByRole('link', { name: 'Access policy' })).toHaveAttribute('href', 'https://example.com/policy');
    expect(screen.getByText('This step requires input.')).toHaveClass(classes.hint);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    expect(next()).toBeDisabled();
    expect(legacyClasses(dialog)).toEqual([]);
    fireEvent.change(reason, { target: { value: 'Quarterly revenue report' } });
    expect(next()).toBeEnabled();
    fireEvent.click(next());

    // legal_document: the document pane and the acknowledgement
    const doc = await screen.findByRole('region', { name: 'Terms of use' });
    expect(doc).toHaveClass(classes.doc);
    expect(within(doc).getByRole('heading', { name: 'Clause 1' })).toBeInTheDocument();
    const ack = screen.getByRole('checkbox', { name: 'I have read the terms' });
    expect(next()).toBeDisabled();
    fireEvent.click(ack);
    await waitFor(() => expect(next()).toBeEnabled());
    expect(screen.getByText('Step 2: Terms')).toBeInTheDocument();
    expect(legacyClasses(dialog)).toEqual([]);
    fireEvent.click(next());

    // acknowledgement_checklist: three items, two required
    const pii = await screen.findByRole('checkbox', { name: /I will not share PII/ });
    const retention = screen.getByRole('checkbox', { name: /I follow the retention policy/ });
    expect(screen.getByRole('checkbox', { name: 'Send me updates' })).toBeInTheDocument();
    expect(screen.getAllByText('*').every((star) => star.classList.contains(classes.required))).toBe(true);
    fireEvent.click(pii);
    expect(next()).toBeDisabled();
    fireEvent.click(retention);
    await waitFor(() => expect(next()).toBeEnabled());
    expect(legacyClasses(dialog)).toEqual([]);
    fireEvent.click(next());

    // co_signers: Enter and Add both add; each chip has a named remove button
    const cosigner = await screen.findByPlaceholderText('Co-signer email');
    expect(next()).toBeDisabled();
    fireEvent.change(cosigner, { target: { value: 'ana@example.com' } });
    fireEvent.keyDown(cosigner, { key: 'Enter' });
    fireEvent.change(cosigner, { target: { value: 'stewards' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const chips = screen.getByRole('list', { name: 'Co-signers' });
    expect(within(chips).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['ana@example.com', 'stewards']);
    fireEvent.click(within(chips).getAllByRole('button', { name: 'Remove' })[1]);
    expect(within(chips).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText(/recorded on the agreement/)).toHaveClass(classes.meta);
    expect(next()).toBeEnabled();
    expect(legacyClasses(dialog)).toEqual([]);
    fireEvent.click(next());

    // on_behalf_of: three modes, the group picker, the free-text fields and the justification
    const self = await screen.findByRole('radio', { name: 'For myself' });
    expect(self).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: "For a group I'm part of" }));
    expect(await screen.findByRole('combobox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Other group or service principal' }));
    expect(await screen.findByPlaceholderText('e.g., sales_consumers')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    const complete = screen.getByRole('button', { name: 'Complete' });
    fireEvent.change(screen.getByPlaceholderText('e.g., sales_consumers'), { target: { value: 'finance' } });
    expect(complete).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /Justification/ }), { target: { value: 'Team access' } });
    await waitFor(() => expect(complete).toBeEnabled());
    expect(legacyClasses(dialog)).toEqual([]);
    fireEvent.click(complete);

    // Completion: the record, the download and Close
    expect(await screen.findByText('Agreement recorded.')).toHaveClass(classes.text);
    expect(screen.getByText('Agreement ID: agr-1')).toHaveClass(classes.meta);
    expect(screen.getByRole('button', { name: 'Download Agreement' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
    expect(legacyClasses(dialog)).toEqual([]);
    expect(mockPost).toHaveBeenLastCalledWith('/api/approvals/sessions/s-1/steps', {
      step_id: 'obo',
      payload: { type: 'group', value: 'finance', display: 'finance', justification: 'Team access' },
    });
  });
});
