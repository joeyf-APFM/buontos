import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithMantine, userEvent } from '@/test/utils';
import { HelpDrawer } from './help-drawer';

const ARTICLES = [
  { slug: 'b-two', title: 'Beta two', summary: '', tags: [], roles: [], order: 20, topic: 'Basics', route: null },
  { slug: 'b-one', title: 'Alpha one', summary: '', tags: [], roles: [], order: 20, topic: 'Basics', route: null },
  { slug: 'a-one', title: 'Admin one', summary: '', tags: [], roles: [], order: 5, topic: 'Admin', route: null },
  { slug: 'c-one', title: 'Basics first', summary: '', tags: [], roles: [], order: 1, topic: 'Basics', route: null },
];
const HITS = [
  { id: 'h1', type: 'help', title: 'Data contracts', description: 'How contracts work', link: '/help/contracts#intro', tags: [], feature_id: 'help', extra_data: null },
];

function respond(body: unknown, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response);
}

function mockApi(search: (url: string) => Promise<Response>) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    return url.startsWith('/api/help/search') ? search(url) : respond(ARTICLES);
  }) as unknown as typeof fetch;
}

describe('HelpDrawer', () => {
  beforeEach(() => mockApi(() => respond(HITS)));
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists_articles_grouped_by_topic_when_query_empty', async () => {
    renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    await screen.findByText('Alpha one');
    const topics = screen.getAllByTestId('help-topic').map((el) => el.textContent);
    expect(topics).toEqual(['Basics', 'Admin']);
    const links = screen.getAllByRole('link').map((a) => a.textContent);
    expect(links.slice(0, 4)).toEqual(['Basics first', 'Alpha one', 'Beta two', 'Admin one']);
    expect(screen.getByRole('link', { name: 'Alpha one' })).toHaveAttribute('href', '/help/b-one');
  });

  it('typing_searches_after_debounce_and_shows_title_and_snippet', async () => {
    renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    await screen.findByText('Alpha one');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const input = screen.getByPlaceholderText('Search help');
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, 'contr');
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/help/search'), expect.anything());
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(await screen.findByText('Data contracts')).toBeInTheDocument();
    expect(screen.getByText('How contracts work')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/help/search?q=contr&limit=20', expect.anything());
  });

  it('selecting_a_result_navigates_to_its_link_and_closes', async () => {
    const onClose = vi.fn();
    renderWithMantine(<HelpDrawer opened onClose={onClose} />);
    await userEvent.type(screen.getByPlaceholderText('Search help'), 'contr');
    await userEvent.click(await screen.findByText('Data contracts'));
    expect(window.location.pathname + window.location.hash).toBe('/help/contracts#intro');
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting_a_browse_article_navigates_and_closes', async () => {
    const onClose = vi.fn();
    renderWithMantine(<HelpDrawer opened onClose={onClose} />);
    await userEvent.click(await screen.findByRole('link', { name: 'Alpha one' }));
    expect(window.location.pathname).toBe('/help/b-one');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows_no_results_message', async () => {
    mockApi(() => respond([]));
    renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Search help'), 'zzz');
    expect(await screen.findByText('No help found')).toBeInTheDocument();
  });

  it('shows_error_message_on_failure', async () => {
    mockApi(() => respond({}, false));
    renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    await userEvent.type(screen.getByPlaceholderText('Search help'), 'zzz');
    expect(await screen.findByText('Help is unavailable right now')).toBeInTheDocument();
  });

  it('ignores_stale_answers', async () => {
    let resolveFirst: (r: Response) => void = () => {};
    const first = new Promise<Response>((r) => (resolveFirst = r));
    mockApi((url) => (url.includes('q=ab&') ? first : respond([{ ...HITS[0], title: 'Newer hit' }])));
    renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    const input = screen.getByPlaceholderText('Search help');
    await userEvent.type(input, 'ab');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('q=ab&'), expect.anything()));
    await userEvent.type(input, 'c');
    expect(await screen.findByText('Newer hit')).toBeInTheDocument();
    await act(async () => {
      resolveFirst({ ok: true, status: 200, json: () => Promise.resolve([{ ...HITS[0], title: 'Stale hit' }]) } as Response);
    });
    expect(screen.queryByText('Stale hit')).not.toBeInTheDocument();
    expect(screen.getByText('Newer hit')).toBeInTheDocument();
  });

  it('a_failed_article_list_is_retried_the_next_time_the_drawer_opens', async () => {
    let calls = 0;
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      if (String(input) !== '/api/help/articles') return respond(HITS);
      calls += 1;
      return calls === 1 ? respond({}, false) : respond(ARTICLES);
    }) as unknown as typeof fetch;
    const { rerender } = renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    expect(await screen.findByText('Help is unavailable right now')).toBeInTheDocument();
    rerender(<HelpDrawer opened={false} onClose={() => {}} />);
    rerender(<HelpDrawer opened onClose={() => {}} />);
    expect(await screen.findByText('Alpha one')).toBeInTheDocument();
    expect(screen.queryByText('Help is unavailable right now')).not.toBeInTheDocument();
    const articleCalls = vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u) === '/api/help/articles');
    expect(articleCalls).toHaveLength(2);
  });

  it('a_successful_article_list_is_not_fetched_again_on_reopen', async () => {
    const { rerender } = renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    await screen.findByText('Alpha one');
    rerender(<HelpDrawer opened={false} onClose={() => {}} />);
    rerender(<HelpDrawer opened onClose={() => {}} />);
    await screen.findByText('Alpha one');
    const articleCalls = vi.mocked(global.fetch).mock.calls.filter(([u]) => String(u) === '/api/help/articles');
    expect(articleCalls).toHaveLength(1);
  });

  it('a_failed_article_list_does_not_hide_search', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) =>
      String(input) === '/api/help/articles' ? respond({}, false) : respond(HITS),
    ) as unknown as typeof fetch;
    renderWithMantine(<HelpDrawer opened onClose={() => {}} />);
    await screen.findByText('Help is unavailable right now');
    await userEvent.type(screen.getByPlaceholderText('Search help'), 'contr');
    expect(await screen.findByText('Data contracts')).toBeInTheDocument();
  });

  it('view_all_links_to_/help', async () => {
    const onClose = vi.fn();
    renderWithMantine(<HelpDrawer opened onClose={onClose} />);
    const link = await screen.findByRole('link', { name: 'View all help articles' });
    expect(link).toHaveAttribute('href', '/help');
    await userEvent.click(link);
    expect(onClose).toHaveBeenCalled();
  });
});
