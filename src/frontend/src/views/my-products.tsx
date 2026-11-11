import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { ActionIcon, Alert, CloseButton, HoverCard, Select, Skeleton, Switch, TextInput } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Package, ExternalLink, ShoppingBag, Search, LayoutList, Network, Database, Grid2X2 } from 'lucide-react';
import { CardSkeleton } from '@/components/common/list-view-skeleton';
import { DataDomainMiniGraph } from '@/components/data-domains/data-domain-mini-graph';
import { useDomains } from '@/hooks/use-domains';
import { useViewModeStore, type TilesPerRow } from '@/stores/view-mode-store';
import { type DataProduct } from '@/types/data-product';
import { type DataDomain } from '@/types/data-domain';
import { useApi } from '@/hooks/use-api';
import { FilterBar, PageHeader, PageLayout, Pane, PaneStack } from '@/mantine/page';
import classes from './my-products.module.css';

export default function MyProducts() {
  const { t } = useTranslation(['home', 'data-products', 'common']);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { domains, loading: domainsLoading, getDomainName } = useDomains();
  const { domainBrowserStyle, setDomainBrowserStyle, tilesPerRow, setTilesPerRow } = useViewModeStore();
  const api = useApi();

  const [products, setProducts] = useState<DataProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [exactMatchesOnly, setExactMatchesOnly] = useState(false);
  const [matchSets, setMatchSets] = useState<{ ids: Set<string>; namesLower: Set<string> } | null>(null);
  const [selectedDomainDetails, setSelectedDomainDetails] = useState<DataDomain | null>(null);
  const [domainDetailsLoading, setDomainDetailsLoading] = useState(false);
  const [graphFadeIn, setGraphFadeIn] = useState(false);
  // Only the latest domain lookup may show: an earlier one that answers late is dropped
  const domainRequest = useRef(0);

  const tileOptions = useMemo(() => [
    { value: '1', label: t('marketplace.tilesPerRow.one') },
    { value: '2', label: t('marketplace.tilesPerRow.two') },
    { value: '3', label: t('marketplace.tilesPerRow.three') },
    { value: '4', label: t('marketplace.tilesPerRow.four') },
  ], [t]);

  const loadSubscriptions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resp = await api.get<DataProduct[]>('/api/data-products/my-subscriptions');
      // A failed load shows its error, with Retry
      if (resp.error) throw new Error(resp.error);
      const data = resp.data;
      setProducts(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to fetch my subscriptions:', e);
      setError(e instanceof Error ? e.message : 'Failed to load');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  // The shell's breadcrumb names this menu page from the menu: no titles to set

  const loadDomainDetails = useCallback(async (domainId: string) => {
    const id = ++domainRequest.current;
    try {
      setDomainDetailsLoading(true);
      const resp = await fetch(`/api/data-domains/${domainId}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data: DataDomain = await resp.json();
      if (id === domainRequest.current) setSelectedDomainDetails(data);
    } catch (e) {
      if (id === domainRequest.current) setSelectedDomainDetails(null);
    } finally {
      if (id === domainRequest.current) setDomainDetailsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (domainBrowserStyle === 'graph' && selectedDomainId) {
      loadDomainDetails(selectedDomainId);
    } else if (domainBrowserStyle === 'graph' && !selectedDomainId && domains.length > 0) {
      const rootDomain = domains.find(d => !d.parent_id) || domains[0];
      if (rootDomain) setSelectedDomainId(rootDomain.id);
    }
  }, [domainBrowserStyle, selectedDomainId, domains, loadDomainDetails]);

  useEffect(() => {
    setGraphFadeIn(false);
    const raf = requestAnimationFrame(() => setGraphFadeIn(true));
    return () => cancelAnimationFrame(raf);
  }, [selectedDomainDetails?.id]);

  const sortedDomains = useMemo(() => {
    if (!domains?.length) return [];
    const childrenMap = new Map<string | null, DataDomain[]>();
    domains.forEach(d => {
      const parentId = d.parent_id || null;
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
      childrenMap.get(parentId)!.push(d);
    });
    childrenMap.forEach(children => children.sort((a, b) => a.name.localeCompare(b.name)));
    const result: DataDomain[] = [];
    const add = (domain: DataDomain, depth = 0) => {
      result.push({ ...domain, _depth: depth } as DataDomain & { _depth: number });
      (childrenMap.get(domain.id) || []).forEach(c => add(c, depth + 1));
    };
    (childrenMap.get(null) || []).forEach(root => add(root));
    return result;
  }, [domains]);

  useEffect(() => {
    if (!selectedDomainId) {
      setMatchSets(null);
      return;
    }
    const selected = domains.find(d => d.id === selectedDomainId);
    if (!selected) {
      const byName = domains.find(d => d.name.toLowerCase() === selectedDomainId.toLowerCase());
      if (byName) {
        setMatchSets({ ids: new Set([byName.id]), namesLower: new Set([byName.name.toLowerCase()]) });
      } else {
        setMatchSets({ ids: new Set([selectedDomainId]), namesLower: new Set([selectedDomainId.toLowerCase()]) });
      }
      return;
    }
    if (exactMatchesOnly) {
      setMatchSets({ ids: new Set([selectedDomainId]), namesLower: new Set([selected.name.toLowerCase()]) });
      return;
    }
    const ids = new Set<string>();
    const namesLower = new Set<string>();
    const childrenByParent = new Map<string, DataDomain[]>();
    domains.forEach(d => {
      if (d.parent_id) {
        if (!childrenByParent.has(d.parent_id)) childrenByParent.set(d.parent_id, []);
        childrenByParent.get(d.parent_id)!.push(d);
      }
    });
    const queue: DataDomain[] = [selected];
    while (queue.length > 0) {
      const d = queue.shift()!;
      ids.add(d.id);
      namesLower.add(d.name.toLowerCase());
      (childrenByParent.get(d.id) || []).forEach(c => queue.push(c));
    }
    setMatchSets({ ids, namesLower });
  }, [selectedDomainId, exactMatchesOnly, domains]);

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedDomainId && matchSets) {
      list = list.filter(p => {
        const raw = p?.domain != null ? String(p.domain) : '';
        const lower = raw.toLowerCase();
        return raw && (matchSets.ids.has(raw) || matchSets.namesLower.has(lower));
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.purpose?.toLowerCase().includes(q) ||
        p.description?.usage?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedDomainId, matchSets, searchQuery]);

  const hasProducts = products.length > 0;

  const handleOpenProduct = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    navigate(`${pathname}/${productId}`);
  };

  const handleBrowseMarketplace = () => navigate('/');

  const title = t('myProducts.title');
  const header = (
    <>
      <PageHeader title={title} />
      <p className={classes.subtitle}>{t('myProducts.description')}</p>
    </>
  );
  const productsPaneLabel = t('data-products:myProductsView.productsPane');

  if (loading) {
    return (
      <PageLayout header={header}>
        <PaneStack>
          <Pane title={productsPaneLabel}>
            <div className={classes.grid} data-tiles={4}>
              {[...Array(8)].map((_, i) => (
                <CardSkeleton key={i} titleWidth="w-36" descriptionWidth="w-48" contentRows={2} />
              ))}
            </div>
          </Pane>
        </PaneStack>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout header={header}>
        <PaneStack>
          <Pane title={productsPaneLabel}>
            <div className={classes.errorState}>
              <Alert color="red" variant="light" icon={<AlertCircle />}>{error}</Alert>
              <Button variant="outline" onClick={loadSubscriptions}>{t('data-products:myProductsView.retry')}</Button>
            </div>
          </Pane>
        </PaneStack>
      </PageLayout>
    );
  }

  const showEmpty = filteredProducts.length === 0;
  const emptyNoSubscriptions = !hasProducts;

  return (
    <PageLayout
      header={header}
      filters={
        <FilterBar>
          <TextInput
            type="search"
            placeholder={t('marketplace.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            leftSection={<Search aria-hidden className={classes.searchIcon} />}
            rightSection={searchQuery ? (
              <CloseButton size="sm" aria-label={t('common:actions.clear')} onClick={() => setSearchQuery('')} />
            ) : null}
            className={classes.search}
          />
        </FilterBar>
      }
    >
      {/* Under the filter bar's rule, the panes start 12px down */}
      <div className={classes.stack}>
      <PaneStack>
        {/* Browse Data Domains */}
        <Pane
          title={t('marketplace.browseDataDomains')}
          actions={
            <>
              {selectedDomainId && (
                <Switch
                  size="xs"
                  label={t('marketplace.exactMatchOnly')}
                  labelPosition="left"
                  checked={exactMatchesOnly}
                  onChange={(e) => setExactMatchesOnly(e.currentTarget.checked)}
                  classNames={{ label: classes.switchLabel }}
                />
              )}
              <div className={classes.segmented}>
                <Button variant={domainBrowserStyle === 'pills' ? 'default' : 'ghost'} size="sm" onClick={() => setDomainBrowserStyle('pills')} title={t('marketplace.domainView.pills')}>
                  <LayoutList />
                  {t('marketplace.domainView.pills')}
                </Button>
                <Button variant={domainBrowserStyle === 'graph' ? 'default' : 'ghost'} size="sm" onClick={() => setDomainBrowserStyle('graph')} title={t('marketplace.domainView.graph')}>
                  <Network />
                  {t('marketplace.domainView.graph')}
                </Button>
              </div>
            </>
          }
        >
          {domainsLoading || domainDetailsLoading ? (
            <Skeleton height={220} radius={6} />
          ) : domainBrowserStyle === 'pills' ? (
            <div className={classes.pills}>
              <Button variant={selectedDomainId === null ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDomainId(null)} className={classes.pill}>
                {t('marketplace.allDomains')}
              </Button>
              {sortedDomains.map(domain => {
                const parentDomain = domain.parent_id ? domains.find(d => d.id === domain.parent_id) : null;
                return (
                  <HoverCard key={domain.id} openDelay={300} closeDelay={100} position="bottom-start" width={288} shadow="md">
                    <HoverCard.Target>
                      <Button variant={selectedDomainId === domain.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDomainId(domain.id)} className={classes.pill}>
                        {domain.name}
                      </Button>
                    </HoverCard.Target>
                    <HoverCard.Dropdown className={classes.domainCard}>
                      <div className={classes.domainHead}>
                        <Database aria-hidden className={classes.domainIcon} />
                        <div>
                          <h4 className={classes.domainName}>{domain.name}</h4>
                          {parentDomain && <p className={classes.muted}>{t('marketplace.domainInfo.parentDomain')}: {parentDomain.name}</p>}
                        </div>
                      </div>
                      {domain.description && <p className={`${classes.muted} ${classes.clamp3}`}>{domain.description}</p>}
                      {domain.children_count !== undefined && domain.children_count > 0 && (
                        <p className={classes.muted}>{t('marketplace.domainInfo.childDomains', { count: domain.children_count })}</p>
                      )}
                    </HoverCard.Dropdown>
                  </HoverCard>
                );
              })}
            </div>
          ) : selectedDomainDetails ? (
            <div className={classes.fade} data-shown={graphFadeIn || undefined}>
              <DataDomainMiniGraph currentDomain={selectedDomainDetails} onNodeClick={(id) => setSelectedDomainId(id)} />
            </div>
          ) : (
            <div className={classes.graphPlaceholder}>
              {t('marketplace.selectDomainForGraph')}
            </div>
          )}
        </Pane>

        {/* The subscribed products, with tiles per row */}
        <Pane
          title={productsPaneLabel}
          actions={
            <>
              {filteredProducts.length > 0 && (
                <span className={classes.count}>
                  {t('data-products:myProductsView.productsAvailable', { count: filteredProducts.length })}
                </span>
              )}
              <Grid2X2 aria-hidden className={classes.tilesIcon} />
              <Select
                size="xs"
                w={100}
                aria-label={t('data-products:myProductsView.tilesPerRow')}
                data={tileOptions}
                value={String(tilesPerRow)}
                onChange={(v) => v && setTilesPerRow(Number(v) as TilesPerRow)}
                allowDeselect={false}
                classNames={{ option: classes.option }}
              />
            </>
          }
        >
          {/* Empty state - no subscriptions at all */}
          {showEmpty && emptyNoSubscriptions && (
            <div className={classes.empty} data-dashed="">
              <ShoppingBag aria-hidden className={classes.emptyIcon} />
              <p>{t('myProducts.empty')}</p>
              <Button onClick={handleBrowseMarketplace}>{t('myProducts.browseMarketplace')}</Button>
            </div>
          )}

          {/* Empty state - filters returned no results */}
          {showEmpty && !emptyNoSubscriptions && (
            <div className={classes.empty}>
              <Package aria-hidden className={classes.emptyIcon} data-faint="" />
              <p>{t('marketplace.products.noProducts')}</p>
              <p className={classes.muted}>{t('marketplace.products.adjustFilters')}</p>
            </div>
          )}

          {/* Products list */}
          {filteredProducts.length > 0 && (
            <div className={classes.grid} data-tiles={tilesPerRow}>
              {filteredProducts.map((product) => {
                const domainStr = product?.domain != null ? String(product.domain) : '';
                const domainLabel = getDomainName(domainStr) || domainStr || t('marketplace.products.unknown');
                const description = product.description?.purpose || product.description?.usage || '';
                const owner = product.team?.members?.[0]?.username || product.team?.name || t('marketplace.products.unknown');
                const name = product.name || t('data-products:myProductsView.untitled');
                return (
                  <div
                    key={product.id || product.name}
                    className={classes.card}
                    onClick={() => product.id && navigate(`${pathname}/${product.id}`)}
                  >
                    <div className={classes.cardHead}>
                      <Package aria-hidden className={classes.cardIcon} />
                      <span className={classes.cardTitle} title={name}>{name}</span>
                      {product.id && (
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          className={classes.open}
                          onClick={(e) => handleOpenProduct(e, product.id!)}
                          title={t('marketplace.openInDetails')}
                        >
                          <ExternalLink aria-hidden />
                        </ActionIcon>
                      )}
                    </div>
                    {description && <p className={`${classes.muted} ${classes.clamp2}`}>{description}</p>}
                    <div className={classes.cardBadges}>
                      <Badge variant="secondary">{domainLabel}</Badge>
                      {product.status && <Badge variant="outline">{product.status}</Badge>}
                    </div>
                    <p className={classes.owner} title={owner}>{t('marketplace.products.owner')}: {owner}</p>
                  </div>
                );
              })}
            </div>
          )}
        </Pane>
      </PaneStack>
      </div>
    </PageLayout>
  );
}
