/**
 * The shell's breadcrumb (Task 16d) in the real layout: one per page, on
 * migrated, unmigrated, settings and full-bleed pages; and the trail that
 * follows the user through in-page links, crumbs, the menu, and back.
 */
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { Link, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
import DataAssetReviewDetails from '@/views/data-asset-review-details';
import { NAV } from './nav-config';
import { SHELL_DEFAULTS, useShellStore } from './use-shell-store';
import { TRAILS_KEY } from './shell-breadcrumb';

vi.mock('@/components/ui/user-info', () => ({ default: () => null }));
vi.mock('@/components/ui/notification-bell', () => ({ default: () => null }));
vi.mock('@/components/ui/project-chooser', () => ({ ProjectChooser: () => null }));
vi.mock('@/components/common/language-selector', () => ({ LanguageSelector: () => null }));
vi.mock('@/stores/ui-customization-store', () => ({
  useUICustomizationStore: (select: (s: { getShortName: () => string; getAppName: () => string }) => unknown) =>
    select({ getShortName: () => 'APFM', getAppName: () => 'Nucleus' }),
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
function Titled({ title, links = [], trailing }: { title?: string; links?: { to: string; label: string }[]; trailing?: { label: string; path?: string }[] }) {
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);
  const setTrailingSegments = useBreadcrumbStore((s) => s.setTrailingSegments);
  useEffect(() => {
    if (title) setDynamicTitle(title);
    if (trailing) setTrailingSegments(trailing);
  }, [title, trailing, setDynamicTitle, setTrailingSegments]);
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

/** A page with in-page levels, as the explorer's tree: ?at= picks one, and a button goes a level deeper. */
function Levels({ title }: { title?: string }) {
  const at = new URLSearchParams(useLocation().search).get('at');
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);
  const setTrailingSegments = useBreadcrumbStore((s) => s.setTrailingSegments);
  useEffect(() => {
    if (title) setDynamicTitle(title);
  }, [title, setDynamicTitle]);
  useEffect(() => {
    const upTo = at ? DEEP.findIndex((d) => d.label === at) + 1 : title ? 0 : DEEP.length;
    setTrailingSegments(DEEP.slice(0, upTo));
  }, [at, title, setTrailingSegments]);
  return (
    <>
      <button type="button" onClick={() => setTrailingSegments([{ label: 'Deeper' }])}>
        go deeper
      </button>
      <Link to="/settings/data-domains/d1">open Finance</Link>
    </>
  );
}

/** The Define page's ?open= handling, as views/define.tsx does it: its dialog's close drops the param (replace). */
function DefineStub() {
  const [params, setParams] = useSearchParams();
  const setStaticSegments = useBreadcrumbStore((s) => s.setStaticSegments);
  useEffect(() => {
    setStaticSegments([{ label: 'Concepts', path: '/concepts' }, { label: 'Define', path: '/concepts/define' }]);
  }, [setStaticSegments]);
  return params.get('open') ? (
    <button type="button" onClick={() => setParams({}, { replace: true })}>
      close dialog
    </button>
  ) : null;
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
      <Link to="/settings/data-domains/d2">leave</Link>
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
        <Route path="/settings/data-domains/d4" element={<Levels />} />
        <Route path="/settings/data-domains/d5" element={<Levels title="Five" />} />
        <Route path="/assets" element={<Titled />} />
        <Route path="/concepts/define" element={<DefineStub />} />
        <Route path="/data-asset-reviews/:requestId" element={<DataAssetReviewDetails />} />
        <Route path="/old-domains" element={<Redirect to="/settings/data-domains" />} />
        <Route path="/dev/untitled" element={<Titled />} />
        <Route path="/security-features" element={<Titled />} />
        <Route path="*" element={<NotFound />} />
        <Route
          path="/marketplace"
          element={<Titled links={[{ to: '/old-domains', label: 'old link' }, { to: '/data-asset-reviews/r1', label: 'open review' }]} />}
        />
      </Routes>
    </Layout>
  );
}

// Four levels within a page, for a trail long enough to collapse
const DEEP = ['s1', 's2', 's3', 's4'].map((label) => ({ label, path: `/settings/data-domains/d4?at=${label}` }));

// The review's own answer waits until a test lets it through
let releaseReview: () => void = () => {};

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
    const gate = new Promise<void>((resolve) => {
      releaseReview = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).startsWith('/api/data-asset-reviews/r1')) {
          await gate;
          return new Response(JSON.stringify({ id: 'r1', title: 'Review sales tables', status: 'in_review', assets: [] }), { status: 200 });
        }
        return new Response(String(url).startsWith('/api/health') ? JSON.stringify({ db_ok: true, ws_ok: true, warnings: [] }) : '[]', {
          status: 200,
        });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['a migrated full-bleed page (Data Asset Reviews)', '/data-asset-reviews', ['Home', 'Govern', 'Asset Reviews']],
    ['a migrated settings page (Asset types)', '/settings/asset-types', ['Home', 'Semantics', 'Asset types']],
    ['an unmigrated page (Compliance)', '/compliance', ['Home', 'Govern', 'Compliance']],
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
    // (Discover's page isn't in the trail, so an ordinary link would extend it)
    await user.click(screen.getByRole('button', { name: 'Discover' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Discover', 'Marketplace']));
  });

  it('cuts the trail at a crumb in the "…" menu, by its place in the trail', async () => {
    const user = userEvent.setup();
    await renderApp('/settings/data-domains/d4');
    // Home > Organization > Data domains > s1 > s2 > s3 > s4: seven, so folded
    await waitFor(() => expect(trail()).toEqual(['Home', 'Organization', 'Data domains', '…', 's3', 's4']));
    await user.click(within(crumbNavs()[0]).getByRole('button', { name: 'Show the hidden levels' }));
    await user.click(await screen.findByRole('menuitem', { name: 's1', hidden: true }));
    // Cut right after s1 (an ordinary link to the same page would start over from its own place)
    await waitFor(() => expect(trail()).toEqual(['Home', 'Organization', 'Data domains', 's1']));
  });

  it("keeps the page's live crumbs after a crumb click: a level picked in the page shows", async () => {
    const user = userEvent.setup();
    await renderApp('/settings/data-domains/d5');
    await waitFor(() => expect(trail()).toEqual(['Home', 'Organization', 'Data domains', 'Five']));
    await user.click(screen.getByRole('link', { name: 'open Finance' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Organization', 'Data domains', 'Five', 'Finance']));
    // Back to Five by its crumb, then a level deeper within the page
    await user.click(within(crumbNavs()[0]).getByRole('link', { name: 'Five' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Organization', 'Data domains', 'Five']));
    await user.click(screen.getByRole('button', { name: 'go deeper' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Organization', 'Data domains', 'Five', 'Deeper']));
  });

  it('goes to a group crumb as the menu does: the default page, in its own place', async () => {
    const user = userEvent.setup();
    await renderApp('/data-contracts/c1');
    await user.click(screen.getByRole('link', { name: 'open Finance' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders', 'Data domains', 'Finance']));
    await user.click(within(crumbNavs()[0]).getByRole('link', { name: 'Build' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Assets', 'Explorer']));
    expect(window.history.state?.usr).toEqual({ nav: 'menu', navGroup: 'Build' });
  });

  it('shows no placeholder while a name loads, and lets no late name onto the next page', async () => {
    const user = userEvent.setup();
    await renderApp('/marketplace');
    await user.click(screen.getByRole('link', { name: 'open review' }));
    // The review's name hasn't come: nothing stands for it
    await waitFor(() => expect(trail()).toEqual(['Home', 'Discover', 'Marketplace', 'Asset Reviews']));
    // Leave before it loads: the next trail carries no placeholder
    await user.click(screen.getByRole('link', { name: 'leave' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Discover', 'Marketplace', 'Asset Reviews', 'Data domains']));
    // The review's answer comes after it left: its name stays out of this page
    await act(async () => releaseReview());
    await act(async () => {});
    expect(useBreadcrumbStore.getState().dynamicTitle).toBeNull();
    expect(trail()).toEqual(['Home', 'Discover', 'Marketplace', 'Asset Reviews', 'Data domains']);
  });

  it('ignores a stored trail it cannot read, falling back to the page\'s own place', async () => {
    // The first entry's key in a fresh history is "default"
    const oldFormat = { base: [{ pathname: '/marketplace', crumbs: 'Marketplace' }], current: { pathname: '/settings/general' } };
    sessionStorage.setItem(TRAILS_KEY, JSON.stringify([['default', oldFormat]]));
    await renderApp('/settings/general');
    expect(trail()).toEqual(['Home', 'Settings', 'General']);
  });

  it('ignores a stored trail whose gap mark it cannot read', async () => {
    const step = (pathname: string, label: string) => ({ pathname, crumbs: [{ label, to: pathname }] });
    const marked = { base: [step('/', 'Home'), { ...step('/marketplace', 'Marketplace'), gapBefore: 'yes' }], current: step('/settings/general', 'General') };
    sessionStorage.setItem(TRAILS_KEY, JSON.stringify([['default', marked]]));
    await renderApp('/settings/general');
    expect(trail()).toEqual(['Home', 'Settings', 'General']);
  });

  it('keeps each history entry’s trail in sessionStorage, at most 50', async () => {
    const user = userEvent.setup();
    const old = Array.from({ length: 55 }, (_, i) => [`old-${i}`, { base: [], current: { pathname: '/', crumbs: [] } }]);
    sessionStorage.setItem(TRAILS_KEY, JSON.stringify(old));
    await renderApp('/data-contracts/c1');
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Data Contracts', 'Orders']));
    await user.click(screen.getByRole('link', { name: 'open Finance' }));
    await waitFor(() => expect(trail()).toHaveLength(6));
    const stored = JSON.parse(sessionStorage.getItem(TRAILS_KEY)!) as [string, unknown][];
    // The newest 50: the oldest went first, and this entry is last
    expect(stored).toHaveLength(50);
    expect(stored[0][0]).toBe('old-7');
    expect(stored[49][0]).toBe(window.history.state?.key);
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

  it('shows Home > Build > Concepts > Define > Author Concepts after the menu opens it, and Define once it closes (Task 16e)', async () => {
    const user = userEvent.setup();
    await renderApp('/concepts/define');
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Concepts', 'Define']));
    act(() => useShellStore.setState({ openGroup: 'Build' }));
    const build = screen.getByRole('navigation', { name: 'Build' });
    await user.click(within(build).getByRole('link', { name: 'Define' }));
    await user.click(within(build).getByRole('link', { name: 'Author Concepts' }));

    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Concepts', 'Define', 'Author Concepts']));
    expect(within(crumbNavs()[0]).getByText('Author Concepts')).toHaveAttribute('aria-current', 'page');
    expect(within(crumbNavs()[0]).getByRole('link', { name: 'Define' })).toHaveAttribute('href', '/concepts/define');

    await user.click(screen.getByRole('button', { name: 'close dialog' }));
    await waitFor(() => expect(trail()).toEqual(['Home', 'Build', 'Concepts', 'Define']));
  });
});
