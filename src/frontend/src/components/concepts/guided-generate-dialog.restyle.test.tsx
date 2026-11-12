/**
 * Wave 2 Task 12b: Define's Guided Generate dialog on the kit Dialog, with
 * Mantine fields. Escape in its Select and the hand-over to the generator are
 * also checked in a real browser (tests/e2e/concepts-generator.spec.ts).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup, optionNames, pick, selectField } from '@/test/kit-dialog';
import { GuidedGenerateDialog } from './guided-generate-dialog';

const mockUseDomains = vi.fn();
vi.mock('@/hooks/use-domains', () => ({ useDomains: () => mockUseDomains() }));

const DOMAINS = [
  { id: 'd1', name: 'Finance', description: null },
  { id: 'd2', name: 'Logistics', description: null },
];

function GeneratorProbe() {
  return <div data-testid="generator-search">{useLocation().search}</div>;
}

const onOpenChange = vi.fn();
const renderDialog = () =>
  renderWithMantine(
    <Routes>
      <Route path="/concepts/define" element={<GuidedGenerateDialog open onOpenChange={onOpenChange} />} />
      <Route path="/concepts/generator" element={<GeneratorProbe />} />
    </Routes>,
    { route: '/concepts/define' },
  );

describe('GuidedGenerateDialog on the kit Dialog', () => {
  beforeEach(() => {
    mockUseDomains.mockReturnValue({ domains: DOMAINS, loading: false, error: null });
  });

  it('renders on the kit Dialog', async () => {
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Guided build' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(dialog).toHaveAccessibleDescription(/Answer a few questions/);
    // The free-text domain field takes focus first, as with autoFocus before
    expect(within(dialog).getByRole('textbox', { name: 'What domain are you working in?' })).toHaveAttribute('data-autofocus');
  });

  it('keeps its fields and actions', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Guided build' });
    const domainSelect = selectField(dialog, 'Data domain');
    expect(await optionNames(user, domainSelect)).toEqual(['No data domain (type your own)', 'Finance', 'Logistics']);
    await pick(user, domainSelect, 'Logistics');
    expect(within(dialog).getByRole('textbox', { name: 'What domain are you working in?' })).toHaveValue('Logistics');
    // The None sentinel clears a picked domain
    await pick(user, domainSelect, 'No data domain (type your own)');
    expect(within(dialog).getByRole('textbox', { name: 'What domain are you working in?' })).toHaveValue('');

    expect(within(dialog).getByRole('textbox', { name: 'Question 1' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove question 1' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Add question' })).toBeEnabled();
    expect(within(dialog).getByRole('textbox', { name: 'What objects do you work with? (optional)' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Continue to generator' })).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('composes the prompt and hands it to the generator', async () => {
    const user = userEvent.setup();
    renderDialog();
    const dialog = await screen.findByRole('dialog', { name: 'Guided build' });
    await user.type(within(dialog).getByRole('textbox', { name: 'What domain are you working in?' }), 'Finance');
    await user.type(within(dialog).getByRole('textbox', { name: 'Question 1' }), 'Which invoices are overdue?{Enter}');
    expect(within(dialog).getByRole('textbox', { name: 'Question 2' })).toHaveFocus();
    await user.type(within(dialog).getByRole('textbox', { name: 'What objects do you work with? (optional)' }), 'Invoice');
    const preview = within(dialog).getByTestId('guided-prompt-preview');
    expect(preview.textContent).toBe(
      'Build a domain ontology for: Finance.\nIt should help answer these questions:\n1. Which invoices are overdue?\nKey objects and concepts to model: Invoice.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Continue to generator' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(new URLSearchParams(screen.getByTestId('generator-search').textContent ?? '').get('guidelines')).toBe(preview.textContent);
  });
});
