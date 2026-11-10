import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { FeatureAccessLevel } from '@/types/settings';
import { AppShell } from './app-shell';
import { SHELL_DEFAULTS, useShellStore } from './use-shell-store';
import { NAV } from './nav-config';
import { HELIX_DEFAULTS, useHelixStore } from '@/mantine/helix/helix-store';
import { ONTOS_DEFAULTS, useOntosStore } from '@/mantine/ontos/ontos-store';

// The top bar's own widgets fetch on mount; they aren't what this tests
vi.mock('@/components/ui/user-info', () => ({ default: () => null }));
vi.mock('@/components/ui/notification-bell', () => ({ default: () => null }));
vi.mock('@/components/ui/project-chooser', () => ({ ProjectChooser: () => null }));
vi.mock('@/components/common/language-selector', () => ({ LanguageSelector: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string }) => unknown) =>
    select({ getShortName: () => 'APFM' }),
}));

const allPermissionIds = Object.values(NAV).flatMap((sections) =>
  sections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])).map((i) => i.permissionId),
);

function grantAll() {
  usePermissionsStore.setState({
    permissions: Object.fromEntries(
      [...allPermissionIds, 'settings'].map((id) => [id, FeatureAccessLevel.ADMIN]),
    ),
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

function renderShell(route = '/') {
  return renderWithMantine(
    <AppShell>
      <div>page content</div>
    </AppShell>,
    { route },
  );
}

const panel = () => screen.queryByRole('navigation', { name: 'Build' });

describe('AppShell', () => {
  beforeEach(() => {
    useShellStore.setState(SHELL_DEFAULTS);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    grantAll();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens a group panel from the strip and closes it on a second click', async () => {
    const user = userEvent.setup();
    renderShell();
    expect(panel()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Build' }));
    expect(within(panel()!).getByText('Assets')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Build' }));
    expect(panel()).toBeNull();
  });

  it('closes the panel after navigating when it is not pinned', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Build' }));
    await user.click(within(panel()!).getByRole('button', { name: /Pinned/ }));

    await user.click(within(panel()!).getByRole('link', { name: 'Contracts' }));

    expect(window.location.pathname).toBe('/data-contracts');
    expect(panel()).toBeNull();
  });

  it('keeps a pinned panel open after navigating', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Build' }));

    await user.click(within(panel()!).getByRole('link', { name: 'Contracts' }));

    expect(panel()).not.toBeNull();
  });

  it('remembers the pin choice in localStorage', async () => {
    const user = userEvent.setup();
    const { unmount } = renderShell();
    await user.click(screen.getByRole('button', { name: 'Build' }));
    await user.click(within(panel()!).getByRole('button', { name: /Pinned/ }));
    unmount();

    const saved = localStorage.getItem('apfm-shell');
    expect(JSON.parse(saved!).state.pinned).toBe(false);

    // Forget the in-memory state (which also writes it), then load the saved one
    useShellStore.setState(SHELL_DEFAULTS);
    localStorage.setItem('apfm-shell', saved!);
    await act(() => useShellStore.persist.rehydrate());
    renderShell();

    expect(within(panel()!).getByRole('button', { name: /Pin/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the current page with aria-current', async () => {
    const user = userEvent.setup();
    renderShell('/data-contracts');
    await user.click(screen.getByRole('button', { name: 'Build' }));

    expect(within(panel()!).getByRole('link', { name: 'Contracts' })).toHaveAttribute('aria-current', 'page');
    expect(within(panel()!).getByRole('link', { name: 'My Requests' })).not.toHaveAttribute('aria-current');
  });

  it('expands a parent to show its sub-items', async () => {
    const user = userEvent.setup();
    renderShell('/data-contracts');
    await user.click(screen.getByRole('button', { name: 'Organization' }));
    const settings = screen.getByRole('navigation', { name: 'Organization' });
    expect(within(settings).queryByRole('link', { name: 'Business roles' })).toBeNull();

    await user.click(within(settings).getByRole('button', { name: 'Roles' }));

    expect(within(settings).getByRole('link', { name: 'Business roles' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/data-contracts'); // Roles has no page of its own
  });

  it('opens the sub-items of the current page', async () => {
    const user = userEvent.setup();
    renderShell('/settings/business-roles');
    await user.click(screen.getByRole('button', { name: 'Organization' }));

    const settings = screen.getByRole('navigation', { name: 'Organization' });
    expect(within(settings).getByRole('link', { name: 'Business roles' })).toHaveAttribute('aria-current', 'page');
  });

  it('hides items the user cannot read', async () => {
    usePermissionsStore.setState({
      permissions: { 'data-contracts': FeatureAccessLevel.READ_ONLY },
    });
    const user = userEvent.setup();
    renderShell();

    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Build' }));
    expect(within(panel()!).getByRole('link', { name: 'Contracts' })).toBeInTheDocument();
    expect(within(panel()!).queryByText('Assets')).toBeNull();
  });

  it('hides alpha and beta features unless the user shows them', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = () => screen.getByRole('navigation', { name: 'Settings' });
    expect(within(settings()).queryByText('Deploy')).toBeNull(); // all alpha
    expect(within(settings()).queryByText('Govern')).toBeNull(); // beta and alpha

    act(() => useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] }));
    expect(within(settings()).getByText('Govern')).toBeInTheDocument();
    expect(within(settings()).getByRole('link', { name: 'Security Features' })).toBeInTheDocument();
  });

  it('hides the settings-area strip entries without the settings gate, keeping Govern and Deploy under the Govern button', async () => {
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] });
    usePermissionsStore.setState({
      permissions: Object.fromEntries(allPermissionIds.map((id) => [id, FeatureAccessLevel.ADMIN])),
    });
    const user = userEvent.setup();
    renderShell();
    const strip = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(strip).getByRole('button', { name: 'Build' })).toBeInTheDocument();
    for (const name of ['Organization', 'Semantics']) {
      expect(within(strip).queryByRole('button', { name })).toBeNull();
    }
    expect(within(strip).queryByRole('link', { name: 'Workflows' })).toBeNull();

    expect(within(strip).queryByRole('button', { name: 'Settings' })).toBeNull();
    await user.click(within(strip).getByRole('button', { name: 'Govern' }));
    const settings = screen.getByRole('navigation', { name: 'Govern' });
    expect(within(settings).queryByText('Platform')).toBeNull();
    expect(within(settings).queryByText('Process')).toBeNull();
    expect(within(settings).queryByRole('link', { name: 'General' })).toBeNull();
    // The panel title and its Govern section
    expect(within(settings).getAllByText('Govern')).toHaveLength(2);
    expect(within(settings).getByText('Deploy')).toBeInTheDocument();
    expect(within(settings).getByRole('link', { name: 'Compliance' })).toHaveAttribute('href', '/compliance');
  });

  it('labels the bottom button Govern, with the Shield icon, for a user with compliance access and no gate', async () => {
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] }); // Compliance is beta
    usePermissionsStore.setState({ permissions: { compliance: FeatureAccessLevel.READ_ONLY } });
    const user = userEvent.setup();
    renderShell('/compliance');
    const strip = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(strip).queryByRole('button', { name: 'Settings' })).toBeNull();
    const govern = within(strip).getByRole('button', { name: 'Govern' });
    expect(govern.querySelector('svg.lucide-shield')).not.toBeNull();
    expect(govern.querySelector('svg.lucide-settings')).toBeNull();

    await user.click(govern);
    const panel = screen.getByRole('navigation', { name: 'Govern' });
    expect(within(panel).getAllByText('Govern')).toHaveLength(2); // the title and the section
    expect([...panel.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Compliance']);
    expect(within(panel).getByRole('link', { name: 'Compliance' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Settings, with its icon, for a user with the settings gate', async () => {
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] }); // Compliance is beta
    const user = userEvent.setup();
    renderShell('/compliance');
    const strip = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(strip).queryByRole('button', { name: 'Govern' })).toBeNull();
    const settingsButton = within(strip).getByRole('button', { name: 'Settings' });
    expect(settingsButton.querySelector('svg.lucide-settings')).not.toBeNull();

    await user.click(settingsButton);
    const panel = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(panel).getByText('Platform')).toBeInTheDocument();
    expect(within(panel).getByText('Govern')).toBeInTheDocument();
  });

  it('renders the brand and the page content', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'APFM · Ontos' })).toHaveAttribute('href', '/');
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});

describe('the side strip', () => {
  const strip = () => screen.getByRole('navigation', { name: 'Main menu' });

  beforeEach(() => {
    useShellStore.setState(SHELL_DEFAULTS);
    useHelixStore.setState(HELIX_DEFAULTS);
    useOntosStore.setState(ONTOS_DEFAULTS);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] });
    grantAll();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const controls = (el: HTMLElement) => [...el.querySelectorAll('a, button')].map((c) => c.textContent);

  it('lists Discover, Build, Organization, Semantics, Workflows, Helix, Ontos, then Settings', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body =
        url === '/api/settings/helix' ? { enabled: true, mode: 'user', workspace_host: 'h' }
        : url === '/api/llm-search/status' ? { enabled: true, endpoint: 'ep', disclaimer: '', adoption_mode: 'active' }
        : [];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    renderShell();
    await within(strip()).findByRole('button', { name: 'Ask Helix' });
    await within(strip()).findByRole('button', { name: 'Ask Ontos' });

    const names = [...strip().querySelectorAll('button, a')].map((el) => el.getAttribute('aria-label') ?? el.textContent);
    expect(names).toEqual([
      'Discover', 'Build', 'Organization', 'Semantics', 'Workflows', 'Ask Helix', 'Ask Ontos', 'Settings',
    ]);
  });

  it('goes straight to /settings/workflows from Workflows, without a panel, and marks it current', async () => {
    const user = userEvent.setup();
    renderShell('/data-contracts');
    const workflows = within(strip()).getByRole('link', { name: 'Workflows' });
    expect(workflows).not.toHaveAttribute('aria-current');
    expect(workflows).not.toHaveAttribute('aria-expanded');

    // An unpinned panel is open first
    act(() => useShellStore.setState({ pinned: false }));
    await user.click(within(strip()).getByRole('button', { name: 'Build' }));
    expect(screen.getByRole('navigation', { name: 'Build' })).toBeInTheDocument();

    await user.click(workflows);

    expect(window.location.pathname).toBe('/settings/workflows');
    expect(screen.queryByRole('navigation', { name: 'Build' })).toBeNull();
    expect(useShellStore.getState().openGroup).not.toBe('Workflows');
    expect(useShellStore.getState().openGroup).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Workflows' })).toBeNull();
    expect(workflows).toHaveAttribute('aria-current', 'page');
  });

  it('marks Workflows current on its sub-pages', () => {
    renderShell('/settings/workflows/new');
    expect(within(strip()).getByRole('link', { name: 'Workflows' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens Organization with its items, and Semantics with its own', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(within(strip()).getByRole('button', { name: 'Organization' }));
    const org = screen.getByRole('navigation', { name: 'Organization' });
    expect(controls(org)).toEqual([
      'Pinned', 'Data domains', 'Teams', 'Projects', 'Roles', 'Directory',
    ]);

    await user.click(within(strip()).getByRole('button', { name: 'Semantics' }));
    const sem = screen.getByRole('navigation', { name: 'Semantics' });
    expect(controls(sem)).toEqual([
      'Pinned', 'Semantic models', 'Asset types', 'Tags', 'Levels',
    ]);
    expect(screen.queryByRole('navigation', { name: 'Organization' })).toBeNull();
  });

  it('no longer lists the moved items in Settings', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(within(strip()).getByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('navigation', { name: 'Settings' });
    for (const name of ['Teams', 'Tags', 'Workflows', 'Data domains', 'Semantic models']) {
      expect(within(settings).queryByRole('link', { name })).toBeNull();
    }
    expect(within(settings).getByRole('link', { name: 'Delivery' })).toBeInTheDocument();
    expect(within(settings).getByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  });

  it('highlights the current page inside a new group', async () => {
    const user = userEvent.setup();
    renderShell('/settings/asset-types');
    await user.click(within(strip()).getByRole('button', { name: 'Semantics' }));
    const sem = screen.getByRole('navigation', { name: 'Semantics' });
    expect(within(sem).getByRole('link', { name: 'Asset types' })).toHaveAttribute('aria-current', 'page');
  });

  it('closes an unpinned new group after navigating', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(within(strip()).getByRole('button', { name: 'Organization' }));
    const org = () => screen.queryByRole('navigation', { name: 'Organization' });
    await user.click(within(org()!).getByRole('button', { name: /Pinned/ }));

    await user.click(within(org()!).getByRole('link', { name: 'Teams' }));

    expect(window.location.pathname).toBe('/settings/teams');
    expect(org()).toBeNull();
  });

  it('opens a stored Settings panel, and ignores a stored group it does not know', async () => {
    localStorage.setItem('apfm-shell', JSON.stringify({ state: { openGroup: 'Settings', pinned: true, expanded: [] }, version: 0 }));
    await act(() => useShellStore.persist.rehydrate());
    const { unmount } = renderShell();
    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeInTheDocument();
    unmount();

    for (const stored of ['Govern', 'Deploy', 'Workflows', 'toString', 42]) {
      localStorage.setItem('apfm-shell', JSON.stringify({ state: { openGroup: stored, pinned: true, expanded: [] }, version: 0 }));
      await act(() => useShellStore.persist.rehydrate());
      expect(useShellStore.getState().openGroup).toBeNull();
      const view = renderShell();
      expect(screen.getByText('page content')).toBeInTheDocument();
      expect(document.getElementById('shell-group-panel')).toBeNull();
      view.unmount();
    }
  });
});
