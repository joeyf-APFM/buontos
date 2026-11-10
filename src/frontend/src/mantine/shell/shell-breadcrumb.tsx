import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { features } from '@/config/features';
import { Breadcrumb } from '@/mantine/page/breadcrumb';
import {
  attachPage,
  crumbNavState,
  navKind,
  pageCrumbs,
  priorSteps,
  storable,
  trailCrumbs,
  type CrumbNavState,
  type TrailRecord,
  type TrailStep,
} from './breadcrumb-trail';
import { useShellNav } from './use-shell-nav';
import classes from './shell.module.css';

/** Each history entry's trail, by location key, so back, forward and a reload bring it back. */
export const TRAILS_KEY = 'shell:breadcrumb-trails';
const TRAILS_KEPT = 50;

function readTrails(): [string, TrailRecord][] {
  try {
    const raw = sessionStorage.getItem(TRAILS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as [string, TrailRecord][]) : [];
  } catch {
    return [];
  }
}

function storedTrail(key: string): TrailRecord | null {
  const found = readTrails().find(([k]) => k === key)?.[1];
  return found && Array.isArray(found.base) && found.current ? found : null;
}

function storeTrail(key: string, record: TrailRecord) {
  try {
    const trails = readTrails().filter(([k]) => k !== key);
    trails.push([key, storable(record)]);
    sessionStorage.setItem(TRAILS_KEY, JSON.stringify(trails.slice(-TRAILS_KEPT)));
  } catch {
    // Storage full or blocked: the trail just isn't kept for back and forward
  }
}

interface Arrival {
  key: string;
  prior: TrailStep[];
}

/**
 * The trail last shown, by location key: where the next page's trail starts
 * (one shell breadcrumb per app, so one value). Without actions: a past
 * page's in-page crumbs are text.
 */
let lastShown: { key: string; record: TrailRecord } | null = null;

function remember(key: string, record: TrailRecord) {
  lastShown = { key, record: storable(record) };
  storeTrail(key, record);
}

/**
 * The breadcrumb at the top of every page (Task 16d): the page's place in the
 * menu, after the pages the user came through by links within pages. The
 * side menu starts a new trail; a crumb goes back along it; back and forward
 * bring back each entry's own.
 */
export function ShellBreadcrumb({ fullBleed = false }: { fullBleed?: boolean }) {
  const { t } = useTranslation('shell');
  const location = useLocation();
  const navigationType = useNavigationType();
  const { nav, settingsGate, here } = useShellNav();
  const staticSegments = useBreadcrumbStore((s) => s.staticSegments);
  const dynamicTitle = useBreadcrumbStore((s) => s.dynamicTitle);
  const trailingSegments = useBreadcrumbStore((s) => s.trailingSegments);
  const clearPage = useBreadcrumbStore((s) => s.clearPage);

  // A new page starts with no titles: clear the last page's before the new
  // page's own effects set its own, so none leaks onto the next page
  const lastPathname = useRef(location.pathname);
  useLayoutEffect(() => {
    if (lastPathname.current === location.pathname) return;
    lastPathname.current = location.pathname;
    clearPage();
  }, [location.pathname, clearPage]);

  // The steps before this page, fixed when the user arrives at it (state
  // adjusted during render, so the first paint of a page has its trail)
  const arrive = (): Arrival => {
    const kind = navKind(navigationType, location.state);
    const previous = lastShown && lastShown.key !== location.key ? lastShown.record : null;
    const stored = kind === 'pop' ? storedTrail(location.key) : null;
    const crumbIndex = (location.state as Partial<CrumbNavState> | null)?.crumbIndex;
    return { key: location.key, prior: priorSteps(kind, previous, stored, crumbIndex) };
  };
  const [arrival, setArrival] = useState<Arrival>(arrive);
  let prior = arrival.prior;
  if (arrival.key !== location.key) {
    const next = arrive();
    setArrival(next);
    prior = next.prior;
  }

  // A feature's page the menu doesn't show this user (an alpha one) is named by the feature
  const feature = features.find((f) => f.path === location.pathname);
  const own = pageCrumbs({
    pathname: location.pathname,
    search: location.search,
    nav,
    here,
    settingsGate,
    // A page's "Loading..." title stands for a name still to come: nothing yet
    page: { staticSegments, dynamicTitle: dynamicTitle === t('common:states.loading') ? null : dynamicTitle, trailingSegments },
    label: (key) => t(key),
    fallbackTitle: feature ? t(`features:${feature.id}.name`, feature.name) : null,
  });
  const record = attachPage(prior, location.pathname, own);
  const crumbs = trailCrumbs(record);
  // A page with no crumb of its own yet (no title) isn't shown as Home or as the page before it
  const lastIsCurrent = location.pathname === '/' || record.current.crumbs.some((c) => c.role !== 'home');

  const saved = JSON.stringify(storable(record));
  useEffect(() => {
    remember(location.key, record);
    // `saved` stands for the record's content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, saved]);

  return (
    <div className={classes.crumbBar} data-flush={fullBleed || undefined}>
      <Breadcrumb
        label={t('breadcrumb.label')}
        moreLabel={t('breadcrumb.more')}
        lastIsCurrent={lastIsCurrent}
        items={crumbs.map((c, i) => ({
          label: c.label,
          to: c.to,
          state: c.to ? crumbNavState(i) : undefined,
          onSelect: c.onSelect,
          home: c.role === 'home',
        }))}
      />
    </div>
  );
}
