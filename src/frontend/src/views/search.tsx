import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Search as SearchIcon } from 'lucide-react';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import IndexSearch from '@/components/search/index-search';
import LLMSearch from '@/components/search/llm-search';
import { useUICustomizationStore } from '@/stores/ui-customization-store';

// Map URL slugs to tab values
const SLUG_TO_TAB: Record<string, 'llm' | 'index'> = {
  'llm': 'llm',
  'index': 'index',
};

// Default tab when visiting /search
const DEFAULT_TAB = 'llm';

export default function SearchView() {
  const { t } = useTranslation(['search', 'common']);
  const location = useLocation();
  const navigate = useNavigate();
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
  const handleModeChange = (newMode: 'llm' | 'index') => {
    navigate(`/search/${newMode}`);
  };

  // Extract query params
  const params = new URLSearchParams(location.search);

  // Index Search params (used at /search/index)
  const indexQuery = params.get('query') || '';

  return (
    <div className="py-4 space-y-4">
      <h1 className="text-3xl font-bold mb-4 flex items-center gap-2">
        <SearchIcon className="w-8 h-8" />
        {t('title')}
      </h1>
      <Tabs value={currentTab} onValueChange={(v) => handleModeChange(v as 'llm' | 'index')}>
        <TabsList>
          <TabsTrigger value="llm">{t('tabs.askOntos', { shortName })}</TabsTrigger>
          <TabsTrigger value="index">{t('tabs.indexSearch')}</TabsTrigger>
        </TabsList>

        <TabsContent value="llm">
          <LLMSearch />
        </TabsContent>

        <TabsContent value="index">
          <IndexSearch initialQuery={indexQuery} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
