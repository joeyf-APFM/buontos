/**
 * Task 15: the asset review editor (inside the review page's Modal) on
 * Mantine fields. Its syntax highlighter and markdown renderer are kept as
 * they were: the same libraries and options, and no raw HTML. Scrolling of
 * long code is checked in a real browser in tests/e2e/data-asset-reviews.spec.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import AssetReviewEditor from './asset-review-editor';
import classes from './asset-review-editor.module.css';
import { AssetType, ReviewedAsset, ReviewedAssetStatus } from '@/types/data-asset-review';

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

const asset = (asset_fqn: string, asset_type: AssetType, extra: Partial<ReviewedAsset> = {}): ReviewedAsset => ({
  id: 'a-1', asset_fqn, asset_type, status: ReviewedAssetStatus.PENDING, updated_at: '2026-11-02T15:30:00Z', ...extra,
});

const LLM_ON = { enabled: true, endpoint: 'e', system_prompt: null, disclaimer_text: '' };

function renderEditor(reviewed: ReviewedAsset, answers: Record<string, unknown> = {}) {
  const get = vi.fn(async (url: string) => {
    if (url === '/api/settings/llm') return { data: answers.llm ?? { enabled: false } };
    if (url.includes('/preview')) return { data: answers.preview ?? { schema: [{ name: 'id', type: 'int', nullable: false }], data: [{ id: 7 }] } };
    return { data: null };
  });
  const put = vi.fn(async (_url: string, body: Record<string, unknown>) => ({ data: { ...reviewed, ...body } }));
  const post = vi.fn(async () => ({ data: answers.analysis }));
  const onReviewSave = vi.fn();
  renderWithMantine(
    <AssetReviewEditor requestId="r-1" asset={reviewed} api={{ get, put, post } as any} onReviewSave={onReviewSave} />,
  );
  return { get, put, post, onReviewSave };
}

function definitionFetch(text: string) {
  vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, text: async () => text } as Response);
}

describe('the asset review editor on Mantine', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toast.mockClear();
    localStorage.removeItem('llm_consent_state');
  });

  it('keeps every control for a table', async () => {
    renderEditor(asset('main.sales.orders', AssetType.TABLE));
    expect(await screen.findByText('7')).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 3, name: 'Asset Details' })).toHaveClass(classes.heading);
    expect(screen.getByText('main.sales.orders')).toHaveClass(classes.mono);
    const status = screen.getByLabelText('Status *');
    expect(status).toHaveAttribute('aria-haspopup', 'listbox');
    expect(status).toHaveAttribute('id', 'asset-status');
    expect(status).toHaveValue('pending');
    const comments = screen.getByRole('textbox', { name: 'Comments' });
    expect(comments.tagName).toBe('TEXTAREA');
    expect(comments).toHaveAttribute('placeholder', 'Add your review comments here...');
    // The preview's DataTable, then Save and the (not yet built) automated checks
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Review' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Run Automated Checks (Not Implemented)' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Run AI Analysis' })).toBeNull();

    const user = userEvent.setup();
    await user.click(status);
    // jsdom can't place the dropdown, so Mantine leaves it display: none: hence hidden: true
    const list = document.getElementById(status.getAttribute('aria-controls') ?? '') as HTMLElement;
    expect(within(list).getAllByRole('option', { hidden: true }).map((o) => o.textContent)).toEqual(['pending', 'approved', 'rejected', 'needs_clarification']);
  });

  it('saves the status and comments', async () => {
    const user = userEvent.setup();
    const { put, onReviewSave } = renderEditor(asset('main.sales.orders', AssetType.TABLE, { comments: 'Old' }));
    await screen.findByText('7');
    expect(screen.getByRole('textbox', { name: 'Comments' })).toHaveValue('Old');
    await user.click(screen.getByLabelText('Status *'));
    await user.click(await screen.findByRole('option', { name: 'approved', hidden: true }));
    await user.clear(screen.getByRole('textbox', { name: 'Comments' }));
    await user.click(screen.getByRole('button', { name: 'Save Review' }));
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith('/api/data-asset-reviews/r-1/assets/a-1/status', { status: 'approved', comments: null });
    expect(onReviewSave).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1', status: 'approved', comments: null }));
    expect(toast).toHaveBeenCalledWith({ title: 'Success', description: 'Review for main.sales.orders saved.' });
  });

  it('treats a preview without schema or rows as empty', async () => {
    renderEditor(asset('main.sales.orders', AssetType.TABLE), { preview: { schema: null, data: 'none' } });
    expect(await screen.findByText('No results.')).toBeInTheDocument();
  });

  it('shows a view definition in the syntax highlighter, with line numbers, in a frame that scrolls', async () => {
    definitionFetch('SELECT id FROM main.sales.orders');
    renderEditor(asset('main.sales.v_orders', AssetType.VIEW));
    // The async highlighter renders once its language is in
    await waitFor(() => expect(document.querySelector('pre code')).toHaveTextContent('SELECT id FROM main.sales.orders'));
    const code = document.querySelector('pre code') as HTMLElement;
    const pre = code.closest('pre') as HTMLElement;
    expect(pre.parentElement).toHaveClass(classes.code);
    expect(code).toHaveClass('language-sql');
    expect(pre).toHaveStyle({ margin: '0px', padding: '0.5rem', fontSize: '0.75rem', maxHeight: '24rem' });
    expect(pre.querySelector('.linenumber')).toHaveTextContent('1');
  });

  it('renders the AI analysis as markdown, with no raw HTML, when it passed the security check', async () => {
    localStorage.setItem('llm_consent_state', JSON.stringify({ accepted: true, config_version: 'e' }));
    definitionFetch('SELECT 1');
    const user = userEvent.setup();
    const { post } = renderEditor(asset('main.sales.v_orders', AssetType.VIEW), {
      llm: LLM_ON,
      analysis: {
        request_id: 'r-1', asset_id: 'a-1', model_used: 'm-1', timestamp: '2026-11-09T10:00:00Z',
        phase1_passed: true, render_as_markdown: true,
        analysis_summary: '## Findings\n\nReads **every** column. <b>raw</b>',
      },
    });
    const run = await screen.findByRole('button', { name: 'Run AI Analysis' });
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    expect(post).toHaveBeenCalledWith('/api/data-asset-reviews/r-1/assets/a-1/analyze', {});
    const heading = await screen.findByRole('heading', { level: 2, name: 'Findings' });
    const markdown = heading.closest('.markdown-container') as HTMLElement;
    expect(markdown).toHaveClass('prose', 'prose-xs', 'max-w-none', classes.markdown);
    expect(within(markdown).getByText('every').tagName).toBe('STRONG');
    // Raw HTML stays text, as before
    expect(markdown.querySelector('b')).toBeNull();
    expect(markdown).toHaveTextContent('<b>raw</b>');
    expect(screen.getByRole('heading', { level: 4, name: 'AI Analysis Summary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-run AI Analysis' })).toBeEnabled();
  });

  it('shows the AI analysis as plain text, with the security warning, when it failed the check', async () => {
    localStorage.setItem('llm_consent_state', JSON.stringify({ accepted: true, config_version: 'e' }));
    definitionFetch('SELECT 1');
    const user = userEvent.setup();
    renderEditor(asset('main.sales.v_orders', AssetType.VIEW), {
      llm: LLM_ON,
      analysis: {
        request_id: 'r-1', asset_id: 'a-1', model_used: null, timestamp: '2026-11-09T10:00:00Z',
        phase1_passed: false, render_as_markdown: false, analysis_summary: '## Not a heading',
      },
    });
    const run = await screen.findByRole('button', { name: 'Run AI Analysis' });
    await waitFor(() => expect(run).toBeEnabled());
    await user.click(run);
    const plain = await screen.findByText('## Not a heading');
    expect(plain).toHaveClass(classes.plain);
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull();
    expect(screen.getByText('Security Warning')).toBeInTheDocument();
  });

  it('shows a content error in a Mantine alert', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500, text: async () => '' } as Response);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderEditor(asset('main.sales.v_orders', AssetType.VIEW));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) {
      expect(alert).toHaveClass('mantine-Alert-root');
      expect(alert).toHaveTextContent('Failed to fetch definition (500)');
    }
  });
});
