import { useCallback, useEffect, useId } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { PageHeader, PageLayout, Tabs } from '@/mantine/page';
import KGSearch from '@/components/search/kg-search';
import ConceptsSearch from '@/components/search/concepts-search';
import PropertiesSearch from '@/components/search/properties-search';
import classes from './ontology-search.module.css';

type SearchMode = 'concepts' | 'properties' | 'kg';

const VALID_TABS = new Set<SearchMode>(['concepts', 'properties', 'kg']);

function getTabFromParams(search: string): SearchMode {
  const params = new URLSearchParams(search);
  const tab = params.get('tab') as SearchMode | null;
  if (tab && VALID_TABS.has(tab)) return tab;
  // Auto-select KG tab when KG-specific params are present
  if (params.has('path') || params.has('prefix') || params.has('sparql')) return 'kg';
  return 'concepts';
}

/**
 * Search (/concepts/search) on the page kit (wave 2 Task 13b): the kit header
 * and its description, then kit Tabs (Concepts / Properties / Knowledge
 * Graph, in ?tab=) over one panel for the active tab, whose search draws its
 * own panes.
 */
export default function OntologySearchView() {
  const { t } = useTranslation(['search', 'semantic-models', 'common']);
  const location = useLocation();
  const navigate = useNavigate();
  const tabsId = useId();
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);

  const searchMode = getTabFromParams(location.search);

  const params = new URLSearchParams(location.search);

  const pageTitle = t('search:tabs.searchConcepts', { defaultValue: 'Search Concepts' });
  const pageSubtitle = t('search:subtitles.searchConcepts', { defaultValue: 'Search and browse ontology concepts and properties' });

  useEffect(() => {
    setStaticSegments([]);
    setDynamicTitle(pageTitle);
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [setStaticSegments, setDynamicTitle, pageTitle]);

  const handleTabChange = useCallback((newTab: string) => {
    const nextParams = new URLSearchParams(location.search);
    if (newTab === 'concepts') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', newTab);
    }
    const qs = nextParams.toString();
    navigate(qs ? `${location.pathname}?${qs}` : location.pathname, { replace: true });
  }, [location.search, location.pathname, navigate]);

  const query = params.get('query') || '';
  const iri = params.get('iri');

  const kgPrefix = params.get('prefix') || '';
  const kgPath = params.get('path')?.split('|').filter(Boolean) || [];
  const kgSparql = params.get('sparql') || 'SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10';
  const kgDirection = (params.get('direction') as 'all' | 'incoming' | 'outgoing') || 'all';
  const kgConceptsOnly = params.get('concepts_only') === 'true';

  return (
    <PageLayout
      header={
        <>
          <PageHeader title={pageTitle} />
          <p className={classes.subtitle}>{pageSubtitle}</p>
        </>
      }
    >
      <div className={classes.body}>
        <Tabs id={tabsId} value={searchMode} onChange={(value) => value && handleTabChange(value)}>
          <Tabs.List aria-label={pageTitle} className={classes.tabs}>
            <Tabs.Tab value="concepts">{t('search:tabs.concepts', { defaultValue: 'Concepts' })}</Tabs.Tab>
            <Tabs.Tab value="properties">{t('search:tabs.properties', { defaultValue: 'Properties' })}</Tabs.Tab>
            <Tabs.Tab value="kg">{t('search:tabs.knowledgeGraph', { defaultValue: 'Knowledge Graph' })}</Tabs.Tab>
          </Tabs.List>
        </Tabs>

        {/* One panel for the active tab; each search remounts on a tab change, as before */}
        <div
          role="tabpanel"
          id={`${tabsId}-panel-${searchMode}`}
          aria-labelledby={`${tabsId}-tab-${searchMode}`}
          className={classes.panel}
        >
          {searchMode === 'concepts' && (
            <ConceptsSearch
              initialQuery={query}
              initialSelectedConcept={iri ? {
                value: iri,
                label: iri.split('/').pop() || iri.split('#').pop() || iri,
                type: 'class' as const,
              } : null}
            />
          )}
          {searchMode === 'properties' && (
            <PropertiesSearch
              initialQuery={query}
              initialSelectedProperty={iri ? {
                value: iri,
                label: iri.split('/').pop() || iri.split('#').pop() || iri,
                type: 'property' as const,
              } : null}
            />
          )}
          {searchMode === 'kg' && (
            <KGSearch
              initialPrefix={kgPrefix}
              initialPath={kgPath}
              initialSparql={kgSparql}
              initialDirectionFilter={kgDirection}
              initialShowConceptsOnly={kgConceptsOnly}
            />
          )}
        </div>
      </div>
    </PageLayout>
  );
}
