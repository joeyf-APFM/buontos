/**
 * A term-mapping suggestion under review (wave 2 Task 14, ruling R63): the
 * editor renders the shared reviewer (components/term-mapping/
 * suggestion-review, restyled in Task 14), and its decisions are open only
 * to users with term-mapping Read/Write, as the decisions endpoint needs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import AssetReviewEditor from './asset-review-editor';
import type { useApi } from '@/hooks/use-api';
import { AssetType, ReviewedAssetStatus, type ReviewedAsset } from '@/types/data-asset-review';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

const SUGGESTION = {
  id: 'sg-1', run_id: 'run-9', source_entity_type: 'asset', source_entity_id: 'main.sales.orders', source_label: 'orders',
  suggestion_kind: 'entity_assignment', target_concept_iri: 'urn:concept:order', target_concept_label: 'Order',
  confidence: 0.92, reason: 'exact label match', auto_apply: false, engine: 'heuristic', status: 'pending',
  warnings: [], custom_iri: null, created_at: '', updated_at: '',
};

const ASSET: ReviewedAsset = {
  id: 'a-1', asset_fqn: 'term-mapping://run-9/sg-1', asset_type: AssetType.CONCEPT_MAPPING_SUGGESTION,
  status: ReviewedAssetStatus.PENDING, updated_at: new Date().toISOString(),
};

const ACTIONS = ['Needs clarification', 'Reject', 'Accept & apply', 'Accept & next'];

let fetchMock: ReturnType<typeof vi.fn>;

function grant(level: FeatureAccessLevel | null) {
  usePermissionsStore.setState({
    permissions: level ? { 'term-mapping': level, 'data-asset-reviews': FeatureAccessLevel.READ_WRITE } : {},
    isReady: level !== null,
    isLoading: level === null,
    appliedRoleId: null,
    _initAttempted: true,
    _isInitializing: false,
  });
}

function renderEditor() {
  const onReviewSave = vi.fn();
  const api = { get: vi.fn().mockResolvedValue({ data: { enabled: false }, error: null }), post: vi.fn(), put: vi.fn(), delete: vi.fn() } as unknown as ReturnType<typeof useApi>;
  renderWithMantine(
    <AssetReviewEditor requestId="r-1" asset={ASSET} api={api} onReviewSave={onReviewSave} hasNext onNext={vi.fn()} currentIndex={1} totalCount={2} />,
  );
  return onReviewSave;
}

beforeEach(() => {
  fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return json({ accepted: 1, rejected: 0, skipped: 0, errors: [] });
    return json([SUGGESTION]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AssetReviewEditor for a term-mapping suggestion', () => {
  it('renders the restyled reviewer, and a writer decides it', async () => {
    const user = userEvent.setup();
    grant(FeatureAccessLevel.READ_WRITE);
    const onReviewSave = renderEditor();
    expect(await screen.findByText('Term-mapping suggestion')).toBeInTheDocument();
    expect(screen.getByText('92% · high')).toHaveAttribute('data-bucket', 'high');
    for (const name of ACTIONS) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Accept & apply' }));
    await waitFor(() => expect(onReviewSave).toHaveBeenCalledWith(expect.objectContaining({ status: ReviewedAssetStatus.APPROVED })));
    expect(fetchMock).toHaveBeenCalledWith('/api/term-mappings/runs/run-9/decisions', expect.objectContaining({ method: 'POST' }));
  });

  it('a reader sees the suggestion with its decisions off', async () => {
    grant(FeatureAccessLevel.READ_ONLY);
    renderEditor();
    expect(await screen.findByText('Term-mapping suggestion')).toBeInTheDocument();
    for (const name of ACTIONS) expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeDisabled();
  });

  it('keeps the decisions off until permissions have loaded', async () => {
    grant(null);
    renderEditor();
    expect(await screen.findByText('Term-mapping suggestion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept & apply' })).toBeDisabled();
  });
});
