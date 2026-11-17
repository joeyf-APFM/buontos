import { act, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithMantine, userEvent } from '@/test/utils';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import HelpView from './help';
import { startsWithH1 } from './help-body';

const ARTICLES = [
  { slug: 'b-two', title: 'Beta two', summary: 'Second basics', tags: [], roles: [], order: 20, topic: 'Basics', route: null },
  { slug: 'a-one', title: 'Admin one', summary: 'Admin things', tags: [], roles: [], order: 5, topic: 'Admin', route: null },
  { slug: 'c-one', title: 'Basics first', summary: 'Start here', tags: [], roles: [], order: 1, topic: 'Basics', route: null },
];

const ARTICLE = {
  slug: 'contracts',
  title: 'Data contracts',
  summary: 'How contracts work',
  tags: [],
  roles: ['Admin', 'Data Steward'],
  order: 1,
  topic: 'Basics',
  route: '/data-contracts',
  body: '# Data contracts\n\nIntro text.\n\n## Create one\n\nSteps.\n\n## Review\n\nMore.',
  sections: [
    { anchor: 'overview', heading: 'Data contracts' },
    { anchor: 'create-one', heading: 'Create one' },
    { anchor: 'review', heading: 'Review' },
  ],
};

const HITS = [
  { id: 'h1', type: 'help', title: 'Contract search hit', description: 'A snippet', link: '/help/contracts#review', tags: [], feature_id: 'help', extra_data: null },
];

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) } as Response);
}

function mockApi(article: unknown = ARTICLE) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/help/search')) return respond(HITS);
    if (url === '/api/help/articles') return respond(ARTICLES);
    if (url.startsWith('/api/help/articles/')) return article ? respond(article) : respond({}, 404);
    return respond({}, 500);
  }) as unknown as typeof fetch;
}

function renderAt(route: string) {
  return renderWithMantine(
    <Routes>
      <Route path="/help" element={<HelpView />} />
      <Route path="/help/:slug" element={<HelpView />} />
    </Routes>,
    { route },
  );
}

describe('HelpView', () => {
  let scrollSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy as unknown as typeof Element.prototype.scrollIntoView;
    mockApi();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('index_lists_articles_by_topic', async () => {
    renderAt('/help');
    await screen.findByText('Basics first');
    const topics = screen.getAllByTestId('help-topic').map((el) => el.textContent);
    expect(topics).toEqual(['Basics', 'Admin']);
    expect(screen.getByRole('link', { name: /Beta two/ })).toHaveAttribute('href', '/help/b-two');
    expect(screen.getByText('Start here')).toBeInTheDocument();
  });

  it('index_search_shows_results_after_debounce', async () => {
    renderAt('/help');
    await screen.findByText('Basics first');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(screen.getByLabelText('Search help'), 'contr');
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(await screen.findByText('Contract search hit')).toBeInTheDocument();
    expect(screen.getByText('A snippet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Contract search hit/ })).toHaveAttribute('href', '/help/contracts#review');
  });

  it('index_search_ignores_stale_answers', async () => {
    const resolvers: Record<string, (v: Response) => void> = {};
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/help/search')) return new Promise<Response>((r) => (resolvers[url] = r));
      return respond(ARTICLES);
    }) as unknown as typeof fetch;
    renderAt('/help');
    await screen.findByText('Basics first');
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(screen.getByLabelText('Search help'), 'ab');
    await act(async () => vi.advanceTimersByTime(260));
    await user.type(screen.getByLabelText('Search help'), 'c');
    await act(async () => vi.advanceTimersByTime(260));
    const mk = (title: string) => ({ ok: true, status: 200, json: () => Promise.resolve([{ ...HITS[0], title }]) }) as Response;
    await act(async () => {
      resolvers['/api/help/search?q=abc&limit=20'](mk('Fresh answer'));
      resolvers['/api/help/search?q=ab&limit=20'](mk('Stale answer'));
    });
    expect(await screen.findByText('Fresh answer')).toBeInTheDocument();
    expect(screen.queryByText('Stale answer')).not.toBeInTheDocument();
  });

  it('index_shows_error_when_articles_fail', async () => {
    global.fetch = vi.fn(() => respond({}, 500)) as unknown as typeof fetch;
    renderAt('/help');
    expect(await screen.findByRole('alert')).toHaveTextContent('Help is unavailable right now');
  });

  it('article_renders_body_toc_and_role_badges', async () => {
    renderAt('/help/contracts');
    expect(await screen.findByRole('heading', { level: 1, name: 'Data contracts' })).toBeInTheDocument();
    expect(screen.getByText('How contracts work')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Data Steward')).toBeInTheDocument();
    expect(screen.getByText('Intro text.')).toBeInTheDocument();
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const links = Array.from(toc.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      ['Create one', '/help/contracts#create-one'],
      ['Review', '/help/contracts#review'],
    ]);
    expect(document.getElementById('create-one')).toHaveTextContent('Create one');
  });

  it('route_front_matter_renders_go_to_screen_link', async () => {
    renderAt('/help/contracts');
    const link = await screen.findByRole('link', { name: 'Go to this screen' });
    expect(link).toHaveAttribute('href', '/data-contracts');
  });

  it('no_go_to_screen_link_without_route', async () => {
    mockApi({ ...ARTICLE, route: null });
    renderAt('/help/contracts');
    await screen.findByText('Intro text.');
    expect(screen.queryByRole('link', { name: 'Go to this screen' })).not.toBeInTheDocument();
  });

  it('unknown_slug_shows_not_found_with_link_to_help', async () => {
    mockApi(null);
    renderAt('/help/nope');
    expect(await screen.findByText('Help article not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to help' })).toHaveAttribute('href', '/help');
  });

  it('article_fetch_failure_shows_error', async () => {
    global.fetch = vi.fn(() => respond({}, 500)) as unknown as typeof fetch;
    renderAt('/help/contracts');
    expect(await screen.findByRole('alert')).toHaveTextContent('Help is unavailable right now');
  });

  it('deep_link_hash_scrolls_to_section', async () => {
    renderAt('/help/contracts#review');
    await screen.findByText('Intro text.');
    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy.mock.contexts.slice(-1)[0]).toBe(document.getElementById('review'));
  });

  it('hash_change_on_page_scrolls_again', async () => {
    renderAt('/help/contracts');
    await screen.findByText('Intro text.');
    expect(scrollSpy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('link', { name: 'Review' }));
    await waitFor(() => expect(scrollSpy.mock.contexts.slice(-1)[0]).toBe(document.getElementById('review')));
  });

  it('sets_breadcrumb_and_clears_on_unmount', async () => {
    const { unmount } = renderAt('/help/contracts');
    await screen.findByText('Intro text.');
    await waitFor(() => expect(useBreadcrumbStore.getState().dynamicTitle).toBe('Data contracts'));
    unmount();
    expect(useBreadcrumbStore.getState().dynamicTitle).toBeNull();
  });
});

describe('startsWithH1', () => {
  it.each([
    ['# T\n\ntext', true],
    ['Some prose\n\n# Later', false],
    ['## Sub\n\ntext', false],
    ['\n\n  \n# T', true],
    ['```\n# not a title\n```\n\ntext', false],
    ['~~~\n# not a title\n~~~', false],
    ['', false],
    ['#NoSpace', false],
  ])('%j -> %s', (body, expected) => {
    expect(startsWithH1(body)).toBe(expected);
  });
});

describe('HelpView title heading', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
  });
  afterEach(() => vi.restoreAllMocks());

  it('body_without_h1_gets_a_page_title_h1_with_overview_id', async () => {
    mockApi({ ...ARTICLE, body: 'Plain intro.\n\n## Create one\n\nSteps.' });
    renderAt('/help/contracts');
    await screen.findByText('Plain intro.');
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Data contracts');
    expect(h1s[0]).toHaveAttribute('id', 'overview');
    expect(document.querySelectorAll('#overview')).toHaveLength(1);
  });

  it('body_with_h1_is_not_duplicated', async () => {
    mockApi({ ...ARTICLE, body: '# Something else\n\nIntro.' });
    renderAt('/help/contracts');
    await screen.findByText('Intro.');
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Something else');
    expect(document.querySelectorAll('#overview')).toHaveLength(1);
  });

  it('overview_hash_scrolls_to_the_rendered_title', async () => {
    const spy = vi.fn();
    Element.prototype.scrollIntoView = spy as unknown as typeof Element.prototype.scrollIntoView;
    const top = vi.fn();
    window.scrollTo = top as unknown as typeof window.scrollTo;
    mockApi({ ...ARTICLE, body: 'Plain intro.' });
    renderAt('/help/contracts#overview');
    await screen.findByText('Plain intro.');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.contexts.slice(-1)[0]).toBe(document.getElementById('overview'));
    expect(top).not.toHaveBeenCalled();
  });
});
