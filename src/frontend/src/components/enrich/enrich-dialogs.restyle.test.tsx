/**
 * Wave 2 Task 14: Enrich's dialogs on the kit Dialog: the run result
 * summary (run-result-dialog) and Review suggested matches
 * (review-suggestions-dialog), which the summary hands over to. These check
 * the kit markup, every action, the hand-over and its close, and the long
 * names. Focus return and Escape in a real browser are in
 * tests/e2e/concepts-enrich-mapping-dialogs.spec.ts (ruling R10).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import { expectKitDialog, expectNoOldMarkup } from '@/test/kit-dialog';
import RunResultDialog from './run-result-dialog';
import ReviewSuggestionsDialog from './review-suggestions-dialog';
import type { Run } from '@/types/term-mapping';

// The shared reviewer has its own tests (components/term-mapping)
vi.mock('@/components/term-mapping/suggestion-review', () => ({
  default: ({ assetFqn, currentIndex, totalCount, hasNext, onNext }: {
    assetFqn: string; currentIndex: number; totalCount: number; hasNext: boolean; onNext: () => void;
  }) => (
    <div data-testid="shared-reviewer">
      {assetFqn} {currentIndex}/{totalCount}
      {hasNext && <button type="button" onClick={onNext}>next</button>}
    </div>
  ),
}));

const LONG = `Customer ${'lifetime-revenue-and-retention-domain-'.repeat(6)}`.slice(0, 200);
const UNBROKEN = `main.sales.${'x'.repeat(180)}`;

const RUN: Run = {
  id: 'run-9', status: 'suggested', comment: 'Nightly columns', created_at: '2026-11-09T11:00:00Z', stats: {},
  ontology_contexts: [], include_shipped: [], target_filter: {}, engines: ['heuristic'], applied_link_ids: [],
};
const REFS = [{ fqn: 'term-mapping://run-9/s-1' }, { fqn: 'term-mapping://run-9/s-2' }];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('RunResultDialog on the kit Dialog', () => {
  const renderDialog = (props: Partial<Parameters<typeof RunResultDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const onRequestReview = vi.fn();
    const view = renderWithMantine(
      <RunResultDialog open onOpenChange={onOpenChange} run={RUN} suggestionRefs={REFS} onRequestReview={onRequestReview} {...props} />,
    );
    return { ...view, onOpenChange, onRequestReview };
  };

  it('renders the summary on the kit with no old markup', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Run complete' });
    expectKitDialog(dialog);
    expectNoOldMarkup(dialog);
    expect(within(dialog).getByText('Found 2 suggested match(es) to review.')).toBeInTheDocument();
  });

  it('says while it gathers the matches, and when there are none, with only Close', () => {
    const { rerender } = renderDialog({ loading: true });
    const dialog = screen.getByRole('dialog', { name: 'Run complete' });
    expect(within(dialog).getByText('Gathering suggested matches…')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Review matches' })).toBeNull();
    rerender(<RunResultDialog open onOpenChange={vi.fn()} run={RUN} suggestionRefs={[]} onRequestReview={vi.fn()} />);
    expect(within(screen.getByRole('dialog')).getByText('No matches were found for this run. Nothing to review.')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Request review' })).toBeNull();
  });

  it('Close closes, and Request review hands over', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onRequestReview } = renderDialog();
    const dialog = screen.getByRole('dialog', { name: 'Run complete' });
    await user.click(within(dialog).getByRole('button', { name: 'Request review' }));
    expect(onRequestReview).toHaveBeenCalled();
    // The footer's Close, not the corner one
    const closes = within(dialog).getAllByRole('button', { name: 'Close' });
    await user.click(closes[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Review matches hands over to the reviewer, whose close closes both', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Review matches' }));
    const review = await screen.findByRole('dialog', { name: /Review suggested matches/ });
    expectKitDialog(review);
    // The summary gives way: one dialog at a time
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Run complete' })).toBeNull());
    expect(within(review).getByTestId('shared-reviewer')).toHaveTextContent('term-mapping://run-9/s-1 1/2');
    await user.click(within(review).getByRole('button', { name: 'next' }));
    expect(within(review).getByTestId('shared-reviewer')).toHaveTextContent('term-mapping://run-9/s-2 2/2');
    // The scheme name is the run's comment
    expect(review).toHaveTextContent('Nightly columns');
    await user.click(within(review).getAllByRole('button', { name: 'Close' })[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ReviewSuggestionsDialog on the kit Dialog', () => {
  const live = (id: string, concept: string, target: string, confidence: number) => ({
    id, runId: 'run-1', concept, target, reason: `reason for ${id}`, confidence,
  });
  const renderDialog = (props: Partial<Parameters<typeof ReviewSuggestionsDialog>[0]> = {}) => {
    const onOpenChange = vi.fn();
    const view = renderWithMantine(
      <ReviewSuggestionsDialog open onOpenChange={onOpenChange} schemeName="Finance" reviewBoardHref="/data-asset-reviews" {...props} />,
    );
    return { ...view, onOpenChange };
  };
  const dialog = () => screen.getByRole('dialog', { name: /Review suggested matches/ });


  it('renders the sample rows on the kit with no old markup, inert', () => {
    renderDialog({
      placeholders: [{ id: 'p1', concept: 'Payment Term', target: 'finance.gold.dim_payment_terms', reason: 'label', confidence: 'high' }],
      driftCount: 2,
    });
    expectKitDialog(dialog());
    expectNoOldMarkup(dialog());
    const d = within(dialog());
    expect(d.getByText('Sample matches shown for illustration.')).toBeInTheDocument();
    expect(d.getByText('Payment Term')).toBeInTheDocument();
    expect(d.getByText('high')).toHaveAttribute('data-confidence', 'high');
    expect(d.getByRole('button', { name: 'Reject' })).toBeDisabled();
    expect(d.getByRole('button', { name: 'Accept' })).toBeDisabled();
    expect(d.getByText('Schema drift to resolve')).toBeInTheDocument();
    expect(d.getByRole('link', { name: /Open full Review Board/ })).toHaveAttribute('href', '/data-asset-reviews');
  });

  it('lists a scheme’s live suggestions and accepts and applies them all, once', async () => {
    const user = userEvent.setup();
    let resolve: () => void = () => {};
    const onAcceptAndApplyAll = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const { onOpenChange } = renderDialog({
      liveSuggestions: [live('l1', LONG, UNBROKEN, 0.92), live('l2', 'Order', 'main.sales.orders', 0.3)],
      onAcceptAndApplyAll,
    });
    const d = within(dialog());
    expectNoOldMarkup(dialog());
    expect(d.getByText('high')).toBeInTheDocument();
    expect(d.getByText('low')).toBeInTheDocument();
    const apply = d.getByRole('button', { name: 'Accept & apply all 2' });
    await user.click(apply);
    expect(d.getByRole('button', { name: 'Applying…' })).toBeDisabled();
    await user.click(d.getByRole('button', { name: 'Applying…' }));
    expect(onAcceptAndApplyAll).toHaveBeenCalledTimes(1);
    resolve();
    expect(await d.findByText('Applied 2 match(es). They will sync on next delivery.')).toBeInTheDocument();
    expect(d.queryByRole('button', { name: /Accept & apply all/ })).toBeNull();
    await user.click(d.getByRole('button', { name: 'Done' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a failed apply says so in the dialog and can be tried again', async () => {
    const user = userEvent.setup();
    const onAcceptAndApplyAll = vi.fn().mockRejectedValueOnce(new Error('apply failed for run run-1: 500')).mockResolvedValueOnce(undefined);
    renderDialog({ liveSuggestions: [live('l1', 'Order', 'main.sales.orders', 0.8)], onAcceptAndApplyAll });
    const d = within(dialog());
    await user.click(d.getByRole('button', { name: 'Accept & apply all 1' }));
    expect(await d.findByRole('alert')).toHaveTextContent('Could not apply matches: apply failed for run run-1: 500');
    await user.click(d.getByRole('button', { name: 'Accept & apply all 1' }));
    expect(await d.findByText(/Applied 1 match/)).toBeInTheDocument();
  });

  it('a reader cannot accept and apply', () => {
    renderDialog({ liveSuggestions: [live('l1', 'Order', 'main.sales.orders', 0.8)], onAcceptAndApplyAll: vi.fn(), canWrite: false });
    expect(within(dialog()).getByRole('button', { name: 'Accept & apply all 1' })).toBeDisabled();
  });

  it('says while the suggestions load', () => {
    renderDialog({ loading: true });
    expect(within(dialog()).getByText('Loading suggested matches…')).toBeInTheDocument();
  });

  it('long concept and asset names wrap, the asset keeping its full name in a title', () => {
    renderDialog({ liveSuggestions: [live('l1', LONG, UNBROKEN, 0.92)], onAcceptAndApplyAll: vi.fn() });
    expect(within(dialog()).getByText(LONG)).toBeInTheDocument();
    expect(within(dialog()).getByText(UNBROKEN)).toHaveAttribute('title', UNBROKEN);
  });
});
