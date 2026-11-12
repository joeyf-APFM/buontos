import { useEffect, useId } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { PageHeader, PageLayout, Tabs } from '@/mantine/page';
import IndexSearch from '@/components/search/index-search';
import LLMSearch from '@/components/search/llm-search';
import { useUICustomizationStore } from '@/stores/ui-customization-store';
import classes from './search.module.css';

type SearchTab = 'llm' | 'index';

// Map URL slugs to tab values
const SLUG_TO_TAB: Record<string, SearchTab> = {
  'llm': 'llm',
  'index': 'index',
};

// Default tab when visiting /search
const DEFAULT_TAB = 'llm';

/**
 * Search (/search/llm, /search/index) on the page kit (wave 2 Task 16): the
 * kit header, kit Tabs whose slugs are the URL's (/search opens Ask Ontos),
 * then the active tab's pane. Ask Ontos fills the window (full bleed), so its
 * messages scroll inside the pane under a header that stays in place; Index
 * Search keeps its natural height.
 */
export default function SearchView() {
  const { t } = useTranslation(['search', 'common']);
  const location = useLocation();
  const navigate = useNavigate();
  const tabsId = useId();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);
  const shortName = useUICustomizationStore((state) => state.getShortName());

  // Extract current tab from URL path
  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentSlug = pathParts.length > 1 ? pathParts[1] : '';
  const currentTab = SLUG_TO_TAB[currentSlug] || DEFAULT_TAB;

  // The menu names this page (Discover > Search); its tabs add no title of their own
  useEffect(() => {
    setStaticSegments([]);
    setDynamicTitle(null);
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [setStaticSegments, setDynamicTitle]);

  // Redirect /search to /search/llm (default tab)
  useEffect(() => {
    if (location.pathname === '/search' || location.pathname === '/search/') {
      navigate('/search/llm', { replace: true });
    }
  }, [location.pathname, navigate]);

  // Handle tab change - navigate to new slug
  const handleModeChange = (newMode: SearchTab) => {
    navigate(`/search/${newMode}`);
  };

  // Extract query params
  const params = new URLSearchParams(location.search);

  // Index Search params (used at /search/index)
  const indexQuery = params.get('query') || '';

  const title = t('title');

  return (
    <PageLayout
      fullBleed={currentTab === 'llm'}
      header={<PageHeader title={title} />}
      filters={
        <div className={classes.tabs}>
          <Tabs id={tabsId} value={currentTab} onChange={(v) => v && handleModeChange(v as SearchTab)}>
            <Tabs.List aria-label={title} className={classes.tabList}>
              <Tabs.Tab value="llm">{t('tabs.askOntos', { shortName })}</Tabs.Tab>
              <Tabs.Tab value="index">{t('tabs.indexSearch')}</Tabs.Tab>
            </Tabs.List>
          </Tabs>
        </div>
      }
    >
      {/* One panel for the active tab; each tab remounts on a change, as before */}
      <div
        role="tabpanel"
        id={`${tabsId}-panel-${currentTab}`}
        aria-labelledby={`${tabsId}-tab-${currentTab}`}
        className={classes.panel}
        data-tab={currentTab}
      >
        {currentTab === 'llm' ? <LLMSearch /> : <IndexSearch initialQuery={indexQuery} />}
      </div>
    </PageLayout>
  );
}
