/**
 * Task 15, fix round 1: once the review editor closes, focus goes back to the
 * Review button of the asset the editor was on, also after "Save & Next" has
 * moved it on (the MDM and term-mapping reviewers' onNext). The editor is
 * replaced by a stand-in that offers onNext and onReviewSave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import DataAssetReviewDetails from './data-asset-review-details';

// A stable toast: the page reloads when its toast function changes
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));
vi.mock('@/components/data-asset-reviews/asset-review-editor', () => ({
  default: ({ asset, onNext, hasNext }: { asset: { asset_fqn: string }; onNext?: () => void; hasNext?: boolean }) => (
    <div>
      <p>editing {asset.asset_fqn}</p>
      <button type="button" disabled={!hasNext} onClick={() => onNext?.()}>Save &amp; Next</button>
    </div>
  ),
}));

const UPDATED = '2026-11-02T15:30:00Z';
const REVIEW = {
  id: 'r-1', requester_email: 'rita@example.com', reviewer_email: 'sam@example.com', title: 'Matches',
  status: 'in_review', notes: null, created_at: UPDATED, updated_at: UPDATED,
  assets: [
    { id: 'a-1', asset_fqn: 'mdm://match-1', asset_type: 'mdm_match', status: 'pending', comments: null, updated_at: UPDATED },
    { id: 'a-2', asset_fqn: 'mdm://match-2', asset_type: 'mdm_match', status: 'pending', comments: null, updated_at: UPDATED },
  ],
};

const rowOf = (text: string) => screen.getByText(text, { exact: true }).closest('tr') as HTMLElement;

describe('the review editor gives focus back', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(REVIEW), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('to the Review button of the asset it was on when it closed, after Save & Next', async () => {
    const user = userEvent.setup();
    renderWithMantine(
      <Routes><Route path="/data-asset-reviews/:requestId" element={<DataAssetReviewDetails />} /></Routes>,
      { route: '/data-asset-reviews/r-1' },
    );
    await screen.findByRole('heading', { level: 1, name: 'Matches' });
    await user.click(within(rowOf('mdm://match-1')).getByRole('button', { name: 'Review' }));
    const editor = await screen.findByRole('dialog', { name: 'Reviewing: mdm://match-1' });
    await user.click(within(editor).getByRole('button', { name: 'Save & Next' }));
    expect(await screen.findByText('editing mdm://match-2')).toBeInTheDocument();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(within(rowOf('mdm://match-2')).getByRole('button', { name: 'Review' })).toHaveFocus());
  });
});
