/** Ask Ontos as a floating window, like Helix (R26). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { useCopilotStore } from '@/stores/copilot-store';
import { FeatureAccessLevel } from '@/types/settings';
import { AppShell } from '@/mantine/shell/app-shell';
import { SHELL_DEFAULTS, useShellStore } from '@/mantine/shell/use-shell-store';
import { json } from '@/mantine/asset-explorer/test-fixtures';
import { HELIX_DEFAULTS, useHelixStore } from '@/mantine/helix/helix-store';
import { WINDOW_DEFAULT, WINDOW_MARGIN } from '@/mantine/assistant/window-geometry';
import { COPILOT_DEFAULTS } from '@/stores/copilot-store';
import { ONTOS_DEFAULTS, useOntosStore } from './ontos-store';

vi.mock('@/components/ui/user-info', () => ({ default: () => null }));
vi.mock('@/components/ui/notification-bell', () => ({ default: () => null }));
vi.mock('@/components/ui/project-chooser', () => ({ ProjectChooser: () => null }));
vi.mock('@/components/common/language-selector', () => ({ LanguageSelector: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string }) => unknown) =>
    select({ getShortName: () => 'Ontos' }),
}));

const STATUS = { enabled: true, endpoint: 'ep', disclaimer: 'Answers may be wrong.', adoption_mode: 'active' };
const SESSIONS = [
  { id: 's1', title: 'Customer data', message_count: 2, created_at: '', updated_at: '' },
  { id: 's2', title: 'Domains', message_count: 2, created_at: '', updated_at: '' },
];
const PROMPT = 'Where can I find customer data?';

interface Backend {
  status?: unknown;
  statusCode?: number;
  chat?: unknown[];
}

function mockBackend({ status = STATUS, statusCode = 200, chat = [] }: Backend = {}) {
  const chatBodies: Record<string, unknown>[] = [];
  const deleted: string[] = [];
  let sessions = [...SESSIONS];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/settings/helix') return json({ enabled: true, mode: 'user', workspace_host: 'h' });
    if (url === '/api/llm-search/status') return json(status, statusCode);
    if (url === '/api/llm-search/sessions') return json(sessions);
    if (url.startsWith('/api/llm-search/sessions/') && method === 'DELETE') {
      const id = url.split('/').pop()!;
      deleted.push(id);
      sessions = sessions.filter((s) => s.id !== id);
      return new Response(null, { status: 204 });
    }
    if (url === '/api/llm-search/sessions/s1') {
      return json({
        id: 's1',
        title: 'Customer data',
        messages: [
          { id: 'm1', role: 'user', content: 'Where is customer data?', timestamp: '' },
          { id: 'm2', role: 'assistant', content: null, tool_calls: [{ id: 't', name: 'search_data_products', arguments: {} }], timestamp: '' },
          { id: 'm3', role: 'tool', content: '{"raw": true}', timestamp: '' },
          { id: 'm4', role: 'assistant', content: 'In **crm.customers**.', timestamp: '' },
        ],
      });
    }
    if (url === '/api/llm-search/chat') {
      chatBodies.push(JSON.parse(String(init?.body)));
      const next = chat.shift();
      if (next instanceof Response || next instanceof Promise) return next as Response | Promise<Response>;
      return json(next ?? { session_id: 'sess-1', message: { id: `a${chatBodies.length}`, role: 'assistant', content: 'An answer.', timestamp: '' }, tool_calls_executed: 0, sources: [] });
    }
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { chatBodies, deleted, fetchMock };
}

function Page({ name, entity }: { name: string; entity?: boolean }) {
  const { setContext, clearContext } = useCopilotStore((s) => s.actions);
  useEffect(() => {
    setContext(name, `/${name.toLowerCase()}`, entity ? { type: 'Data product', name: 'Sales 360', id: 'p1' } : undefined);
    return () => clearContext();
  }, [name, entity, setContext, clearContext]);
  return <h1>{name}</h1>;
}

function renderShell(route = '/search') {
  return renderWithMantine(
    <AppShell>
      <Routes>
        <Route path="/search" element={<Page name="Search" />} />
        <Route path="/products/p1" element={<Page name="Product" entity />} />
        <Route path="/assets" element={<Page name="Explorer" />} />
      </Routes>
    </AppShell>,
    { route },
  );
}

const strip = () => screen.getByRole('navigation', { name: 'Main menu' });
const ontosButton = () => within(strip()).findByRole('button', { name: 'Ask Ontos' });
const ontos = () => screen.queryByRole('dialog', { name: /Ask Ontos/ });
const helix = () => screen.queryByRole('dialog', { name: /Helix/ });
const input = () => within(ontos()!).getByRole('textbox', { name: 'Ask Ontos anything...' });

function giveConsent() {
  localStorage.setItem('llm_consent_state', JSON.stringify({ accepted: true, timestamp: '', config_version: 'ep' }));
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

async function openOntos(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await ontosButton());
  return ontos()!;
}

describe('Ask Ontos window', () => {
  beforeEach(() => {
    setViewport(1200, 800);
    localStorage.clear();
    giveConsent();
    localStorage.setItem('copilot-welcome-dismissed', 'true');
    useHelixStore.setState(HELIX_DEFAULTS);
    useCopilotStore.setState(COPILOT_DEFAULTS);
    useOntosStore.setState(ONTOS_DEFAULTS);
    useShellStore.setState(SHELL_DEFAULTS);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    usePermissionsStore.setState({
      permissions: { search: FeatureAccessLevel.READ_ONLY, assets: FeatureAccessLevel.READ_ONLY },
      appliedRoleId: null,
      isLoading: false,
      _initAttempted: true,
      _isInitializing: false,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sits under Helix in the strip and opens as a non-modal dialog, focusing its input, on any route', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/assets');

    const button = await ontosButton();
    const names = [...strip().querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Discover', 'Ask Helix', 'Ask Ontos', 'Build']);
    expect(button).toHaveTextContent('Ontos');
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await user.click(button);

    const win = ontos()!;
    expect(win).toHaveAttribute('aria-modal', 'false');
    expect(win.style.left).toBe(`${1200 - WINDOW_DEFAULT.width - WINDOW_MARGIN}px`);
    expect(input()).toHaveFocus();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(within(win).getByText('Answers may be wrong.')).toBeInTheDocument();

    await user.click(button);
    expect(ontos()).toBeNull();
  });

  it('is hidden when Ask Ontos is disabled or its status fails', async () => {
    const { fetchMock } = mockBackend({ status: { ...STATUS, enabled: false } });
    const { unmount } = renderShell();
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/llm-search/status')).toBe(true));
    await within(strip()).findByRole('button', { name: 'Ask Helix' });
    expect(within(strip()).queryByRole('button', { name: 'Ask Ontos' })).toBeNull();
    unmount();

    useOntosStore.setState(ONTOS_DEFAULTS);
    mockBackend({ statusCode: 500 });
    renderShell();
    await within(strip()).findByRole('button', { name: 'Ask Helix' });
    await act(async () => {});
    expect(within(strip()).queryByRole('button', { name: 'Ask Ontos' })).toBeNull();
  });

  it('closes Helix when it opens, and the reverse', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell();

    await user.click(await within(strip()).findByRole('button', { name: 'Ask Helix' }));
    expect(helix()).toBeInTheDocument();
    await openOntos(user);
    expect(helix()).toBeNull();
    expect(ontos()).toBeInTheDocument();

    await user.click(within(strip()).getByRole('button', { name: 'Ask Helix' }));
    expect(ontos()).toBeNull();
    expect(helix()).toBeInTheDocument();
  });

  it('sends a starter prompt with the page context, or without it in general scope', async () => {
    const user = userEvent.setup();
    const { chatBodies } = mockBackend();
    renderShell('/products/p1');
    const win = await openOntos(user);

    expect(within(win).getByText('Sales 360')).toBeInTheDocument();
    await user.click(await within(win).findByRole('button', { name: PROMPT }));

    expect(await within(win).findByText('An answer.')).toBeInTheDocument();
    expect(chatBodies[0]).toMatchObject({
      content: PROMPT,
      page_name: 'Product',
      page_url: '/product',
      selected_entity: { type: 'Data product', name: 'Sales 360', id: 'p1' },
    });

    await user.click(within(win).getByRole('button', { name: 'New Conversation' }));
    await user.click(within(win).getByRole('button', { name: /Asking about/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Ontos (general)' }));
    expect(within(win).getByText('Ontos (general)')).toBeInTheDocument();
    await user.click(await within(win).findByRole('button', { name: PROMPT }));

    await waitFor(() => expect(chatBodies).toHaveLength(2));
    expect(chatBodies[1]).toEqual({ content: PROMPT, debug: false });
    expect(localStorage.getItem('copilot-context-scope')).toBe('general');
  });

  it('keeps the session id for follow-ups and the conversation across close and reopen', async () => {
    const user = userEvent.setup();
    const { chatBodies } = mockBackend();
    renderShell();
    await openOntos(user);

    await user.type(input(), 'First{Enter}');
    expect(await within(ontos()!).findByText('An answer.')).toBeInTheDocument();
    await user.type(input(), 'line one{Shift>}{Enter}{/Shift}line two');
    expect(input()).toHaveValue('line one\nline two');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(chatBodies).toHaveLength(2));
    expect(chatBodies[1]).toMatchObject({ content: 'line one\nline two', session_id: 'sess-1' });

    await user.click(within(ontos()!).getByRole('button', { name: 'Close Ask Ontos' }));
    expect(ontos()).toBeNull();
    await openOntos(user);
    expect(within(ontos()!).getByText('First')).toBeInTheDocument();
    expect(within(ontos()!).getAllByText('An answer.').length).toBeGreaterThan(0);
  });

  it('shows "Thinking…" while it waits', async () => {
    const user = userEvent.setup();
    let answer!: (r: Response) => void;
    mockBackend({ chat: [new Promise<Response>((resolve) => (answer = resolve))] });
    renderShell();
    await openOntos(user);

    await user.type(input(), 'Slow one{Enter}');

    expect(await within(ontos()!).findByText('Thinking...')).toBeInTheDocument();
    expect(input()).toBeDisabled();
    await act(async () =>
      answer(json({ session_id: 's', message: { id: 'a', role: 'assistant', content: 'Done.', timestamp: '' }, tool_calls_executed: 0, sources: [] })),
    );
    expect(await within(ontos()!).findByText('Done.')).toBeInTheDocument();
    expect(within(ontos()!).queryByText('Thinking...')).toBeNull();
  });

  it('shows a coded error, and a failed request, as error messages', async () => {
    const user = userEvent.setup();
    mockBackend({
      chat: [
        { session_id: 's', message: { id: 'e1', role: 'assistant', content: 'English fallback', error_code: 'chat_timeout', error_params: { errorId: 'E42' }, timestamp: '' }, tool_calls_executed: 0, sources: [] },
        json({ detail: 'The model is busy.' }, 503),
      ],
    });
    renderShell();
    await openOntos(user);

    await user.type(input(), 'Q1{Enter}');
    const coded = await within(ontos()!).findByRole('alert');
    expect(coded).toHaveTextContent('The request timed out. Please try a simpler question or try again later (error id E42).');

    await user.type(input(), 'Q2{Enter}');
    await waitFor(() => expect(within(ontos()!).getAllByRole('alert')).toHaveLength(2));
    expect(within(ontos()!).getAllByRole('alert')[1]).toHaveTextContent('The model is busy.');
    expect(within(ontos()!).getByText('Q2')).toBeInTheDocument();
    expect(input()).toBeEnabled();
  });

  it('blocks sending until consent is given', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('llm_consent_state');
    const { chatBodies } = mockBackend();
    renderShell();
    await openOntos(user);

    await user.type(input(), 'Hello{Enter}');

    const consent = await screen.findByRole('dialog', { name: /AI/i });
    expect(chatBodies).toEqual([]);
    await user.click(within(consent).getByRole('checkbox'));
    await user.click(within(consent).getByRole('button', { name: /Accept/i }));

    await waitFor(() => expect(chatBodies).toHaveLength(1));
    expect(chatBodies[0]).toMatchObject({ content: 'Hello' });
  });

  it('lists, loads and deletes server sessions from the history menu', async () => {
    const user = userEvent.setup();
    const { deleted } = mockBackend();
    renderShell();
    const win = await openOntos(user);

    await user.click(within(win).getByRole('button', { name: 'History' }));
    const history = await screen.findByRole('dialog', { name: 'History' });
    expect(await within(history).findByRole('button', { name: 'Customer data' })).toBeInTheDocument();
    expect(within(history).getByRole('button', { name: 'Domains' })).toBeInTheDocument();

    await user.click(within(history).getByRole('button', { name: 'Customer data' }));
    expect(await within(win).findByText('Where is customer data?')).toBeInTheDocument();
    expect(within(win).getByText('crm.customers')).toBeInTheDocument();
    expect(within(win).queryByText('{"raw": true}')).toBeNull();
    expect(within(win).getAllByRole('article')).toHaveLength(1); // the empty tool-call message is left out

    await user.click(within(win).getByRole('button', { name: 'History' }));
    const again = await screen.findByRole('dialog', { name: 'History' });
    await user.click(await within(again).findByRole('button', { name: 'Delete Customer data' }));

    await waitFor(() => expect(deleted).toEqual(['s1']));
    await waitFor(() => expect(within(win).queryByText('Where is customer data?')).toBeNull());
    expect(within(screen.getByRole('dialog', { name: 'History' })).queryByRole('button', { name: 'Customer data' })).toBeNull();
  });

  it('renders answers as markdown without raw HTML, with safe links', async () => {
    const user = userEvent.setup();
    mockBackend({
      chat: [{ session_id: 's', message: { id: 'a', role: 'assistant', content: 'See [products](/data-products) <img src=x onerror="alert(1)"> **now**', timestamp: '' }, tool_calls_executed: 0, sources: [] }],
    });
    renderShell();
    await openOntos(user);
    await user.type(input(), 'Q{Enter}');

    const link = await within(ontos()!).findByRole('link', { name: 'products' });
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(ontos()!.querySelector('img')).toBeNull();
    expect(within(ontos()!).getByText('now').tagName).toBe('STRONG');
  });

  it('shows the welcome card until it is dismissed', async () => {
    const user = userEvent.setup();
    localStorage.removeItem('copilot-welcome-dismissed');
    mockBackend();
    renderShell();
    const win = await openOntos(user);

    expect(within(win).getByText('Welcome to Ask Ontos!')).toBeInTheDocument();
    await user.click(within(win).getByRole('button', { name: 'Dismiss' }));
    expect(within(win).queryByText('Welcome to Ask Ontos!')).toBeNull();
    expect(localStorage.getItem('copilot-welcome-dismissed')).toBe('true');
  });

  it('drags within the viewport and Esc closes it, giving focus back', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell();
    const button = await ontosButton();
    const win = await openOntos(user);
    const handle = within(win).getByRole('heading', { name: 'Ask Ontos' });

    fireEvent.pointerDown(handle, { clientX: 900, clientY: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: -5000, clientY: -5000, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    expect(win.style.left).toBe('0px');
    expect(win.style.top).toBe('0px');
    expect(useHelixStore.getState().windowRect).toBeNull(); // each assistant keeps its own place

    input().focus();
    await user.keyboard('{Escape}');
    expect(ontos()).toBeNull();
    expect(button).toHaveFocus();
  });
});
