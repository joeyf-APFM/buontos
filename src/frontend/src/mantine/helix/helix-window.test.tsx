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
import { WINDOW_DEFAULT, WINDOW_MARGIN, WINDOW_MIN } from '@/mantine/assistant/window-geometry';
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
      <Link to="/form">To form</Link>
    </div>
  );
}

function FormPage() {
  return (
    <div>
      <h1>Form</h1>
      <input aria-label="Page field" autoFocus />
    </div>
  );
}

function renderShell(route: string) {
  return renderWithMantine(
    <AppShell>
      <Routes>
        <Route path="/assets" element={<Page name="Explorer" />} />
        <Route path="/search" element={<Page name="Search" />} />
        <Route path="/form" element={<FormPage />} />
      </Routes>
    </AppShell>,
    { route },
  );
}

/** The top-bar button. */
const helixButton = async () => within(await screen.findByRole('banner')).findByRole('button', { name: 'Ask Helix' });
/** The icon strip's button. */
const stripButton = async () => within(await screen.findByRole('navigation', { name: 'Main menu' })).findByRole('button', { name: 'Ask Helix' });
const dialog = () => screen.queryByRole('dialog', { name: /Helix/ });
const pane = () => screen.queryByRole('complementary', { name: 'Helix' });

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

describe('Helix window', () => {
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

  it('opens as a non-modal window, bottom-right, and the page stays usable', async () => {
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

  it('is the window on /assets too, not a pane', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/assets');

    await user.click(await helixButton());

    expect(dialog()).toBeInTheDocument();
    expect(pane()).toBeNull();
  });

  it('keeps the window, its position, the conversation, context and draft while navigating', async () => {
    const user = userEvent.setup();
    mockBackend();
    useHelixStore.setState({ context: 'insights.referrals.leads' });
    renderShell('/assets');

    await user.click(await helixButton());
    const handle = within(dialog()!).getByRole('heading', { name: 'Helix · Genie One' });
    fireEvent.pointerDown(handle, { clientX: 900, clientY: 300, pointerId: 1, button: 0 });
    fireEvent.pointerMove(window, { clientX: 700, clientY: 200, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const { left, top } = dialog()!.style;
    await user.type(within(dialog()!).getByRole('textbox', { name: 'Ask Helix' }), 'How many?{Enter}');
    expect(await within(dialog()!).findByText('Twelve leads.')).toBeInTheDocument();
    await user.type(within(dialog()!).getByRole('textbox', { name: 'Ask Helix' }), 'And last week?');
    const before = dialog();

    await user.click(screen.getByRole('link', { name: 'To search' }));

    const win = dialog()!;
    expect(win).toBe(before); // the same window, not a new one
    expect(win.style.left).toBe(left);
    expect(win.style.top).toBe(top);
    expect(within(win).getByText('Twelve leads.')).toBeInTheDocument();
    expect(within(win).getByText('insights.referrals.leads')).toBeInTheDocument();
    expect(within(win).getByRole('textbox', { name: 'Ask Helix' })).toHaveValue('And last week?');
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
    const grip = within(win).getByTestId('assistant-resize');
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

  it('leaves focus on the new page when navigating with Helix open', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/assets');
    await user.click(await helixButton());
    expect(within(dialog()!).getByRole('textbox', { name: 'Ask Helix' })).toHaveFocus(); // a user open focuses Helix

    await user.click(screen.getByRole('link', { name: 'To form' }));

    expect(dialog()).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Page field' })).toHaveFocus();
  });

  it('labels shared mode in the window too', async () => {
    const user = userEvent.setup();
    mockBackend({ ...USER_MODE, mode: 'shared' });
    renderShell('/search');
    await user.click(await helixButton());

    expect(within(dialog()!).getByText('Answering as APFM Helix, not as you')).toBeInTheDocument();
  });

  it('keeps following its bottom-right default on viewport resizes until it is moved', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    await user.click(await helixButton());

    act(() => {
      setViewport(1000, 700);
      window.dispatchEvent(new Event('resize'));
    });
    act(() => {
      setViewport(1300, 900);
      window.dispatchEvent(new Event('resize'));
    });

    expect(dialog()!.style.left).toBe(`${1300 - WINDOW_DEFAULT.width - WINDOW_MARGIN}px`);
    expect(dialog()!.style.top).toBe(`${900 - WINDOW_DEFAULT.height - WINDOW_MARGIN}px`);
    expect(useHelixStore.getState().windowRect).toBeNull();
  });

  it('closes when Ask Ontos opens', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    await user.click(await helixButton());
    expect(dialog()).toBeInTheDocument();

    act(() => useCopilotStore.getState().actions.openPanel());

    expect(dialog()).toBeNull();
  });
});

describe('Ask Helix in the icon strip', () => {
  beforeEach(() => {
    setViewport(1200, 800);
    useHelixStore.setState(HELIX_DEFAULTS);
    useCopilotStore.setState({ isOpen: false });
    useShellStore.setState(SHELL_DEFAULTS);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    usePermissionsStore.setState({
      permissions: { search: FeatureAccessLevel.READ_ONLY, assets: FeatureAccessLevel.READ_ONLY, settings: FeatureAccessLevel.READ_ONLY, 'settings-general': FeatureAccessLevel.READ_ONLY },
      appliedRoleId: null,
      isLoading: false,
      _initAttempted: true,
      _isInitializing: false,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const strip = () => screen.getByRole('navigation', { name: 'Main menu' });

  it('sits after the top groups, above Settings, labelled Helix, with the Dna icon', async () => {
    mockBackend();
    renderShell('/search');

    const button = await stripButton();
    const names = [...strip().querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Discover', 'Build', 'Ask Helix', 'Settings']);
    expect(button).toHaveTextContent('Helix');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('[data-helix-icon="dna"]')).not.toBeNull();
  });

  it('uses the same Dna icon on the top-bar button and the window header', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    const top = await helixButton();
    expect(top.querySelector('[data-helix-icon="dna"]')).not.toBeNull();

    await user.click(top);

    const header = within(dialog()!).getByRole('heading', { name: 'Helix · Genie One' }).parentElement!;
    expect(header.querySelector('[data-helix-icon="dna"]')).not.toBeNull();
  });

  it('opens the window as a user open (focusing its input), without a group panel, and closes it again', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    const button = await stripButton();

    await user.click(button);

    expect(dialog()).toBeInTheDocument();
    expect(within(dialog()!).getByRole('textbox', { name: 'Ask Helix' })).toHaveFocus();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).not.toHaveAttribute('data-open');
    expect(useShellStore.getState().openGroup).toBeNull();
    expect(window.location.pathname).toBe('/search');

    await user.click(button);

    expect(dialog()).toBeNull();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the window on /assets too', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/assets');

    await user.click(await stripButton());

    expect(dialog()).toBeInTheDocument();
    expect(pane()).toBeNull();
  });

  it('is not in the Discover panel', async () => {
    const user = userEvent.setup();
    mockBackend();
    renderShell('/search');
    await stripButton();

    await user.click(within(strip()).getByRole('button', { name: 'Discover' }));

    const menu = screen.getByRole('navigation', { name: 'Discover' });
    expect(within(menu).getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: 'Ask Helix' })).toBeNull();
  });

  it('is hidden while Helix is disabled', async () => {
    const fetchMock = mockBackend(null);
    renderShell('/search');

    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/settings/helix')).toBe(true));
    expect(within(strip()).getByRole('button', { name: 'Discover' })).toBeInTheDocument();
    expect(within(strip()).queryByRole('button', { name: 'Ask Helix' })).toBeNull();
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
