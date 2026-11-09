import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import { renderWithMantine, userEvent } from '@/test/utils';
import usePermissionsStore from '@/stores/permissions-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { FeatureAccessLevel } from '@/types/settings';
import { AppShell } from './app-shell';
import { SHELL_DEFAULTS, useShellStore } from './use-shell-store';
import { NAV } from './nav-config';

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
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    const settings = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(settings).queryByRole('link', { name: 'Business roles' })).toBeNull();

    await user.click(within(settings).getByRole('button', { name: 'Roles' }));

    expect(within(settings).getByRole('link', { name: 'Business roles' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/data-contracts'); // Roles has no page of its own
  });

  it('opens the sub-items of the current page', async () => {
    const user = userEvent.setup();
    renderShell('/settings/business-roles');
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    const settings = screen.getByRole('navigation', { name: 'Settings' });
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
    expect(screen.queryByRole('button', { name: 'Deploy' })).toBeNull(); // all alpha
    expect(screen.queryByRole('button', { name: 'Govern' })).toBeNull(); // beta and alpha

    act(() => useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] }));
    await user.click(screen.getByRole('button', { name: 'Govern' }));
    expect(within(screen.getByRole('navigation', { name: 'Govern' })).getByRole('link', { name: 'Security Features' }))
      .toBeInTheDocument();
  });

  it('renders the brand and the page content', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'APFM · Ontos' })).toHaveAttribute('href', '/');
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
