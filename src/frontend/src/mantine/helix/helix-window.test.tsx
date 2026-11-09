/** Helix in its two forms: the pane on /assets, a floating window everywhere else (R24). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { useCopilotStore } from '@/stores/copilot-store';
import { FeatureAccessLevel } from '@/types/settings';
import { AppShell } from '@/mantine/shell/app-shell';
import { SHELL_DEFAULTS, useShellStore } from '@/mantine/shell/use-shell-store';
import { json } from '@/mantine/asset-explorer/test-fixtures';
import { HELIX_DEFAULTS, useHelixStore, type HelixConfig } from './helix-store';
import { WINDOW_DEFAULT, WINDOW_MARGIN, WINDOW_MIN } from './helix-window-geometry';
import { frame, sseResponse } from './test-fixtures';

vi.mock('@/components/ui/user-info', () => ({ default: () => null }));
vi.mock('@/components/ui/notification-bell', () => ({ default: () => null }));
vi.mock('@/components/ui/project-chooser', () => ({ ProjectChooser: () => null }));
vi.mock('@/components/common/language-selector', () => ({ LanguageSelector: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string }) => unknown) =>
    select({ getShortName: () => 'APFM' }),
}));

const USER_MODE: HelixConfig = { enabled: true, mode: 'user', workspace_host: 'https://dbc-1.cloud.databricks.com' };

function mockBackend(helix: HelixConfig | null = USER_MODE) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/settings/helix') return helix ? json(helix) : json({ detail: 'Not Found' }, 404);
    if (url === '/api/helix/ask') return sseResponse([frame('text', { text: 'Twelve leads.' }), frame('done', {})]);
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const pageClicks = vi.fn();

function Page({ name }: { name: string }) {
  return (
    <div>
      <h1>{name}</h1>
      <button onClick={pageClicks}>Page action</button>
      <Link to="/assets">To assets</Link>
      <Link to="/search">To search</Link>
    </div>
  );
}

function renderShell(route: string) {
  return renderWithMantine(
    <AppShell>
      <Routes>
        <Route path="/assets" element={<Page name="Explorer" />} />
        <Route path="/search" element={<Page name="Search" />} />
      </Routes>
    </AppShell>,
    { route },
  );
}

const helixButton = () => screen.findByRole('button', { name: 'Ask Helix' });
const dialog = () => screen.queryByRole('dialog', { name: /Helix/ });
const pane = () => screen.queryByRole('complementary', { name: 'Helix' });

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

describe('Helix window and pane', () => {
  beforeEach(() => {
    setViewport(1200, 800);
    useHelixStore.setState(HELIX_DEFAULTS);
    useCopilotStore.setState({ isOpen: false });
    useShellStore.setState(SHELL_DEFAULTS);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    usePermissionsStore.setState({
      permissions: { search: FeatureAccessLevel.READ_ONLY, assets: FeatureAccessLevel.READ_ONLY },
      appliedRoleId: null,
      isLoading: false,
      _initAttempted: true,
      _isInitializing: false,
    });
    pageClicks.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens as a non-modal window, bottom-right, away from the explorer, and the page stays usable', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');

    await user.click(await helixButton());

    const win = dialog()!;
    expect(win).toBeInTheDocument();
    expect(win).toHaveAttribute('aria-modal', 'false');
    expect(within(win).getByRole('heading', { name: 'Helix · Genie One' }).id).toBe(win.getAttribute('aria-labelledby'));
    expect(pane()).toBeNull();
    expect(win.style.left).toBe(`${1200 - WINDOW_DEFAULT.width - WINDOW_MARGIN}px`);
    expect(win.style.top).toBe(`${800 - WINDOW_DEFAULT.height - WINDOW_MARGIN}px`);
    expect(win.style.width).toBe(`${WINDOW_DEFAULT.width}px`);

    await user.click(screen.getByRole('button', { name: 'Page action' }));
    expect(pageClicks).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeInTheDocument();
  });

  it('is the right-hand pane on /assets', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/assets');

    await user.click(await helixButton());

    expect(pane()).toBeInTheDocument();
    expect(dialog()).toBeNull();
  });

  it('keeps the conversation, context and draft while switching form on navigation', async () => {
    const user = userEvent.setup();
    mockBackend();
    useHelixStore.setState({ context: 'insights.referrals.leads' });
    renderShell('/assets');

    await user.click(await helixButton());
    await user.type(within(pane()!).getByRole('textbox', { name: 'Ask Helix' }), 'How many?{Enter}');
    expect(await within(pane()!).findByText('Twelve leads.')).toBeInTheDocument();
    await user.type(within(pane()!).getByRole('textbox', { name: 'Ask Helix' }), 'And last week?');

    await user.click(screen.getByRole('link', { name: 'To search' }));

    const win = dialog()!;
    expect(win).toBeInTheDocument();
    expect(pane()).toBeNull();
    expect(within(win).getByText('Twelve leads.')).toBeInTheDocument();
    expect(within(win).getByText('insights.referrals.leads')).toBeInTheDocument();
    expect(within(win).getByRole('textbox', { name: 'Ask Helix' })).toHaveValue('And last week?');

    await user.click(screen.getByRole('link', { name: 'To assets' }));
    expect(dialog()).toBeNull();
    expect(within(pane()!).getByText('Twelve leads.')).toBeInTheDocument();
  });

  it('drags by its header and stays inside the viewport', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    await user.click(await helixButton());
    const win = dialog()!;
    const handle = within(win).getByRole('heading', { name: 'Helix · Genie One' });

    fireEvent.pointerDown(handle, { clientX: 900, clientY: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 850, clientY: 250, pointerId: 1 });
    expect(win.style.left).toBe(`${1200 - WINDOW_DEFAULT.width - WINDOW_MARGIN - 50}px`);
    expect(win.style.top).toBe(`${800 - WINDOW_DEFAULT.height - WINDOW_MARGIN - 50}px`);

    fireEvent.pointerMove(window, { clientX: -5000, clientY: -5000, pointerId: 1 });
    expect(win.style.left).toBe('0px');
    expect(win.style.top).toBe('0px');
    fireEvent.pointerMove(window, { clientX: 9000, clientY: 9000, pointerId: 1 });
    expect(win.style.left).toBe(`${1200 - WINDOW_DEFAULT.width}px`);
    expect(win.style.top).toBe(`${800 - WINDOW_DEFAULT.height}px`);
    fireEvent.pointerUp(window, { pointerId: 1 });

    // A smaller viewport pulls it back in
    act(() => {
      setViewport(900, 600);
      window.dispatchEvent(new Event('resize'));
    });
    expect(win.style.left).toBe(`${900 - WINDOW_DEFAULT.width}px`);
    expect(win.style.top).toBe(`${600 - WINDOW_DEFAULT.height}px`);
  });

  it('resizes from its bottom-left corner, no smaller than the minimum', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    await user.click(await helixButton());
    const win = dialog()!;
    const grip = within(win).getByTestId('helix-resize');
    const left = 1200 - WINDOW_DEFAULT.width - WINDOW_MARGIN;

    fireEvent.pointerDown(grip, { clientX: left, clientY: 780, pointerId: 2, button: 0 });
    fireEvent.pointerMove(window, { clientX: left - 100, clientY: 790, pointerId: 2 });
    expect(win.style.width).toBe(`${WINDOW_DEFAULT.width + 100}px`);
    expect(win.style.left).toBe(`${left - 100}px`);
    expect(win.style.height).toBe(`${WINDOW_DEFAULT.height + 10}px`);

    fireEvent.pointerMove(window, { clientX: left + 5000, clientY: -5000, pointerId: 2 });
    expect(win.style.width).toBe(`${WINDOW_MIN.width}px`);
    expect(win.style.height).toBe(`${WINDOW_MIN.height}px`);
    expect(win.style.left).toBe(`${left + WINDOW_DEFAULT.width - WINDOW_MIN.width}px`);
    fireEvent.pointerUp(window, { pointerId: 2 });
  });

  it('closes on Esc and gives focus back to what opened it', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    const opener = await helixButton();

    await user.click(opener);
    const win = dialog()!;
    expect(win.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');

    expect(dialog()).toBeNull();
    expect(useHelixStore.getState().isOpen).toBe(false);
    expect(opener).toHaveFocus();
  });

  it('keeps its position for the session across close and reopen', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    await user.click(await helixButton());
    const handle = within(dialog()!).getByRole('heading', { name: 'Helix · Genie One' });
    fireEvent.pointerDown(handle, { clientX: 900, clientY: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 700, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const { left, top } = dialog()!.style;

    await user.click(within(dialog()!).getByRole('button', { name: 'Close Helix' }));
    expect(dialog()).toBeNull();
    await user.click(await helixButton());

    expect(dialog()!.style.left).toBe(left);
    expect(dialog()!.style.top).toBe(top);
  });

  it('closes when Ask Ontos opens, in the window form too', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    await user.click(await helixButton());
    expect(dialog()).toBeInTheDocument();

    act(() => useCopilotStore.getState().actions.openPanel());

    expect(dialog()).toBeNull();
  });
});

describe('Ask Helix in the Discover menu', () => {
  beforeEach(() => {
    setViewport(1200, 800);
    useHelixStore.setState(HELIX_DEFAULTS);
    useCopilotStore.setState({ isOpen: false });
    useShellStore.setState({ ...SHELL_DEFAULTS, openGroup: 'Discover' });
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    usePermissionsStore.setState({
      permissions: { search: FeatureAccessLevel.READ_ONLY },
      appliedRoleId: null,
      isLoading: false,
      _initAttempted: true,
      _isInitializing: false,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const menu = () => screen.getByRole('navigation', { name: 'Discover' });

  it('is the first Discover item, opens Helix without navigating, and is never active', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');

    const item = await within(menu()).findByRole('button', { name: 'Ask Helix' });
    // In document order: the panel's Pin button, then the group's items
    const entries = [...menu().querySelectorAll('a, button')];
    expect(entries[0]).toBe(within(menu()).getByRole('button', { name: /Pin/ }));
    expect(entries[1]).toBe(item);
    expect(item).not.toHaveAttribute('data-active');

    await user.click(item);

    expect(dialog()).toBeInTheDocument();
    expect(window.location.pathname).toBe('/search');
    expect(item).not.toHaveAttribute('data-active');
  });

  it('opens the pane on /assets', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/assets');

    await user.click(await within(menu()).findByRole('button', { name: 'Ask Helix' }));

    expect(pane()).toBeInTheDocument();
  });

  it('is hidden while Helix is disabled', async () => {
    const fetchMock = mockBackend(null);
    renderShell('/search');

    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/settings/helix')).toBe(true));
    expect(within(menu()).getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(within(menu()).queryByRole('button', { name: 'Ask Helix' })).toBeNull();
  });
});

describe('Helix window under StrictMode', () => {
  beforeEach(() => {
    setViewport(1200, 800);
    useHelixStore.setState({ ...HELIX_DEFAULTS, config: USER_MODE });
    useCopilotStore.setState({ isOpen: false });
  });

  it('still gives focus back to the opener after StrictMode re-runs its effects', async () => {
    const user = userEvent.setup();
    const { HelixWindow } = await import('./helix-window');
    function Harness() {
      const isOpen = useHelixStore((s) => s.isOpen);
      return (
        <>
          <button onClick={() => useHelixStore.getState().actions.open()}>Opener</button>
          {isOpen && <HelixWindow />}
        </>
      );
    }
    renderWithMantine(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );

    const opener = screen.getByRole('button', { name: 'Opener' });
    await user.click(opener);
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');

    expect(opener).toHaveFocus();
  });
});
