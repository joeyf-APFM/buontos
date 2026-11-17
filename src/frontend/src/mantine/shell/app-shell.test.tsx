import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { Link } from 'react-router-dom';
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

// Every item's permission, at any depth (Define's Generate Ontology needs ontology)
type Item = (typeof NAV)[keyof typeof NAV][number]['items'][number];
const withChildren = (i: Item): Item[] => [i, ...(i.children ?? []).flatMap(withChildren)];
const allPermissionIds = Object.values(NAV).flatMap((sections) =>
  sections.flatMap((s) => s.items.flatMap(withChildren)).map((i) => i.permissionId),
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

function renderShell(route = '/', page: React.ReactNode = <div>page content</div>) {
  return renderWithMantine(
    <AppShell>
      {page}
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

    await user.click(within(panel()!).getByRole('link', { name: 'Data Contracts' }));

    expect(window.location.pathname).toBe('/data-contracts');
    expect(panel()).toBeNull();
  });

  it('keeps a pinned panel open after navigating', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Build' }));

    await user.click(within(panel()!).getByRole('link', { name: 'Data Contracts' }));

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

    expect(within(panel()!).getByRole('link', { name: 'Explorer' })).toHaveAttribute('aria-current', 'page');
    expect(within(panel()!).getByRole('link', { name: 'My Requests' })).not.toHaveAttribute('aria-current');
  });

  it('expands a parent to show its sub-items', async () => {
    const user = userEvent.setup();
    renderShell('/data-contracts');
    await user.click(screen.getByRole('button', { name: 'Organization' }));
    const settings = screen.getByRole('navigation', { name: 'Organization' });
    expect(within(settings).queryByRole('link', { name: 'Business roles' })).toBeNull();
    const before = window.location.pathname; // Organization's default page

    await user.click(within(settings).getByRole('button', { name: 'Roles' }));

    expect(within(settings).getByRole('link', { name: 'Business roles' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(before); // Roles has no page of its own
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
    expect(within(panel()!).getByRole('link', { name: 'Data Contracts' })).toBeInTheDocument();
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
    // The panel title only: the Govern section's heading would repeat it
    expect(within(settings).getAllByText('Govern')).toHaveLength(1);
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
    expect(within(panel).getAllByText('Govern')).toHaveLength(1); // the title; no repeated section heading
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
    expect(screen.getByRole('link', { name: 'APFM · Nucleus' })).toHaveAttribute('href', '/');
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

  it('lists Discover, Build, Organization, Semantics, Workflows, Helix, Nucleus, then Settings', async () => {
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
    await within(strip()).findByRole('button', { name: 'Ask Nucleus' });

    const names = [...strip().querySelectorAll('button, a')].map((el) => el.getAttribute('aria-label') ?? el.textContent);
    expect(names).toEqual([
      'Discover', 'Build', 'Organization', 'Semantics', 'Workflows', 'Ask Helix', 'Ask Nucleus', 'Settings',
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
      'Pinned', 'Data domains', 'Teams', 'Projects', 'Roles',
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

describe('the side menu (Task 16c)', () => {
  const strip = () => screen.getByRole('navigation', { name: 'Main menu' });
  const panelOf = (name: string) => screen.queryByRole('navigation', { name });
  const shownPanel = () => document.getElementById('shell-group-panel');
  const highlighted = (el: HTMLElement) => [...el.querySelectorAll('[data-active]')].map((c) => c.textContent);
  const openPinned = (group: 'Build' | 'Settings' | 'Organization') => act(() => useShellStore.setState({ openGroup: group, pinned: true }));

  beforeEach(() => {
    useShellStore.setState(SHELL_DEFAULTS);
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    grantAll();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('[]', { status: 200 }))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('a default page per group', () => {
    it.each([
      ['Discover', '/marketplace', 'Marketplace'],
      ['Build', '/assets', 'Explorer'],
      ['Organization', '/settings/data-domains', 'Data domains'],
      ['Semantics', '/settings/semantic-models', 'Semantic models'],
    ])('opens %s and goes to %s', async (group, path, item) => {
      const user = userEvent.setup();
      renderShell('/');
      await user.click(within(strip()).getByRole('button', { name: group }));

      expect(window.location.pathname).toBe(path);
      const panel = panelOf(group)!;
      expect(panel).not.toBeNull();
      expect(within(panel).getByRole('link', { name: item })).toHaveAttribute('aria-current', 'page');
    });

    it('keeps an unpinned panel open on the default page it went to', async () => {
      useShellStore.setState({ pinned: false });
      const user = userEvent.setup();
      renderShell('/');
      await user.click(within(strip()).getByRole('button', { name: 'Discover' }));

      expect(window.location.pathname).toBe('/marketplace');
      expect(panelOf('Discover')).not.toBeNull();
      // and the next navigation closes it, as before
      await user.click(within(panelOf('Discover')!).getByRole('link', { name: 'Data Catalog' }));
      expect(panelOf('Discover')).toBeNull();
    });

    it('stays on the page when it already belongs to the group', async () => {
      const user = userEvent.setup();
      renderShell('/data-catalog');
      await user.click(within(strip()).getByRole('button', { name: 'Discover' }));

      expect(window.location.pathname).toBe('/data-catalog');
      expect(within(panelOf('Discover')!).getByRole('link', { name: 'Data Catalog' })).toHaveAttribute('aria-current', 'page');
    });

    it('tucks the open group away without navigating', async () => {
      const user = userEvent.setup();
      renderShell('/search');
      openPinned('Build');
      await user.click(within(strip()).getByRole('button', { name: 'Build' }));

      expect(panelOf('Build')).toBeNull();
      expect(window.location.pathname).toBe('/search');
    });

    it('opens Settings without going anywhere (it has no default page)', async () => {
      const user = userEvent.setup();
      renderShell('/search');
      await user.click(within(strip()).getByRole('button', { name: 'Settings' }));

      expect(panelOf('Settings')).not.toBeNull();
      expect(window.location.pathname).toBe('/search');
    });

    it('goes to the first item the user can see when the default is hidden', async () => {
      usePermissionsStore.setState({
        permissions: { search: FeatureAccessLevel.READ_ONLY, 'data-catalog': FeatureAccessLevel.READ_ONLY },
      });
      const user = userEvent.setup();
      renderShell('/');
      await user.click(within(strip()).getByRole('button', { name: 'Discover' }));

      expect(window.location.pathname).toBe('/search');
    });

    it('closes even a pinned panel from Workflows, and keeps the pin', async () => {
      const user = userEvent.setup();
      renderShell('/search');
      openPinned('Build');
      await user.click(within(strip()).getByRole('link', { name: 'Workflows' }));

      expect(window.location.pathname).toBe('/settings/workflows');
      expect(shownPanel()).toBeNull();
      expect(useShellStore.getState()).toMatchObject({ openGroup: null, pinned: true });
    });

    it('closes a pinned panel from Workflows when already on its page', async () => {
      const user = userEvent.setup();
      renderShell('/settings/workflows');
      openPinned('Build');
      await user.click(within(strip()).getByRole('link', { name: 'Workflows' }));

      expect(shownPanel()).toBeNull();
      expect(useShellStore.getState().pinned).toBe(true);
    });
  });

  describe('one highlight', () => {
    it('highlights only the open panel in the strip, and only Explorer in the Build panel on /assets', () => {
      renderShell('/assets');
      openPinned('Build');
      expect(highlighted(strip())).toEqual(['Build']);
      expect(highlighted(panelOf('Build')!)).toEqual(['Explorer']);
      expect(within(panelOf('Build')!).getByRole('link', { name: 'Assets' })).not.toHaveAttribute('aria-current');
    });

    it("highlights the current page's group in the strip when no panel shows", () => {
      renderShell('/settings/asset-types');
      expect(highlighted(strip())).toEqual(['Semantics']);
    });

    it("highlights nothing in a panel that isn't the current page's group", () => {
      renderShell('/settings/asset-types');
      openPinned('Build');
      expect(highlighted(strip())).toEqual(['Build']);
      const build = panelOf('Build')!;
      expect(highlighted(build)).toEqual([]);
      expect(build.querySelector('[aria-current]')).toBeNull();
    });

    it('highlights only Explorer under Data Contracts on /data-contracts and its detail pages', () => {
      for (const route of ['/data-contracts', '/data-contracts/abc']) {
        const view = renderShell(route);
        openPinned('Build');
        const build = panelOf('Build')!;
        expect(highlighted(build)).toEqual(['Explorer']);
        expect(within(build).getByRole('link', { name: 'Data Contracts' })).not.toHaveAttribute('aria-current');
        view.unmount();
      }
    });

    it('highlights New Contract while ?new=1 is in the URL', () => {
      renderShell('/data-contracts?new=1');
      openPinned('Build');
      expect(highlighted(panelOf('Build')!)).toEqual(['New Contract']);
      expect(within(panelOf('Build')!).getByRole('link', { name: 'New Contract' })).toHaveAttribute('href', '/data-contracts?new=1');
    });

    it('highlights Workflows alone on its page', () => {
      renderShell('/settings/workflows');
      expect(highlighted(strip())).toEqual(['Workflows']);
    });

    it('highlights the open panel, not Workflows, when a panel is open on a Workflows page', () => {
      renderShell('/settings/workflows/new');
      openPinned('Settings');
      expect(highlighted(strip())).toEqual(['Settings']);
    });
  });

  describe('Build → Data Contracts', () => {
    it('offers New Contract to a user who can create contracts', () => {
      renderShell('/data-contracts');
      openPinned('Build');
      expect(within(panelOf('Build')!).getByRole('link', { name: 'New Contract' })).toBeInTheDocument();
    });

    it('hides New Contract from a user who can only read contracts', () => {
      usePermissionsStore.setState({ permissions: { 'data-contracts': FeatureAccessLevel.READ_ONLY } });
      renderShell('/data-contracts');
      openPinned('Build');
      const build = panelOf('Build')!;
      expect(within(build).getByRole('link', { name: 'Explorer' })).toBeInTheDocument();
      expect(within(build).queryByRole('link', { name: 'New Contract' })).toBeNull();
    });
  });

  describe('Build → Concepts', () => {
    it('lists Define, Explore, Search, Hierarchy Browser, Enrich, Term Mapping and Collections, and no Import', () => {
      renderShell('/concepts/define');
      openPinned('Build');
      const build = panelOf('Build')!;
      const concepts = within(build).getByRole('link', { name: 'Concepts' }).parentElement!;
      expect([...concepts.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
        'Concepts', 'Define', 'Explore', 'Search', 'Hierarchy Browser', 'Enrich', 'Term Mapping', 'Collections',
      ]);
      expect(highlighted(build)).toEqual(['Define']);
    });
  });

  describe('the menu follows navigation', () => {
    const go = (to: string) => <Link to={to}>go</Link>;

    it('switches a showing panel to the new page\'s group and highlights the page', async () => {
      const user = userEvent.setup();
      renderShell('/data-contracts/abc', go('/settings/data-domains/xyz'));
      openPinned('Build');
      await user.click(screen.getByRole('link', { name: 'go' }));

      expect(panelOf('Build')).toBeNull();
      const org = panelOf('Organization')!;
      expect(org).not.toBeNull();
      expect(highlighted(org)).toEqual(['Data domains']);
      expect(within(org).getByRole('link', { name: 'Data domains' })).toHaveAttribute('aria-current', 'page');
      expect(highlighted(strip())).toEqual(['Organization']);
    });

    it('expands the parent of the page it switches to', async () => {
      const user = userEvent.setup();
      renderShell('/assets', go('/settings/business-roles'));
      openPinned('Build');
      await user.click(screen.getByRole('link', { name: 'go' }));

      const org = panelOf('Organization')!;
      expect(within(org).getByRole('button', { name: 'Roles' })).toHaveAttribute('aria-expanded', 'true');
      expect(highlighted(org)).toEqual(['Business roles']);
    });

    it('opens no panel when none was showing, and moves the strip highlight', async () => {
      const user = userEvent.setup();
      renderShell('/data-contracts/abc', go('/settings/data-domains/xyz'));
      expect(highlighted(strip())).toEqual(['Build']);
      await user.click(screen.getByRole('link', { name: 'go' }));

      expect(shownPanel()).toBeNull();
      expect(highlighted(strip())).toEqual(['Organization']);
    });

    it('keeps the panel on a page in no group, with nothing highlighted in it', async () => {
      const user = userEvent.setup();
      renderShell('/assets', go('/'));
      openPinned('Build');
      await user.click(screen.getByRole('link', { name: 'go' }));

      expect(highlighted(panelOf('Build')!)).toEqual([]);
      expect(highlighted(strip())).toEqual(['Build']);
    });

    it('closes the panel on the Workflows page', async () => {
      const user = userEvent.setup();
      renderShell('/assets', go('/settings/workflows'));
      openPinned('Build');
      await user.click(screen.getByRole('link', { name: 'go' }));

      expect(shownPanel()).toBeNull();
      expect(useShellStore.getState().pinned).toBe(true);
    });

    it('follows back', async () => {
      const user = userEvent.setup();
      renderShell('/assets', go('/settings/teams'));
      openPinned('Build');
      await user.click(screen.getByRole('link', { name: 'go' }));
      expect(panelOf('Organization')).not.toBeNull();

      await act(async () => {
        window.history.back();
        await new Promise((r) => window.addEventListener('popstate', r, { once: true }));
      });
      expect(window.location.pathname).toBe('/assets');
      expect(highlighted(panelOf('Build')!)).toEqual(['Explorer']);
    });
  });

  // Fix round 1 ruling: a navigation from the menu keeps the group it was made in
  describe('menu navigation keeps the clicked group', () => {
    const go = (to: string) => <Link to={to}>go</Link>;
    const historyStep = (step: () => void) =>
      act(async () => {
        const popped = new Promise((r) => window.addEventListener('popstate', r, { once: true }));
        step();
        await popped;
      });

    it("keeps Build showing, with Asset types highlighted in it, after clicking Build's Asset types", async () => {
      const user = userEvent.setup();
      renderShell('/assets');
      openPinned('Build');
      await user.click(within(panelOf('Build')!).getByRole('link', { name: 'Asset types' }));

      expect(window.location.pathname).toBe('/settings/asset-types');
      expect(panelOf('Semantics')).toBeNull();
      const build = panelOf('Build')!;
      expect(highlighted(build)).toEqual(['Asset types']);
      expect(within(build).getByRole('link', { name: 'Asset types' })).toHaveAttribute('aria-current', 'page');
      expect(highlighted(strip())).toEqual(['Build']);
    });

    it('stays in the group when its default falls back to a page another group also lists', async () => {
      usePermissionsStore.setState({
        permissions: { 'settings-asset-types': FeatureAccessLevel.READ_ONLY, settings: FeatureAccessLevel.READ_ONLY },
      });
      const user = userEvent.setup();
      renderShell('/');
      await user.click(within(strip()).getByRole('button', { name: 'Build' }));

      expect(window.location.pathname).toBe('/settings/asset-types');
      expect(highlighted(panelOf('Build')!)).toEqual(['Asset types']);
      expect(highlighted(strip())).toEqual(['Build']);
    });

    it("restores each history entry's group on back and forward", async () => {
      const user = userEvent.setup();
      renderShell('/assets', go('/settings/teams'));
      openPinned('Build');
      await user.click(within(panelOf('Build')!).getByRole('link', { name: 'Asset types' }));
      await user.click(screen.getByRole('link', { name: 'go' }));
      expect(highlighted(panelOf('Organization')!)).toEqual(['Teams']);

      await historyStep(() => window.history.back());
      expect(window.location.pathname).toBe('/settings/asset-types');
      expect(highlighted(panelOf('Build')!)).toEqual(['Asset types']);

      await historyStep(() => window.history.forward());
      expect(window.location.pathname).toBe('/settings/teams');
      expect(highlighted(panelOf('Organization')!)).toEqual(['Teams']);
    });

    it('still gives /settings/asset-types to Semantics from a typed URL or an in-page link', async () => {
      const view = renderShell('/settings/asset-types');
      expect(highlighted(strip())).toEqual(['Semantics']);
      view.unmount();

      const user = userEvent.setup();
      renderShell('/assets', go('/settings/asset-types'));
      openPinned('Build');
      await user.click(screen.getByRole('link', { name: 'go' }));

      expect(panelOf('Build')).toBeNull();
      expect(highlighted(panelOf('Semantics')!)).toEqual(['Asset types']);
      expect(highlighted(strip())).toEqual(['Semantics']);
    });

    it('marks menu navigations with { nav: "menu", navGroup }', async () => {
      const user = userEvent.setup();
      renderShell('/');
      await user.click(within(strip()).getByRole('button', { name: 'Discover' }));
      expect(window.history.state?.usr).toEqual({ nav: 'menu', navGroup: 'Discover' });

      await user.click(within(panelOf('Discover')!).getByRole('link', { name: 'Search' }));
      expect(window.history.state?.usr).toEqual({ nav: 'menu', navGroup: 'Discover' });

      await user.click(within(strip()).getByRole('link', { name: 'Workflows' }));
      expect(window.history.state?.usr).toEqual({ nav: 'menu', navGroup: 'Workflows' });
    });

    it('closes an unpinned panel after New Contract, which changes only the search', async () => {
      useShellStore.setState({ pinned: false });
      const user = userEvent.setup();
      renderShell('/data-contracts');
      await user.click(within(strip()).getByRole('button', { name: 'Build' }));
      await user.click(within(panelOf('Build')!).getByRole('link', { name: 'New Contract' }));

      expect(window.location.search).toBe('?new=1');
      expect(panelOf('Build')).toBeNull();
    });
  });
  describe('Build → Concepts → Define (Task 16e)', () => {
    const go = (to: string) => <Link to={to}>go</Link>;
    const build = () => panelOf('Build')!;
    const link = (name: string) => within(build()).getByRole('link', { name });
    const DEFINE_CHILDREN = ['Author Concepts', 'Generate Ontology', 'Import RDF'];

    it('renders Build → Concepts → Define → its three items, one indent level per depth', () => {
      renderShell('/concepts/define?open=author');
      openPinned('Build');

      expect(link('Concepts')).toHaveAttribute('aria-expanded', 'true');
      expect(link('Define')).toHaveAttribute('aria-expanded', 'true');
      const concepts = link('Concepts').parentElement!;
      expect([...concepts.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
        'Concepts', 'Define', ...DEFINE_CHILDREN, 'Explore', 'Search', 'Hierarchy Browser', 'Enrich', 'Term Mapping', 'Collections',
      ]);
      expect([link('Concepts'), link('Define'), link('Explore'), ...DEFINE_CHILDREN.map(link)].map((a) => a.dataset.depth))
        .toEqual(['0', '1', '1', '2', '2', '2']);
      expect(DEFINE_CHILDREN.map((name) => link(name).getAttribute('href'))).toEqual([
        '/concepts/define?open=author', '/concepts/define?open=generate', '/concepts/define?open=import',
      ]);
      // Collections stays Concepts' last child
      expect(link('Collections').dataset.depth).toBe('1');
    });

    it('folds and unfolds Define with its caret, remembered in expanded, without leaving its page', async () => {
      const user = userEvent.setup();
      renderShell('/concepts/define');
      openPinned('Build');
      expect(link('Define')).toHaveAttribute('aria-expanded', 'false');
      expect(within(build()).queryByRole('link', { name: 'Author Concepts' })).toBeNull();

      await user.click(link('Define'));
      expect(link('Define')).toHaveAttribute('aria-expanded', 'true');
      expect(DEFINE_CHILDREN.map((name) => link(name))).toHaveLength(3);
      expect(useShellStore.getState().expanded).toContain('concept-define');
      expect(window.location.pathname + window.location.search).toBe('/concepts/define');

      await user.click(link('Define'));
      expect(link('Define')).toHaveAttribute('aria-expanded', 'false');
      expect(within(build()).queryByRole('link', { name: 'Author Concepts' })).toBeNull();
      expect(useShellStore.getState().expanded).not.toContain('concept-define');
    });

    it('folds and unfolds Define from the keyboard, as the other parents', async () => {
      const user = userEvent.setup();
      renderShell('/concepts/define');
      openPinned('Build');
      act(() => link('Define').focus());
      await user.keyboard('{Enter}');
      expect(link('Define')).toHaveAttribute('aria-expanded', 'true');
      await user.tab();
      expect(link('Author Concepts')).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(window.location.search).toBe('?open=author');
    });

    it("goes to Define's page and unfolds it when its label is clicked from another page", async () => {
      const user = userEvent.setup();
      renderShell('/concepts/browser');
      openPinned('Build');
      await user.click(link('Define'));

      expect(window.location.pathname + window.location.search).toBe('/concepts/define');
      expect(link('Define')).toHaveAttribute('aria-expanded', 'true');
      expect(highlighted(build())).toEqual(['Define']);
    });

    it('highlights Define alone on /concepts/define, and only Author Concepts on ?open=author', async () => {
      const user = userEvent.setup();
      const view = renderShell('/concepts/define');
      openPinned('Build');
      await user.click(link('Define')); // unfolded: Define is still the page
      expect(highlighted(build())).toEqual(['Define']);
      expect(link('Define')).toHaveAttribute('aria-current', 'page');
      view.unmount();

      renderShell('/concepts/define?open=author');
      openPinned('Build');
      expect(highlighted(build())).toEqual(['Author Concepts']);
      expect(link('Author Concepts')).toHaveAttribute('aria-current', 'page');
      expect(link('Define')).not.toHaveAttribute('aria-current');
      expect(link('Concepts')).not.toHaveAttribute('aria-current');
    });

    it('lets folded Define stand in for its open item, as the other parents do', async () => {
      const user = userEvent.setup();
      renderShell('/concepts/define?open=import');
      openPinned('Build');
      await user.click(link('Define'));
      expect(link('Define')).toHaveAttribute('aria-expanded', 'false');
      expect(highlighted(build())).toEqual(['Define']);
    });

    it('opens Concepts and Define on a navigation to ?open=', async () => {
      const user = userEvent.setup();
      renderShell('/assets', go('/concepts/define?open=generate'));
      openPinned('Build');
      expect(within(build()).queryByRole('link', { name: 'Define' })).toBeNull();
      await user.click(screen.getByRole('link', { name: 'go' }));

      expect(link('Concepts')).toHaveAttribute('aria-expanded', 'true');
      expect(link('Define')).toHaveAttribute('aria-expanded', 'true');
      expect(highlighted(build())).toEqual(['Generate Ontology']);
    });

    it('marks a click on Author Concepts as a Build menu navigation', async () => {
      const user = userEvent.setup();
      renderShell('/concepts/define');
      openPinned('Build');
      await user.click(link('Define'));
      await user.click(link('Author Concepts'));
      expect(window.location.pathname + window.location.search).toBe('/concepts/define?open=author');
      expect(window.history.state?.usr).toEqual({ nav: 'menu', navGroup: 'Build' });
      expect(highlighted(build())).toEqual(['Author Concepts']);
    });

    it('shows a reader Define as a plain page, without the three items it cannot use', () => {
      usePermissionsStore.setState({ permissions: { 'semantic-models': FeatureAccessLevel.READ_ONLY } });
      renderShell('/concepts/define');
      openPinned('Build');
      expect(link('Define')).not.toHaveAttribute('aria-expanded');
      for (const name of DEFINE_CHILDREN) expect(within(build()).queryByRole('link', { name })).toBeNull();
      expect(highlighted(build())).toEqual(['Define']);
    });

    it('shows Generate Ontology only with ontology write, and Author Concepts and Import RDF only with semantic-models write', () => {
      // (fix round 12b: Generate leads to the generator's run, which needs ontology write)
      const RW = FeatureAccessLevel.READ_WRITE;
      const RO = FeatureAccessLevel.READ_ONLY;
      const cases: [Record<string, FeatureAccessLevel>, string[]][] = [
        [{ 'semantic-models': RW, ontology: RW }, ['Author Concepts', 'Generate Ontology', 'Import RDF']],
        [{ 'semantic-models': RW, ontology: RO }, ['Author Concepts', 'Import RDF']],
        [{ 'semantic-models': RO, ontology: RW }, ['Generate Ontology']],
      ];
      for (const [permissions, shown] of cases) {
        usePermissionsStore.setState({ permissions });
        // Define unfolded, so its items show
        useShellStore.setState({ expanded: ['concept-define'] });
        const { unmount } = renderShell('/concepts/define');
        openPinned('Build');
        expect(DEFINE_CHILDREN.filter((name) => within(build()).queryByRole('link', { name }))).toEqual(shown);
        unmount();
      }
    });
  });
});
