/**
 * Wave 2 Task 16: Search (/search, /search/llm, /search/index) on the page
 * kit, with its two tabs: Ask Ontos (components/search/llm-search) and Index
 * Search (components/search/index-search). The chat's scroll, long messages
 * and session titles are measured in a real browser in
 * tests/e2e/marketplace-search.spec.ts (ruling R10); these tests check the
 * structure, the tab slugs, every control for a writer and a reader, the
 * consent gate, sessions, send, retry and edit, the debug collapsibles, the
 * toasts, the LLM-disabled state, and the empty, failed and stale states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import kit from '@/mantine/page/page.module.css';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import usePermissionsStore from '@/stores/permissions-store';
import { useUICustomizationStore } from '@/stores/ui-customization-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import SearchView from './search';

// The UI customization store loads its settings when it is imported, before
// the tests stub fetch: answer that load with a 404, so the store keeps its defaults
vi.hoisted(() => {
  vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }));
});

const toast = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast, dismiss: vi.fn() }), toast }));

// The consent dialog is shared (the Ontos window, Data Asset Reviews) and
// consumed as it is: a stand-in records the gate
const consent = vi.hoisted(() => ({ given: true }));
vi.mock('@/components/common/llm-consent-dialog', () => ({
  hasLLMConsent: () => consent.given,
  default: (p: { open: boolean; onOpenChange: (o: boolean) => void; onAccept: () => void }) =>
    p.open ? (
      <div role="dialog" aria-label="AI consent">
        <button onClick={() => { consent.given = true; p.onOpenChange(false); p.onAccept(); }}>I agree</button>
      </div>
    ) : null,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const STATUS = { enabled: true, endpoint: 'ep', model_name: 'e2e-model', disclaimer: 'AI may be wrong.', adoption_mode: 'active' };
const SESSIONS = [
  { id: 's1', title: 'Customer data', message_count: 2, created_at: '', updated_at: '' },
  { id: 's2', title: '', message_count: 2, created_at: '', updated_at: '' },
];
const SESSION_1 = {
  id: 's1', title: 'Customer data', user_id: 'u', created_at: '', updated_at: '',
  messages: [
    { id: 'u1', role: 'user', content: 'Where is customer data?', timestamp: '2026-11-09T11:00:00Z' },
    { id: 't1', role: 'assistant', content: null, tool_calls: [{ id: 'c', name: 'search_data_products', arguments: {} }], timestamp: '2026-11-09T11:00:01Z' },
    { id: 'a1', role: 'assistant', content: 'In **Sales orders**.\n\n| Product | Owner |\n| --- | --- |\n| Sales orders | Rita |', timestamp: '2026-11-09T11:00:02Z' },
  ],
};
const DEBUG = {
  query_classification: { user_query: 'q', categories: ['discovery'], tools_provided: ['search_data_products'], tools_count: 1 },
  model: 'e2e-model', system_prompt_length: 10, iterations: [], total_tool_calls: 1, total_iterations: 1, total_elapsed_ms: 42,
  tool_executions: [{ tool_call_id: 'c', tool: 'search_data_products', arguments: { q: 'x' }, success: true, result: { hits: 1 }, execution_ms: 7 }],
};

const INDEX_RESULTS = [
  { id: 'r1', type: 'data-product', title: 'Sales orders', description: 'Orders for reporting', link: '/data-products/p1', feature_id: 'data-products' },
  { id: 'r2', type: 'asset-table', title: 'orders', description: 'main.sales.orders', link: '/assets/a1' },
];

let fetchMock: ReturnType<typeof vi.fn>;
/** Paths (no query) that answer 500 */
let failing = new Set<string>();
let status: unknown = STATUS;
/** An index query whose answer waits for `release` (a stale response) */
let held: { q: string; release?: () => void } | null = null;
let chatAnswer = 'Here you are.';
/** Session s1's answer waits for `release` (a stale response) */
let heldSession: { release?: () => void } | null = null;
let answers = 0;

function mockBackend() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    if (failing.has(url.pathname)) return json({ detail: 'The backend is down' }, 500);
    switch (url.pathname) {
      case '/api/llm-search/status':
        return json(status);
      case '/api/llm-search/sessions':
        return json(SESSIONS);
      case '/api/llm-search/sessions/s1':
        if (method === 'GET' && heldSession) {
          const hold = heldSession;
          return new Promise<Response>((resolve) => { hold.release = () => resolve(json(SESSION_1)); });
        }
        return method === 'DELETE' ? new Response(null, { status: 204 }) : json(SESSION_1);
      case '/api/llm-search/chat': {
        const body = JSON.parse(String(init?.body));
        return json({
          session_id: 's-new',
          message: { id: `a-${++answers}`, role: 'assistant', content: `${chatAnswer} (${body.content})`, timestamp: '2026-11-09T11:01:00Z' },
          tool_calls_executed: 1, sources: [], debug: body.debug ? DEBUG : null,
        });
      }
      case '/api/search': {
        const q = url.searchParams.get('search_term') ?? '';
        if (held && held.q === q) {
          const hold = held;
          return new Promise<Response>((resolve) => {
            hold.release = () => resolve(json([{ id: 'stale', type: 'persona', title: 'Stale answer', description: '', link: '/x' }]));
          });
        }
        return json(q === 'nothing' ? [] : INDEX_RESULTS);
      }
      default:
        return json(method === 'GET' ? [] : {});
    }
  });
  vi.stubGlobal('fetch', fetchMock);
}

const calls = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(([input, init]) =>
    new URL(String(input), 'http://localhost').pathname === path && ((init as RequestInit | undefined)?.method ?? 'GET') === method);

function grant(level: FeatureAccessLevel) {
  usePermissionsStore.setState({
    permissions: { search: level },
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

let location = { pathname: '', search: '' };
function Probe() {
  const l = useLocation();
  useEffect(() => {
    location = { pathname: l.pathname, search: l.search };
  });
  return null;
}

const renderPage = (route = '/search/llm') =>
  renderWithMantine(
    <Routes>
      {['/search', '/search/llm', '/search/index'].map((path) => (
        <Route key={path} path={path} element={<><SearchView /><Probe /></>} />
      ))}
    </Routes>,
    { route },
  );

/** Classes that look like Tailwind utilities, outside the ui Button and Badge (which stay, wave 6). */
function tailwindIn(root: HTMLElement): string[] {
  const utility = /^(?:[a-z]+:)*-?(?:flex|grid|hidden|inline|block|truncate|shrink|grow|items-|justify-|self-|gap-|space-|p[xytrbl]?-|m[xytrbl]?-|w-|h-|min-|max-|text-|font-|bg-|border|rounded|shadow|leading-|tracking-|whitespace-|cursor-|opacity-|tabular-nums|uppercase|col-span|hover:|animate-|prose|group|transition|from-|to-)/;
  const found = new Set<string>();
  for (const el of root.querySelectorAll<HTMLElement>('[class]')) {
    if (el.closest('.mantine-Badge-root, .mantine-Button-root')) continue;
    for (const c of el.classList) if (utility.test(c)) found.add(c);
  }
  return [...found];
}

const chat = () => screen.getByRole('region', { name: 'Ask Nucleus' });
const log = () => screen.getByRole('log', { name: 'Messages' });
const composer = () => screen.getByRole('textbox', { name: 'Ask a question about your data...' });

async function openHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await within(chat()).findByRole('button', { name: 'History' }));
  const dialog = await screen.findByRole('dialog', { name: 'History' });
  // After the popover's transition
  await waitFor(() => expect(dialog).toBeVisible());
  return dialog;
}

beforeEach(() => {
  failing = new Set();
  status = STATUS;
  held = null;
  chatAnswer = 'Here you are.';
  heldSession = null;
  consent.given = true;
  mockBackend();
  grant(FeatureAccessLevel.READ_WRITE);
  useUICustomizationStore.setState({ appShortName: null, appDisplayName: null });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  toast.mockClear();
});

describe('search on the page kit', () => {
  it('search renders with the page kit', async () => {
    const user = userEvent.setup();
    const { container } = renderPage('/search');

    // /search opens Ask Ontos at its own slug
    await waitFor(() => expect(location.pathname).toBe('/search/llm'));
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull();
    const heading = screen.getByRole('heading', { level: 1, name: 'Search' });
    expect(heading.parentElement).toHaveClass(kit.header);
    const tabs = screen.getByRole('tablist', { name: 'Search' });
    expect(tabs).toHaveClass(kit.tabList);
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Ask Nucleus', 'Index Search']);
    expect(within(tabs).getByRole('tab', { name: 'Ask Nucleus' })).toHaveAttribute('aria-selected', 'true');

    // Ask Ontos: one kit pane filling the page (full bleed), the log and the composer in it
    const panel = screen.getByRole('tabpanel', { name: 'Ask Nucleus' });
    expect(within(panel).getByRole('region', { name: 'Ask Nucleus' })).toHaveClass(kit.pane);
    expect(container.querySelector(`.${kit.page}`)).toHaveAttribute('data-full-bleed');
    for (const route of ['/search', '/search/llm', '/search/index']) expect(isFullBleed(route)).toBe(true);
    await within(chat()).findByRole('button', { name: 'History' });
    expect(within(chat()).getByRole('log', { name: 'Messages' })).toBeInTheDocument();

    expect(container.querySelector('.p-6, .py-6, .rounded-xl, .rounded-lg, .bg-card, [class*="shadow"], [class*="gradient"]')).toBeNull();
    expect(tailwindIn(container)).toEqual([]);

    // Index Search: its own slug and a kit pane, at its natural height
    await user.click(within(tabs).getByRole('tab', { name: 'Index Search' }));
    expect(location.pathname).toBe('/search/index');
    const index = screen.getByRole('tabpanel', { name: 'Index Search' });
    expect(within(index).getByRole('region', { name: 'Index Search' })).toHaveClass(kit.pane);
    expect(container.querySelector(`.${kit.page}`)).not.toHaveAttribute('data-full-bleed');
    expect(tailwindIn(container)).toEqual([]);
  });

  it('clicking the active tab leaves the URL, its query and the history as they were', async () => {
    const user = userEvent.setup();
    renderPage('/search/index?query=sales');
    await screen.findByRole('link', { name: /Sales orders/ });
    await waitFor(() => expect(location.search).toBe('?query=sales'));
    const entries = window.history.length;
    await user.click(screen.getByRole('tab', { name: 'Index Search' }));
    expect(location.pathname).toBe('/search/index');
    expect(location.search).toBe('?query=sales');
    expect(window.history.length).toBe(entries);
    // On Ask Ontos too: no duplicate entry
    await user.click(screen.getByRole('tab', { name: 'Ask Nucleus' }));
    expect(location.pathname).toBe('/search/llm');
    const onLlm = window.history.length;
    await user.click(screen.getByRole('tab', { name: 'Ask Nucleus' }));
    expect(window.history.length).toBe(onLlm);
  });

  it('the tab names use the short name from UI customization', async () => {
    useUICustomizationStore.setState({ appShortName: 'Nimbus' });
    renderPage();
    expect(screen.getByRole('tab', { name: 'Ask Nimbus' })).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'Ask Nimbus' })).toBeInTheDocument();
  });

  for (const level of [FeatureAccessLevel.READ_WRITE, FeatureAccessLevel.READ_ONLY]) {
    it(`search keeps every control on Ask Nucleus (${level})`, async () => {
      grant(level);
      const user = userEvent.setup();
      renderPage();

      // The welcome: the example questions fill the composer
      const example = await within(log()).findByRole('button', { name: 'Where can I find customer data?' });
      expect(within(log()).getAllByRole('button').map((b) => b.textContent)).toEqual([
        'Where can I find customer data?', 'How much do all data products cost?',
        'What business terms are related to sales?', 'Show me data products in the Customer domain',
      ]);
      await user.click(example);
      expect(composer()).toHaveValue('Where can I find customer data?');
      expect(composer()).toHaveFocus();

      // The history: New Conversation, then each session with its delete
      const history = await openHistory(user);
      expect(within(history).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
        'New Conversation', 'Customer data', 'Delete conversation: Customer data', 'Untitled', 'Delete conversation: Untitled',
      ]);
      await user.click(within(history).getByRole('button', { name: 'Customer data' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'History' })).toBeNull());
      // A session's messages: the user's question, and the answer as markdown (tool-call-only messages hidden)
      expect(await within(log()).findByText('Where is customer data?')).toBeInTheDocument();
      expect(within(log()).getByText('Sales orders', { selector: 'strong' })).toBeInTheDocument();
      expect(within(log()).getByRole('table')).toBeInTheDocument();
      expect(within(log()).getAllByRole('img', { name: /You|Nucleus/ }).map((i) => i.getAttribute('aria-label'))).toEqual(['You', 'Nucleus']);

      // A question's Edit & resend and Run again
      expect(within(log()).getByRole('button', { name: 'Edit & resend' })).toBeInTheDocument();
      expect(within(log()).getByRole('button', { name: 'Run again' })).toBeInTheDocument();

      // The composer and Send; the hint names the model
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
      await user.clear(composer());
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      expect(chat()).toHaveTextContent('Model: e2e-model');

      // New Conversation clears the log
      await user.click(within(await openHistory(user)).getByRole('button', { name: 'New Conversation' }));
      expect(within(log()).queryByText('Where is customer data?')).toBeNull();
      expect(within(log()).getByText('How can I help you today?')).toBeInTheDocument();
    });
  }

  it('send, retry and edit: the answer, the sessions refresh, and the composer gets focus back', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByRole('textbox', { name: 'Ask a question about your data...' }), 'Find orders');
    await user.keyboard('{Enter}');
    expect(await within(log()).findByText('Here you are. (Find orders)')).toBeInTheDocument();
    expect(within(log()).getByText('Find orders')).toBeInTheDocument();
    expect(composer()).toHaveValue('');
    await waitFor(() => expect(composer()).toHaveFocus());
    expect(calls('/api/llm-search/chat', 'POST')).toHaveLength(1);
    expect(JSON.parse(String(calls('/api/llm-search/chat', 'POST')[0][1]!.body))).toMatchObject({ content: 'Find orders', debug: false });
    expect(calls('/api/llm-search/sessions')).toHaveLength(2);

    // Run again sends it again in the same session
    await user.click(within(log()).getByRole('button', { name: 'Run again' }));
    await waitFor(() => expect(calls('/api/llm-search/chat', 'POST')).toHaveLength(2));
    expect(JSON.parse(String(calls('/api/llm-search/chat', 'POST')[1][1]!.body))).toMatchObject({ content: 'Find orders', session_id: 's-new' });
    // Edit & resend puts it in the composer; Shift+Enter is a new line
    await user.click(within(log()).getAllByRole('button', { name: 'Edit & resend' })[0]);
    expect(composer()).toHaveValue('Find orders');
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(calls('/api/llm-search/chat', 'POST')).toHaveLength(2);
    expect(toast).not.toHaveBeenCalled();
  });

  it('while an answer is on its way: Thinking..., the composer and Send are busy', async () => {
    let answer: (r: Response) => void = () => {};
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Ask a question about your data...' });
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { answer = resolve; }));
    await user.type(field, 'Slow one');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await within(log()).findByText('Thinking...')).toBeInTheDocument();
    expect(field).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await act(async () => {
      answer(json({ session_id: 's', message: { id: 'a', role: 'assistant', content: 'Done', timestamp: '2026-11-09T11:01:00Z' }, tool_calls_executed: 0, sources: [] }));
    });
    expect(await within(log()).findByText('Done')).toBeInTheDocument();
    expect(within(log()).queryByText('Thinking...')).toBeNull();
  });

  it('a failed send shows the error and its toast, and takes the question back out', async () => {
    const user = userEvent.setup();
    failing.add('/api/llm-search/chat');
    renderPage();
    await user.type(await screen.findByRole('textbox', { name: 'Ask a question about your data...' }), 'Broken');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const alert = await within(chat()).findByRole('alert');
    expect(alert).toHaveTextContent('The backend is down');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'The backend is down' }));
    expect(within(log()).queryByText('Broken')).toBeNull();
  });

  it('the consent gate: no consent, no send, until the user agrees', async () => {
    consent.given = false;
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByRole('textbox', { name: 'Ask a question about your data...' }), 'Hello');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const dialog = screen.getByRole('dialog', { name: 'AI consent' });
    expect(calls('/api/llm-search/chat', 'POST')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'I agree' }));
    expect(await within(log()).findByText('Here you are. (Hello)')).toBeInTheDocument();
  });

  it('deleting a session: its toast, and the log clears when it was open', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Customer data' }));
    await within(log()).findByText('Where is customer data?');
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Delete conversation: Customer data' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Session deleted' })));
    expect(calls('/api/llm-search/sessions/s1', 'DELETE')).toHaveLength(1);
    expect(within(log()).queryByText('Where is customer data?')).toBeNull();
    expect(within(screen.getByRole('dialog', { name: 'History' })).queryByRole('button', { name: 'Customer data' })).toBeNull();

    // A failed delete says so, with no success toast
    toast.mockClear();
    failing.add('/api/llm-search/sessions/s2');
    await user.click(within(screen.getByRole('dialog', { name: 'History' })).getByRole('button', { name: 'Delete conversation: Untitled' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Failed to delete session' })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Session deleted' }));
  });

  it('debug mode: Ctrl+Shift+D, then the debug and tool-result collapsibles', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('textbox', { name: 'Ask a question about your data...' });
    fireEvent.keyDown(window, { key: 'D', ctrlKey: true, shiftKey: true });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Debug mode enabled' }));
    const off = within(chat()).getByRole('button', { name: 'Click to disable debug mode' });
    await user.type(composer(), 'Debug me');
    await user.keyboard('{Enter}');
    await within(log()).findByText('Here you are. (Debug me)');

    const debug = within(log()).getByRole('button', { name: /Debug/ });
    expect(debug).toHaveAttribute('aria-expanded', 'false');
    await user.click(debug);
    expect(debug).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(within(log()).getByText('Query Classification')).toBeVisible());
    const result = within(log()).getByRole('button', { name: 'Show result' });
    await user.click(result);
    expect(within(log()).getByRole('button', { name: 'Hide result' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(log()).getByText(/"hits": 1/)).toBeInTheDocument();

    await user.click(off);
    expect(within(chat()).queryByRole('button', { name: 'Click to disable debug mode' })).toBeNull();
  });

  it('a send that answers after another session is picked stays out of that session', async () => {
    let answer: (r: Response) => void = () => {};
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Ask a question about your data...' });
    await user.type(field, 'Slow one');
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { answer = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await within(log()).findByText('Thinking...');
    // While it is on its way, open session s1
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Customer data' }));
    await within(log()).findByText('Where is customer data?');
    const sessionsBefore = calls('/api/llm-search/sessions').length;
    await act(async () => {
      answer(json({ session_id: 's-other', message: { id: 'late', role: 'assistant', content: 'Late answer', timestamp: '2026-11-09T11:01:00Z' }, tool_calls_executed: 0, sources: [] }));
      await new Promise((r) => setTimeout(r, 0));
    });
    // s1's log is as it was, and the next question goes to s1
    expect(within(log()).queryByText('Late answer')).toBeNull();
    expect(within(log()).queryByText('Slow one')).toBeNull();
    expect(within(log()).getByText('Where is customer data?')).toBeInTheDocument();
    // The history still learns of the sent conversation
    await waitFor(() => expect(calls('/api/llm-search/sessions').length).toBe(sessionsBefore + 1));
    await user.type(composer(), 'Next');
    await user.keyboard('{Enter}');
    await within(log()).findByText('Here you are. (Next)');
    const last = calls('/api/llm-search/chat', 'POST').slice(-1)[0];
    expect(JSON.parse(String(last[1]!.body))).toMatchObject({ content: 'Next', session_id: 's1' });
  });

  it('a send that fails after New Conversation shows no error there', async () => {
    let answer: (r: Response) => void = () => {};
    const user = userEvent.setup();
    renderPage();
    const field = await screen.findByRole('textbox', { name: 'Ask a question about your data...' });
    await user.type(field, 'Doomed');
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { answer = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await within(log()).findByText('Thinking...');
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'New Conversation' }));
    await act(async () => {
      answer(json({ detail: 'Too late' }, 500));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(within(chat()).queryByRole('alert')).toBeNull();
    expect(within(log()).getByText('How can I help you today?')).toBeInTheDocument();
  });

  it('deleting a session that is loading, or failed to load, drops it', async () => {
    const user = userEvent.setup();
    heldSession = {};
    renderPage();
    // A pick still on its way, then its session is deleted
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Customer data' }));
    await waitFor(() => expect(heldSession!.release).toBeDefined());
    const pending = heldSession!;
    heldSession = null;
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Delete conversation: Customer data' }));
    await waitFor(() => expect(calls('/api/llm-search/sessions/s1', 'DELETE')).toHaveLength(1));
    await act(async () => {
      pending.release!();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(within(log()).queryByText('Where is customer data?')).toBeNull();
    expect(within(log()).getByText('How can I help you today?')).toBeInTheDocument();
    cleanup();

    // A failed load's Retry goes with its session
    failing.add('/api/llm-search/sessions/s1');
    renderPage();
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Customer data' }));
    expect(await within(log()).findByRole('alert')).toHaveTextContent('Failed to load session');
    failing.delete('/api/llm-search/sessions/s1');
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Delete conversation: Customer data' }));
    await waitFor(() => expect(within(log()).queryByRole('alert')).toBeNull());
    expect(within(log()).getByText('How can I help you today?')).toBeInTheDocument();
  });

  it('a session that answers after New Conversation is dropped', async () => {
    const user = userEvent.setup();
    heldSession = {};
    renderPage();
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Customer data' }));
    await waitFor(() => expect(heldSession!.release).toBeDefined());
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'New Conversation' }));
    await act(async () => {
      heldSession!.release!();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(within(log()).queryByText('Where is customer data?')).toBeNull();
    expect(within(log()).getByText('How can I help you today?')).toBeInTheDocument();
  });

  it('Ask Nucleus with the LLM off shows its disabled state', async () => {
    status = { enabled: false, disclaimer: '' };
    renderPage();
    const pane = await screen.findByRole('region', { name: 'AI-Powered Search' });
    expect(pane).toHaveClass(kit.pane);
    expect(pane).toHaveTextContent('Natural language search is not currently enabled.');
    expect(pane).toHaveTextContent('LLM search requires configuration.');
    expect(screen.queryByRole('textbox', { name: 'Ask a question about your data...' })).toBeNull();
    // The tabs stay, so Index Search is a click away
    expect(screen.getByRole('tab', { name: 'Index Search' })).toBeInTheDocument();
  });

  it('Ask Nucleus status and session load failures show an Alert with Retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    failing.add('/api/llm-search/status');
    renderPage();
    const alert = await within(log()).findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load LLM search. Please try again later.');
    // Its own title, not the details' (final review, Minor 4)
    expect(alert).toHaveTextContent('Could not load Ask Nucleus.');
    expect(alert).not.toHaveTextContent('Could not load the details.');
    expect(consoleError).toHaveBeenCalledWith('Failed to load LLM search data:', expect.any(Error));
    consoleError.mockRestore();
    failing.delete('/api/llm-search/status');
    await user.click(within(log()).getByRole('button', { name: 'Retry' }));
    expect(await within(log()).findByText('How can I help you today?')).toBeInTheDocument();
    expect(within(log()).queryByRole('alert')).toBeNull();

    // A session that fails to load: its toast, then the Alert with Retry
    failing.add('/api/llm-search/sessions/s1');
    await user.click(within(await openHistory(user)).getByRole('button', { name: 'Customer data' }));
    expect(await within(log()).findByRole('alert')).toHaveTextContent('Failed to load session');
    expect(within(log()).getByRole('alert')).toHaveTextContent('Could not load the conversation.');
    expect(within(log()).getByRole('alert')).not.toHaveTextContent('Could not load the details.');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Failed to load session' }));
    failing.delete('/api/llm-search/sessions/s1');
    await user.click(within(log()).getByRole('button', { name: 'Retry' }));
    expect(await within(log()).findByText('Where is customer data?')).toBeInTheDocument();
    expect(within(log()).queryByRole('alert')).toBeNull();
  });
});

describe('index search on the page kit', () => {
  it('search keeps every control on Index Search: the query, its URL, and result links', async () => {
    const user = userEvent.setup();
    renderPage('/search/index?query=sales');
    const pane = screen.getByRole('region', { name: 'Index Search' });
    expect(pane).toHaveTextContent('Search across all indexed application data.');
    const field = within(pane).getByRole('textbox', { name: 'Search for data products, terms, contracts...' });
    expect(field).toHaveValue('sales');
    const link = await within(pane).findByRole('link', { name: /Sales orders/ });
    expect(link).toHaveAttribute('href', '/data-products/p1');
    expect(within(pane).getByRole('link', { name: /orders main\.sales\.orders/ })).toHaveAttribute('href', '/assets/a1');
    expect(calls('/api/search')[0][0]).toContain('search_term=sales');

    await user.clear(field);
    await user.type(field, 'orders');
    await waitFor(() => expect(new URLSearchParams(location.search).get('query')).toBe('orders'));
    await user.clear(field);
    await waitFor(() => expect(location.search).toBe(''));
  });

  it('index search with no results, and with a failure and Retry', async () => {
    const user = userEvent.setup();
    renderPage('/search/index?query=nothing');
    const pane = screen.getByRole('region', { name: 'Index Search' });
    expect(await within(pane).findByText('No results found')).toBeInTheDocument();

    failing.add('/api/search');
    const field = within(pane).getByRole('textbox', { name: 'Search for data products, terms, contracts...' });
    await user.clear(field);
    await user.type(field, 'sales');
    const alert = await within(pane).findByRole('alert');
    expect(alert).toHaveTextContent('The search failed.');
    expect(within(pane).queryByText('No results found')).toBeNull();
    failing.delete('/api/search');
    await user.click(within(pane).getByRole('button', { name: 'Retry' }));
    expect(await within(pane).findByRole('link', { name: /Sales orders/ })).toBeInTheDocument();
    expect(within(pane).queryByRole('alert')).toBeNull();
  });

  it('a slower answer for an earlier query is dropped', async () => {
    const user = userEvent.setup();
    held = { q: 'sal' };
    renderPage('/search/index');
    const pane = screen.getByRole('region', { name: 'Index Search' });
    const field = within(pane).getByRole('textbox', { name: 'Search for data products, terms, contracts...' });
    await user.type(field, 'sal');
    await waitFor(() => expect(calls('/api/search')).toHaveLength(1));
    await user.type(field, 'es');
    expect(await within(pane).findByRole('link', { name: /Sales orders/ })).toBeInTheDocument();
    await act(async () => {
      held!.release!();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(within(pane).queryByRole('link', { name: /Stale answer/ })).toBeNull();
    expect(new URLSearchParams(location.search).get('query')).toBe('sales');
  });
});
