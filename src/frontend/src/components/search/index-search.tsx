import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Loader, TextInput } from '@mantine/core';
import {
  Search, FileText, Database, Book, Shield, AlertCircle,
  BookOpen, Shapes, Tag, Send, Server, Table2, Eye, Columns2,
  LayoutDashboard, Globe, FileCode, Brain, Activity, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pane } from '@/mantine/page';
import { features } from '@/config/features';
import classes from './index-search.module.css';

type IndexSearchResult = {
  id: string;
  type: string;
  title: string;
  description: string;
  link: string;
  feature_id?: string;
  tags?: string[];
};

interface IndexSearchProps {
  initialQuery?: string;
}

// Asset type-specific icons
const ASSET_TYPE_ICONS: Record<string, React.ElementType> = {
  'asset-business-term': BookOpen,
  'asset-logical-entity': Shapes,
  'asset-logical-attribute': Tag,
  'asset-delivery-channel': Send,
  'asset-system': Server,
  'asset-dataset': Database,
  'asset-table': Table2,
  'asset-view': Eye,
  'asset-column': Columns2,
  'asset-dashboard': LayoutDashboard,
  'asset-api-endpoint': Globe,
  'asset-notebook': FileCode,
  'asset-ml-model': Brain,
  'asset-stream': Activity,
  'asset-policy': Shield,
};

/**
 * Index Search (/search/index) on the page kit (wave 2 Task 16): one kit
 * pane with the field, then the results as links (an icon from the feature
 * or the type, the title and the description), "No results found", or a
 * failed search's error with Retry. The query is kept in ?query=.
 */
export default function IndexSearch({ initialQuery = '' }: IndexSearchProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(['search', 'common']);

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<IndexSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Retry runs the same query again
  const [attempt, setAttempt] = useState(0);
  // Only the latest query's answer may show: an earlier one that answers late is dropped
  const request = useRef(0);

  // Update URL with query param (simple - only manages its own params)
  const updateUrl = useCallback((q: string) => {
    const params = new URLSearchParams();
    if (q) {
      params.set('query', q);
    }
    const queryString = params.toString();
    const newUrl = queryString ? `/search/index?${queryString}` : '/search/index';
    navigate(newUrl, { replace: true });
  }, [navigate]);

  // Load initial state from URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlQuery = params.get('query');
    if (urlQuery && urlQuery !== initialQuery) {
      setQuery(urlQuery);
    }
  }, [location.search, initialQuery]);

  // Perform search
  useEffect(() => {
    const id = ++request.current;
    const run = async () => {
      const q = query.trim();
      if (!q) {
        setResults([]);
        setError(null);
        updateUrl('');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`/api/search?search_term=${encodeURIComponent(q)}`);
        if (!resp.ok) {
          // The URL keeps the query, as before, so Retry and a reload search it again
          if (id === request.current) updateUrl(q);
          const body = await resp.json().catch(() => null);
          throw new Error(body?.detail || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        if (id !== request.current) return;
        setResults(Array.isArray(data) ? data : []);
        updateUrl(q);
      } catch (e) {
        if (id !== request.current) return;
        setResults([]);
        setError(e instanceof Error ? e.message : '');
      } finally {
        if (id === request.current) setLoading(false);
      }
    };
    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, attempt]);

  // Get icon for result based on feature_id or type fallback
  const getIcon = (result: IndexSearchResult) => {
    // Prefer explicit feature-based icon mapping to keep UI consistent with navigation
    if (result.feature_id) {
      const feature = features.find((f) => f.id === result.feature_id);
      if (feature) {
        const Icon = feature.icon;
        return <Icon aria-hidden className={classes.icon} />;
      }
    }

    if (result.type.startsWith('asset-')) {
      const AssetIcon = ASSET_TYPE_ICONS[result.type] || Package;
      return <AssetIcon aria-hidden className={classes.icon} />;
    }

    const TypeIcon =
      result.type === 'data-product' ? Database
      : result.type === 'data-contract' ? FileText
      : result.type === 'glossary-term' ? Book
      : result.type === 'persona' ? Shield
      : Search;
    return <TypeIcon aria-hidden className={classes.icon} />;
  };

  const placeholder = t('common:placeholders.searchDataProductsTermsContracts');

  return (
    <Pane title={t('search:index.title')}>
      <p className={classes.intro}>{t('search:index.description')}</p>
      <TextInput
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={placeholder}
        // The field was named by its placeholder; it keeps that name
        aria-label={placeholder}
        leftSection={<Search aria-hidden className={classes.fieldIcon} />}
      />
      <div className={classes.results}>
        {loading ? (
          <div className={classes.note}>
            <Loader size={14} />
            {t('common:labels.loading')}
          </div>
        ) : error !== null ? (
          <div className={classes.state}>
            <Alert
              color="red"
              variant="light"
              icon={<AlertCircle />}
              title={t('search:states.searchFailed', 'The search failed.')}
              className={classes.alert}
            >
              {error && <span className={classes.alertMessage}>{error}</span>}
            </Alert>
            <Button variant="outline" type="button" onClick={() => setAttempt((n) => n + 1)}>{t('common:retry')}</Button>
          </div>
        ) : results.length === 0 ? (
          <p className={classes.note}>{t('search:noResults')}</p>
        ) : (
          results.map(r => (
            <a key={r.id} href={r.link} className={classes.result}>
              {getIcon(r)}
              <span className={classes.text}>
                <span className={classes.title}>{r.title}</span>
                {' '}
                <span className={classes.description} title={r.description}>{r.description}</span>
              </span>
            </a>
          ))
        )}
      </div>
    </Pane>
  );
}
