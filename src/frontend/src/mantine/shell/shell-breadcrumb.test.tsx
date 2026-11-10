/**
 * The shell's breadcrumb (Task 16d) in the real layout: one per page, on
 * migrated, unmigrated, settings and full-bleed pages; and the trail that
 * follows the user through in-page links, crumbs, the menu, and back.
 */
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import { renderWithMantine, userEvent } from '@/test/utils';
import Layout from '@/components/layout/layout';
import SettingsPageWrapper from '@/components/settings/settings-page-wrapper';
import usePermissionsStore from '@/stores/permissions-store';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { useFeatureVisibilityStore } from '@/stores/feature-visibility-store';
import { FeatureAccessLevel } from '@/types/settings';
import AssetTypesView from '@/views/asset-types';
import DataAssetReviews from '@/views/data-asset-reviews';
import Compliance from '@/views/compliance';
import NotFound from '@/views/not-found';
import { NAV } from './nav-config';
import { SHELL_DEFAULTS, useShellStore } from './use-shell-store';
import { TRAILS_KEY } from './shell-breadcrumb';

vi.mock('@/components/ui/user-info', () => ({ default: () => null }));
vi.mock('@/components/ui/notification-bell', () => ({ default: () => null }));
vi.mock('@/components/ui/project-chooser', () => ({ ProjectChooser: () => null }));
vi.mock('@/components/common/language-selector', () => ({ LanguageSelector: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string; getAppName: () => string }) => unknown) =>
    select({ getShortName: () => 'APFM', getAppName: () => 'Ontos' }),
}));

const allPermissionIds = Object.values(NAV).flatMap((sections) =>
  sections.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children ?? [])])).map((i) => i.permissionId),
);

function grantAll() {
  usePermissionsStore.setState({
    permissions: Object.fromEntries([...allPermissionIds, 'settings'].map((id) => [id, FeatureAccessLevel.ADMIN])),
    appliedRoleId: null,
    isLoading: false,
    _initAttempted: true,
    _isInitializing: false,
  });
}

/** A page that names itself through the store, as the detail views do. */
function Titled({ title, links = [] }: { title?: string; links?: { to: string; label: string }[] }) {
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);
  useEffect(() => {
    if (title) setDynamicTitle(title);
  }, [title, setDynamicTitle]);
  return (
    <div>
      {links.map((l) => (
        <Link key={l.to} to={l.to}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

/** A redirect, as app.tsx's <Navigate replace> routes are. */
function Redirect({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace: true }), [navigate, to]);
  return null;
}

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Titled />} />
        <Route path="/settings/asset-types" element={<AssetTypesView />} />
        <Route path="/data-asset-reviews" element={<DataAssetReviews />} />
        <Route path="/compliance" element={<Compliance />} />
        <Route
          path="/settings/general"
          element={
            <SettingsPageWrapper title="General" permissionId="settings-general">
              <div>general settings</div>
            </SettingsPageWrapper>
          }
        />
        <Route path="/data-contracts" element={<Titled links={[{ to: '/data-contracts/c1', label: 'open Orders' }]} />} />
        <Route
          path="/data-contracts/c1"
          element={
            <Titled
              title="Orders"
              links={[
                { to: '/settings/data-domains/d1', label: 'open Finance' },
                { to: '/settings/data-domains/d2', label: 'open a loading domain' },
              ]}
            />
          }
        />
        <Route path="/settings/data-domains" element={<Titled />} />
        <Route path="/settings/data-domains/d1" element={<Titled title="Finance" />} />
        <Route path="/settings/data-domains/d2" element={<Titled />} />
        <Route path="/settings/data-domains/d3" element={<Titled title="Loading..." />} />
        <Route path="/old-domains" element={<Redirect to="/settings/data-domains" />} />
        <Route path="/dev/untitled" element={<Titled />} />
        <Route path="/security-features" element={<Titled />} />
        <Route path="*" element={<NotFound />} />
        <Route path="/marketplace" element={<Titled links={[{ to: '/old-domains', label: 'old link' }]} />} />
      </Routes>
    </Layout>
  );
}

const crumbNavs = () => screen.queryAllByRole('navigation', { name: 'Breadcrumb' });
const trail = () => within(crumbNavs()[0]).getAllByRole('listitem').map((li) => li.textContent?.replace(/^>/, ''));

async function renderApp(route: string) {
  renderWithMantine(<App />, { route });
  await act(async () => {});
}

describe('the shell breadcrumb', () => {
  beforeEach(() => {
    useShellStore.setState({ ...SHELL_DEFAULTS, pinned: true });
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga', 'beta', 'alpha'] });
    useBreadcrumbStore.setState({ staticSegments: [], dynamicTitle: null, trailingSegments: [] });
    sessionStorage.clear();
    grantAll();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        new Response(String(url).startsWith('/api/health') ? JSON.stringify({ db_ok: true, ws_ok: true, warnings: [] }) : '[]', {
          status: 200,
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['a migrated full-bleed page (Data Asset Reviews)', '/data-asset-reviews', ['Home', 'Settings', 'Asset Reviews']],
    ['a migrated settings page (Asset types)', '/settings/asset-types', ['Home', 'Semantics', 'Asset types']],
    ['an unmigrated page (Compliance)', '/compliance', ['Home', 'Settings', 'Compliance']],
    ['a settings page in the wrapper (General)', '/settings/general', ['Home', 'Settings', 'General']],
  ])('draws exactly one breadcrumb on %s', async (_name, route, expected) => {
    await renderApp(route);
    await waitFor(() => expect(trail()).toEqual(expected));
    expect(crumbNavs()).toHaveLength(1);
    // In the main content, before the page
    expect(crumbNavs()[0].closest('main')).not.toBeNull();
  });

  it('names its Home link, separates crumbs with a hidden ">", and marks the current page', async () => {
    await renderApp('/settings/general');
    const nav = crumbNavs()[0];
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    const separators = Array.from(nav.querySelectorAll('[data-crumb-separator]'));
    expect(separators.map((s) => [s.textContent, s.getAttribute('aria-hidden')])).toEqual([['>', 'true'], ['>', 'true']]);
    expect(within(nav).getByText('General')).toHaveAttribute('aria-current', 'page');
    // Settings has no default page: plain text
    expect(within(nav).queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  it('shows Home > {page title} on a page in no group (Not Found)', async () => {
    await renderApp('/no-such-page');
    await waitFor(() => expect(trail()).toEqual(['Home', 'Not found']));
  });

  it('shows nothing for a title that is only "Loading...", as a page shows while its entity loads', async () => {
    await renderApp('/settings/data-domains/d3');
    await act(async () => {});
    expect(trail()).toEqual(['Home', 'Organization', 'Data domains']);
  });

  it('keeps Home a link on a page with no title, marking nothing current', async () => {
    await renderApp('/dev/untitled');
    expect(trail()).toEqual(['Home']);
    expect(within(crumbNavs()[0]).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it("names a feature's page outside the menu the user sees by the feature (alpha Security Features)", async () => {
    useFeatureVisibilityStore.setState({ allowedMaturities: ['ga'] });
    await renderApp('/security-features');
    expect(trail()).toEqual(['Home', 'Security Features']);
  });

  it('shows just Home on Home', async () => {
    await renderApp('/');
    expect(trail()).toEqual(['Home']);
    expect(within(crumbNavs()[0]).getByText('Home')).toHaveAttribute('aria-current', 'page');
  });

  it('follows in-page links, goes back along the trail from a crumb, and restarts from the menu', async () => {
    const user = userEvent.setup();
    await renderApp('/data-contracts');
    expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Explorer']);

    // A list's detail page takes its place
    await user.click(screen.getByRole('link', { name: 'open Orders' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders']));

    // An in-page link extends the trail (the owner's example)
    await user.click(screen.getByRole('link', { name: 'open Finance' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders', 'Data domains', 'Finance']));
    // The menu still shows where the page is: Organization → Data domains
    expect(screen.getByRole('button', { name: 'Organization' })).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: 'Build' })).not.toHaveAttribute('data-active');

    // A crumb goes back to its point and cuts the trail there
    await user.click(within(crumbNavs()[0]).getByRole('link', { name: 'Data domains' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders', 'Data domains']));

    // Back brings back that entry's trail
    act(() => window.history.back());
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders', 'Data domains', 'Finance']));
    act(() => window.history.back());
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders']));

    // The side menu starts over from the page's own place
    act(() => window.history.forward());
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders', 'Data domains', 'Finance']));
    await user.click(screen.getByRole('button', { name: 'Build' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Build' })).getByRole('link', { name: 'Explorer' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Assets', 'Explorer']));
  });

  it('keeps each history entry’s trail in sessionStorage, at most 50', async () => {
    const user = userEvent.setup();
    await renderApp('/data-contracts/c1');
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders']));
    await user.click(screen.getByRole('link', { name: 'open Finance' }));
    await waitFor(() => expect(trail()).toHaveLength(6));
    const stored = JSON.parse(sessionStorage.getItem(TRAILS_KEY)!) as [string, unknown][];
    expect(stored).toHaveLength(2);
    expect(stored[1][0]).toBe(window.history.state?.key);
  });

  it('survives storage that throws', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await renderApp('/settings/general');
    expect(trail()).toEqual(['Home', 'Settings', 'General']);
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('adds no crumb for a redirect', async () => {
    const user = userEvent.setup();
    await renderApp('/marketplace');
    await user.click(screen.getByRole('link', { name: 'old link' }));
    // The redirect's own entry was replaced: Marketplace, then the target
    await waitFor(() => expect(trail()).toEqual(['Home', 'Discover', 'Marketplace', 'Data domains']));
  });

  it('clears the last page’s title when the page changes', async () => {
    const user = userEvent.setup();
    await renderApp('/data-contracts/c1');
    await waitFor(() => expect(trail()).toContain('Orders'));
    // The domain's page sets no title yet: Orders mustn't stand in for it
    await user.click(screen.getByRole('link', { name: 'open a loading domain' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders', 'Data domains']));
    expect(useBreadcrumbStore.getState().dynamicTitle).toBeNull();
  });
});
