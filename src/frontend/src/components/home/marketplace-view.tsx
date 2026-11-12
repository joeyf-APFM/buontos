import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, CloseButton, Loader, Popover, Select, Switch, TextInput, UnstyledButton } from '@mantine/core';
import { AlertCircle, Database, Search, Bell, LayoutList, Network, Package, Grid2X2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDomains } from '@/hooks/use-domains';
import { type DataProduct } from '@/types/data-product';
import { type DataDomain } from '@/types/data-domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/stores/user-store';
import { useViewModeStore, type TilesPerRow } from '@/stores/view-mode-store';
import { FilterBar, PageHeader, PageLayout, Pane, PaneStack } from '@/mantine/page';
import EntityInfoDialog from '@/components/metadata/entity-info-dialog';
import SubscribeDialog from '@/components/data-products/subscribe-dialog';
import ApprovalWizardDialog from '@/components/workflows/approval-wizard-dialog';
import { useApprovalWizardTrigger } from '@/hooks/use-approval-wizard-trigger';
import { DataDomainMiniGraph } from '@/components/data-domains/data-domain-mini-graph';
import { RatingBadge } from '@/components/ratings';
import { QualityBadge } from '@/components/quality/quality-badge';
import CertificationBadge from '@/components/common/certification-badge';
import PublicationBadge from '@/components/common/publication-badge';
import { PUBLICATION_SCOPE_LABELS, type CertificationLevel } from '@/types/lifecycle';
import classes from './marketplace-view.module.css';

/**
 * A domain chip, a toggle, with its preview: a hover card that opens on hover and on focus
 * (as the Radix HoverCard did), 300ms after, and closes 100ms after the
 * pointer leaves both the chip and the card, or the chip loses focus.
 */
function DomainChip({ name, selected, onToggle, children }: { name: string; selected: boolean; onToggle: () => void; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const later = (open: boolean, delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpened(open), delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = () => later(true, 300);
  const hide = () => later(false, 100);
  return (
    // withRoles off: the chip stays a plain toggle, as under the Radix HoverCard
    <Popover opened={opened} position="bottom-start" width={288} shadow="md" withRoles={false}>
      <Popover.Target>
        <Button
          variant={selected ? 'default' : 'outline'}
          size="sm"
          type="button"
          aria-pressed={selected}
          onClick={onToggle}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className={classes.pill}
        >
          {name}
        </Button>
      </Popover.Target>
      <Popover.Dropdown className={classes.domainCard} onMouseEnter={show} onMouseLeave={hide}>
        {children}
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * Marketplace (/marketplace) on the page kit (wave 2 Task 16): the greeting
 * as the kit header with the tagline under it, the search and the
 * publication scope in the filter bar, then two stacked panes: the domain
 * browser (domain chips with their hover cards, or the domain graph) and the
 * published products' cards, 1 to 4 per row. The view mode and the tiles per
 * row persist (view-mode-store). A product's card opens its info dialog,
 * whose Subscribe starts the subscription wizard or the subscribe dialog;
 * Open in details goes to the product.
 */
export default function MarketplaceView() {
  const { t } = useTranslation(['home', 'metadata', 'common']);
  const navigate = useNavigate();
  const { domains, loading: domainsLoading, getDomainName } = useDomains();
  const { userInfo } = useUserStore();
  const { domainBrowserStyle, setDomainBrowserStyle, tilesPerRow, setTilesPerRow } = useViewModeStore();

  const tileOptions = useMemo(() => [
    { value: '1', label: t('marketplace.tilesPerRow.one') },
    { value: '2', label: t('marketplace.tilesPerRow.two') },
    { value: '3', label: t('marketplace.tilesPerRow.three') },
    { value: '4', label: t('marketplace.tilesPerRow.four') },
  ], [t]);

  const scopeOptions = useMemo(() => [
    { value: 'all', label: t('marketplace.scopeFilter.all') },
    { value: 'domain', label: PUBLICATION_SCOPE_LABELS.domain },
    { value: 'organization', label: PUBLICATION_SCOPE_LABELS.organization },
    { value: 'external', label: PUBLICATION_SCOPE_LABELS.external },
  ], [t]);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  // Multi-domain filter (#520 story 10): the marketplace filters by one or MORE
  // domains and shows entities matching ANY of them (union). Empty = all domains.
  const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);
  // Graph view focuses a single domain for the mini-graph; kept separate from the
  // multi-select filter so browsing the graph doesn't collapse the filter to one.
  const [graphFocusId, setGraphFocusId] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [certificationLevels, setCertificationLevels] = useState<CertificationLevel[]>([]);
  
  // Graph view state
  const [selectedDomainDetails, setSelectedDomainDetails] = useState<DataDomain | null>(null);
  const [domainDetailsLoading, setDomainDetailsLoading] = useState(false);
  const [graphFadeIn, setGraphFadeIn] = useState(false);
  
  // Exact match filter (false = include children, true = exact domain only)
  const [exactMatchesOnly, setExactMatchesOnly] = useState(false);
  const [matchSets, setMatchSets] = useState<{ ids: Set<string>; namesLower: Set<string> } | null>(null);
  const [matchesLoading, _setMatchesLoading] = useState(false);
  
  // Products state
  const [allProducts, setAllProducts] = useState<DataProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  // Retry asks for the list again
  const [productsReload, setProductsReload] = useState(0);
  // Only the latest domain lookup may show: an earlier one that answers late is dropped
  const domainRequest = useRef(0);
  
  // Subscribed products state
  const [, setSubscribedProducts] = useState<DataProduct[]>([]);
  const [subscribedProductIds, setSubscribedProductIds] = useState<Set<string>>(new Set());
  const [, setSubscribedLoading] = useState(true);
  
  // Dialog state
  const [selectedProduct, setSelectedProduct] = useState<DataProduct | null>(null);
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [subscriptionWizardOpen, setSubscriptionWizardOpen] = useState(false);
  const [subscriptionWorkflowId, setSubscriptionWorkflowId] = useState<string | null>(null);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [productIsSubscribed, setProductIsSubscribed] = useState(false);
  const { lookupWorkflowId } = useApprovalWizardTrigger();

  useEffect(() => {
    let cancelled = false;
    fetch('/api/certification-levels')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setCertificationLevels(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setCertificationLevels([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch published products (optional server-side scope filter); an answer
  // for an earlier scope that arrives late is dropped
  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      try {
        setProductsLoading(true);
        const params =
          scopeFilter !== 'all' ? `?scope=${encodeURIComponent(scopeFilter)}` : '';
        const resp = await fetch(`/api/data-products/published${params}`);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data = await resp.json();
        if (cancelled) return;
        setAllProducts(Array.isArray(data) ? data : []);
        setProductsError(null);
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : t('marketplace.loadError');
        setProductsError(message);
        setAllProducts([]);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    };
    loadProducts();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeFilter, productsReload]);

  // Fetch subscribed products
  const loadSubscribedProducts = useCallback(async () => {
    try {
      setSubscribedLoading(true);
      const resp = await fetch('/api/data-products/my-subscriptions');
      if (!resp.ok) {
        if (resp.status === 401) {
          setSubscribedProducts([]);
          setSubscribedProductIds(new Set());
          return;
        }
        throw new Error(`HTTP error! status: ${resp.status}`);
      }
      const data = await resp.json();
      const products = Array.isArray(data) ? data : [];
      setSubscribedProducts(products);
      setSubscribedProductIds(new Set(products.map((p: DataProduct) => p.id).filter(Boolean)));
    } catch (e) {
      console.warn('Failed to fetch subscribed products:', e);
      setSubscribedProducts([]);
      setSubscribedProductIds(new Set());
    } finally {
      setSubscribedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubscribedProducts();
  }, [loadSubscribedProducts]);

  // Load domain details when in graph mode and domain is selected
  const loadDomainDetails = useCallback(async (domainId: string) => {
    const id = ++domainRequest.current;
    try {
      setDomainDetailsLoading(true);
      const resp = await fetch(`/api/data-domains/${domainId}`);
      if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
      const data: DataDomain = await resp.json();
      if (id === domainRequest.current) setSelectedDomainDetails(data);
    } catch (e) {
      console.error('Failed to load domain details:', e);
      if (id === domainRequest.current) setSelectedDomainDetails(null);
    } finally {
      if (id === domainRequest.current) setDomainDetailsLoading(false);
    }
  }, []);

  // Load domain details when switching to graph mode or changing the graph focus.
  useEffect(() => {
    if (domainBrowserStyle === 'graph' && graphFocusId) {
      loadDomainDetails(graphFocusId);
    } else if (domainBrowserStyle === 'graph' && !graphFocusId && domains.length > 0) {
      // Auto-focus first root domain for graph view (focus only; does not filter).
      const rootDomain = domains.find(d => !d.parent_id) || domains[0];
      if (rootDomain) {
        setGraphFocusId(rootDomain.id);
      }
    }
  }, [domainBrowserStyle, graphFocusId, domains, loadDomainDetails]);

  // Fade-in effect for graph when domain changes
  useEffect(() => {
    setGraphFadeIn(false);
    const raf = requestAnimationFrame(() => setGraphFadeIn(true));
    return () => cancelAnimationFrame(raf);
  }, [selectedDomainDetails?.id]);

  // Sort domains by hierarchy (roots first, then children under their parents)
  const sortedDomains = useMemo(() => {
    if (!domains || domains.length === 0) return [];
    
    // Build a map of parent_id to children
    const childrenMap = new Map<string | null, DataDomain[]>();
    domains.forEach(d => {
      const parentId = d.parent_id || null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(d);
    });
    
    // Sort each group alphabetically
    childrenMap.forEach((children) => {
      children.sort((a, b) => a.name.localeCompare(b.name));
    });
    
    // Build sorted list: roots first, then recursively add children
    const result: DataDomain[] = [];
    const addWithChildren = (domain: DataDomain, depth: number = 0) => {
      result.push({ ...domain, _depth: depth } as DataDomain & { _depth: number });
      const children = childrenMap.get(domain.id) || [];
      children.forEach(child => addWithChildren(child, depth + 1));
    };
    
    // Start with root domains (those without parent)
    const roots = childrenMap.get(null) || [];
    roots.forEach(root => addWithChildren(root));
    
    return result;
  }, [domains]);

  // Build match sets from the selected domains (union / any-of, #520 story 10).
  // Uses the already-loaded domains array to walk the tree client-side (no API calls needed).
  // "Include children" (default) unions each selected domain with its descendants (story 11).
  useEffect(() => {
    if (selectedDomainIds.length === 0) {
      setMatchSets(null);
      return;
    }

    // Build a map of parent_id -> children once for descendant walks.
    const childrenByParentId = new Map<string, DataDomain[]>();
    domains.forEach(d => {
      if (d.parent_id) {
        if (!childrenByParentId.has(d.parent_id)) {
          childrenByParentId.set(d.parent_id, []);
        }
        childrenByParentId.get(d.parent_id)!.push(d);
      }
    });

    const ids = new Set<string>();
    const namesLower = new Set<string>();

    for (const selectedId of selectedDomainIds) {
      const selected =
        domains.find(d => d.id === selectedId) ||
        domains.find(d => d.name.toLowerCase() === selectedId.toLowerCase());

      if (!selected) {
        // Unknown id/name: match it literally so a stale selection still filters.
        ids.add(selectedId);
        namesLower.add(selectedId.toLowerCase());
        continue;
      }

      if (exactMatchesOnly) {
        ids.add(selected.id);
        namesLower.add(selected.name.toLowerCase());
        continue;
      }

      // Include children: walk all descendants from this selected domain.
      const queue: DataDomain[] = [selected];
      while (queue.length > 0) {
        const domain = queue.shift()!;
        ids.add(domain.id);
        namesLower.add(domain.name.toLowerCase());
        queue.push(...(childrenByParentId.get(domain.id) || []));
      }
    }

    setMatchSets({ ids, namesLower });
  }, [selectedDomainIds, exactMatchesOnly, domains]);

  // Filter products based on search and domain
  const filteredProducts = useMemo(() => {
    let filtered = allProducts;
    
    // Filter by domain using matchSets
    if (selectedDomainIds.length > 0) {
      if (!matchSets) return []; // Still loading match sets
      filtered = filtered.filter(p => {
        // Any-of semantics (#520 story 9/10): match when ANY of the product's assigned
        // domains (primary OR additional) falls in the selected domain (+descendants) set,
        // not just the primary. domain_ids carries all assignments; fall back to the
        // legacy primary `domain` id/name for products not yet re-indexed.
        const assignedIds = (p as any)?.domain_ids as string[] | undefined;
        if (assignedIds && assignedIds.length > 0) {
          if (assignedIds.some(id => matchSets.ids.has(String(id)))) return true;
        }
        const productDomainRaw = p?.domain;
        const productDomainIdLike = productDomainRaw != null ? String(productDomainRaw) : '';
        const productDomainLower = productDomainIdLike.toLowerCase();
        if (!productDomainLower) return false;
        if (matchSets.ids.has(productDomainIdLike)) return true; // Match by id (primary)
        if (matchSets.namesLower.has(productDomainLower)) return true; // Match by name (primary)
        return false;
      });
    }
    
    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.name?.toLowerCase().includes(query) ||
        p.description?.purpose?.toLowerCase().includes(query) ||
        p.description?.usage?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [allProducts, selectedDomainIds, searchQuery, matchSets]);

  // Toggle a domain in the multi-select filter (add if absent, remove if present).
  const toggleDomain = useCallback((domainId: string) => {
    setSelectedDomainIds(prev =>
      prev.includes(domainId) ? prev.filter(id => id !== domainId) : [...prev, domainId]
    );
  }, []);

  // Add a domain to the filter (idempotent). Used by the graph view, where a node
  // click both focuses the graph and includes that domain in the filter — adding
  // (not toggling) so navigating back to an already-selected node never silently
  // removes it from the filter.
  const addDomainToFilter = useCallback((domainId: string) => {
    setSelectedDomainIds(prev => (prev.includes(domainId) ? prev : [...prev, domainId]));
  }, []);

  // Handle product card click
  const handleProductClick = async (product: DataProduct) => {
    setSelectedProduct(product);
    setCheckingSubscription(true);
    setProductIsSubscribed(subscribedProductIds.has(product.id || ''));
    setInfoDialogOpen(true);
    setCheckingSubscription(false);
  };

  // Handle subscribe button in info dialog: try approval wizard (subscription workflow), fallback to old dialog
  const handleSubscribeClick = async () => {
    setInfoDialogOpen(false);
    const workflowId = await lookupWorkflowId('for_subscribe');
    if (workflowId) {
      setSubscriptionWorkflowId(workflowId);
      setSubscriptionWizardOpen(true);
    } else {
      setSubscribeDialogOpen(true);
    }
  };

  // Handle successful product subscription (from wizard or old dialog)
  const handleProductSubscriptionSuccess = () => {
    loadSubscribedProducts();
    setSubscribeDialogOpen(false);
    setSubscriptionWizardOpen(false);
    setSubscriptionWorkflowId(null);
    setSelectedProduct(null);
  };

  // Get user's first name for greeting
  // Try display name (user field), then fall back to username/email
  const firstName = useMemo(() => {
    // First try the 'user' field which often contains the display name
    if (userInfo?.user) {
      const name = userInfo.user.trim();
      // Check for "Last, First" format
      if (name.includes(',')) {
        const afterComma = name.split(',')[1]?.trim();
        if (afterComma) {
          // Take first word after comma (handles "Last, First Middle")
          return afterComma.split(' ')[0];
        }
      }
      // Standard "First Last" format
      return name.split(' ')[0] || '';
    }
    // Fall back to username (might be email format like first.last@domain.com)
    if (userInfo?.username) {
      // If it looks like an email, extract the first part before @
      const emailPart = userInfo.username.split('@')[0];
      // If it has dots (like first.last), take the first part
      const namePart = emailPart.split('.')[0];
      // Capitalize first letter
      return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
    }
    return '';
  }, [userInfo]);

  // Handle opening product in details view
  const handleOpenProductDetails = (e: React.MouseEvent, productId: string) => {
    e.stopPropagation();
    navigate(`/my-products/${productId}`);
  };

  // A product's card: the name opens its info dialog (as a click anywhere on
  // the card does), Open in details goes to the product
  const renderProductCard = (product: DataProduct, isSubscribed: boolean = false) => {
    const domainRaw = product?.domain;
    const domainStr = domainRaw != null ? String(domainRaw) : '';
    const domainLabel = getDomainName(domainStr) || domainStr || t('marketplace.products.unknown');
    const description = product.description?.purpose || product.description?.usage || '';
    const owner = product.team?.members?.[0]?.username || product.team?.name || t('marketplace.products.unknown');
    const name = product.name || t('marketplace.products.untitled');
    const titleId = `marketplace-product-${product.id || product.name}`;

    return (
      // The click is the title button's, bubbled, or a pointer's anywhere on the card
      <article
        key={product.id || product.name}
        className={classes.card}
        data-subscribed={isSubscribed || undefined}
        aria-labelledby={titleId}
        onClick={() => handleProductClick(product)}
      >
        <div className={classes.cardHead}>
          <Package aria-hidden className={classes.cardIcon} />
          <UnstyledButton id={titleId} className={classes.cardTitle} title={name}>
            {name}
          </UnstyledButton>
          {isSubscribed && (
            <Bell role="img" aria-label={t('metadata:info.subscribed')} className={classes.subscribed} />
          )}
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            className={classes.open}
            onClick={(e) => handleOpenProductDetails(e, product.id || '')}
            aria-label={t('marketplace.openInDetails')}
            title={t('marketplace.openInDetails')}
          >
            <ExternalLink aria-hidden />
          </ActionIcon>
        </div>
        {description && <p className={`${classes.muted} ${classes.clamp2}`} title={description}>{description}</p>}
        <div className={classes.cardBadges}>
          <Badge variant="secondary">{domainLabel}</Badge>
          {product.status && <Badge variant="outline">{product.status}</Badge>}
          <PublicationBadge
            publicationScope={product.publication_scope}
            publishedAt={product.published_at ?? undefined}
            publishedBy={product.published_by ?? undefined}
          />
          <CertificationBadge
            certificationLevel={product.certification_level}
            inheritedCertificationLevel={product.inherited_certification_level}
            certifiedAt={product.certified_at ?? undefined}
            certifiedBy={product.certified_by ?? undefined}
            levels={certificationLevels}
            size="sm"
          />
          {product.id && <RatingBadge entityType="data_product" entityId={product.id} size="sm" />}
          {product.id && <QualityBadge entityType="data_product" entityId={product.id} productAggregation size="sm" />}
        </div>
        <p className={classes.owner} title={owner}>{t('marketplace.products.owner')}: {owner}</p>
      </article>
    );
  };

  const title = firstName ? t('marketplace.welcomeWithName', { name: firstName }) : t('marketplace.welcome');
  const filtersSet = !!searchQuery || selectedDomainIds.length > 0 || scopeFilter !== 'all';

  return (
    <>
    <PageLayout
      header={
        <>
          <PageHeader title={title} />
          <p className={classes.subtitle}>{t('marketplace.tagline')}</p>
        </>
      }
      filters={
        <FilterBar>
          <TextInput
            type="search"
            placeholder={t('marketplace.searchPlaceholder')}
            // The field was named by its placeholder; it keeps that name
            aria-label={t('marketplace.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            leftSection={<Search aria-hidden className={classes.searchIcon} />}
            rightSection={searchQuery ? (
              <CloseButton size="sm" aria-label={t('common:actions.clear')} onClick={() => setSearchQuery('')} />
            ) : null}
            className={classes.search}
          />
          <Select
            size="xs"
            aria-label={t('marketplace.scopeFilter.label')}
            placeholder={t('marketplace.scopeFilter.placeholder')}
            data={scopeOptions}
            value={scopeFilter}
            onChange={(v) => v && setScopeFilter(v)}
            allowDeselect={false}
            className={classes.scope}
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
              {/* Exact match - only when at least one domain is selected */}
              {selectedDomainIds.length > 0 && (
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
                <Button
                  variant={domainBrowserStyle === 'pills' ? 'default' : 'ghost'}
                  size="sm"
                  type="button"
                  aria-pressed={domainBrowserStyle === 'pills'}
                  onClick={() => setDomainBrowserStyle('pills')}
                  title={t('marketplace.domainView.pills')}
                >
                  <LayoutList aria-hidden />
                  {t('marketplace.domainView.pills')}
                </Button>
                <Button
                  variant={domainBrowserStyle === 'graph' ? 'default' : 'ghost'}
                  size="sm"
                  type="button"
                  aria-pressed={domainBrowserStyle === 'graph'}
                  onClick={() => setDomainBrowserStyle('graph')}
                  title={t('marketplace.domainView.graph')}
                >
                  <Network aria-hidden />
                  {t('marketplace.domainView.graph')}
                </Button>
              </div>
            </>
          }
        >
          {domainsLoading || domainDetailsLoading ? (
            <div className={classes.placeholder}>
              <Loader size={14} />
              <span>{t('marketplace.loadingDomains')}</span>
            </div>
          ) : domainBrowserStyle === 'pills' ? (
            <div className={classes.pills}>
              <Button
                variant={selectedDomainIds.length === 0 ? 'default' : 'outline'}
                size="sm"
                type="button"
                aria-pressed={selectedDomainIds.length === 0}
                onClick={() => setSelectedDomainIds([])}
                className={classes.pill}
              >
                {t('marketplace.allDomains')}
              </Button>
              {sortedDomains.map(domain => {
                const parentDomain = domain.parent_id
                  ? domains.find(d => d.id === domain.parent_id)
                  : null;
                const selected = selectedDomainIds.includes(domain.id);
                return (
                  <DomainChip key={domain.id} name={domain.name} selected={selected} onToggle={() => toggleDomain(domain.id)}>
                      <div className={classes.domainHead}>
                        <Database aria-hidden className={classes.domainIcon} />
                        <div>
                          <h4 className={classes.domainName}>{domain.name}</h4>
                          {parentDomain && (
                            <p className={classes.muted}>
                              {t('marketplace.domainInfo.parentDomain')}: {parentDomain.name}
                            </p>
                          )}
                        </div>
                      </div>
                      {domain.description && (
                        <p className={`${classes.muted} ${classes.clamp3}`}>{domain.description}</p>
                      )}
                      {domain.children_count !== undefined && domain.children_count > 0 && (
                        <p className={classes.muted}>
                          {t('marketplace.domainInfo.childDomains', { count: domain.children_count })}
                        </p>
                      )}
                  </DomainChip>
                );
              })}
            </div>
          ) : selectedDomainDetails ? (
            /* Graph View */
            <div className={classes.fade} data-shown={graphFadeIn || undefined}>
              <DataDomainMiniGraph
                currentDomain={selectedDomainDetails}
                // Node click focuses the graph AND includes that domain in the filter.
                // We add (never remove) so re-visiting a node during navigation can't
                // silently drop it from the filter; clearing is done via the pills view
                // or the "clear filters" control.
                onNodeClick={(id) => { setGraphFocusId(id); addDomainToFilter(id); }}
              />
            </div>
          ) : (
            <div className={classes.placeholder}>{t('marketplace.selectDomainForGraph')}</div>
          )}
        </Pane>

        {/* The published products, with tiles per row */}
        <Pane
          title={t('marketplace.assetTypes.products')}
          actions={
            <>
              {!productsLoading && !matchesLoading && !productsError && filteredProducts.length > 0 && (
                <span className={classes.count}>
                  {t('marketplace.products.available', { count: filteredProducts.length })}
                </span>
              )}
              <Grid2X2 aria-hidden className={classes.tilesIcon} />
              <Select
                size="xs"
                w={100}
                aria-label={t('marketplace.tilesPerRow.label')}
                placeholder={t('marketplace.tilesPerRow.placeholder')}
                data={tileOptions}
                value={String(tilesPerRow)}
                onChange={(v) => v && setTilesPerRow(Number(v) as TilesPerRow)}
                allowDeselect={false}
                classNames={{ option: classes.option }}
              />
            </>
          }
        >
          {productsLoading || matchesLoading ? (
            <div className={classes.loading}>
              <Loader size={28} />
            </div>
          ) : productsError ? (
            <div className={classes.errorState}>
              <Alert
                color="red"
                variant="light"
                icon={<AlertCircle />}
                title={t('marketplace.loadError')}
                className={classes.alert}
              >
                <span className={classes.alertMessage}>{productsError}</span>
              </Alert>
              <Button variant="outline" type="button" onClick={() => setProductsReload((n) => n + 1)}>
                {t('common:retry')}
              </Button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className={classes.empty}>
              <Package aria-hidden className={classes.emptyIcon} />
              <p>{t('marketplace.products.noProducts')}</p>
              {filtersSet && <p className={classes.muted}>{t('marketplace.products.adjustFilters')}</p>}
            </div>
          ) : (
            <div className={classes.grid} data-tiles={tilesPerRow}>
              {filteredProducts.map(p => renderProductCard(p, subscribedProductIds.has(p.id || '')))}
            </div>
          )}
        </Pane>
      </PaneStack>
      </div>
    </PageLayout>

      {/* Info Dialog - Products */}
      {selectedProduct && (
        <EntityInfoDialog
          entityType="data_product"
          entityId={selectedProduct.id || null}
          title={selectedProduct.name}
          open={infoDialogOpen}
          onOpenChange={(open) => {
            setInfoDialogOpen(open);
            if (!open) setSelectedProduct(null);
          }}
          onSubscribe={handleSubscribeClick}
          isSubscribed={productIsSubscribed}
          subscriptionLoading={checkingSubscription}
          showBackButton
          onGoToDetails={() => {
            const productId = selectedProduct?.id;
            if (!productId) return;
            setInfoDialogOpen(false);
            setSelectedProduct(null);
            navigate(`/my-products/${productId}`);
          }}
        />
      )}

      {/* Subscription wizard (approval workflow with completion_action=subscribe) */}
      {selectedProduct && subscriptionWizardOpen && subscriptionWorkflowId && (
        <ApprovalWizardDialog
          isOpen={subscriptionWizardOpen}
          onOpenChange={(open) => {
            setSubscriptionWizardOpen(open);
            if (!open) {
              setSubscriptionWorkflowId(null);
              setSelectedProduct(null);
            }
          }}
          entityType="data_product"
          entityId={selectedProduct.id || ''}
          preselectedWorkflowId={subscriptionWorkflowId}
          completionAction="subscribe"
          autoStartWithPreselected
          onComplete={handleProductSubscriptionSuccess}
        />
      )}

      {/* Subscribe Dialog - Products (fallback when no subscription workflow) */}
      {selectedProduct && (
        <SubscribeDialog
          open={subscribeDialogOpen}
          onOpenChange={(open) => {
            setSubscribeDialogOpen(open);
            if (!open) setSelectedProduct(null);
          }}
          productId={selectedProduct.id || ''}
          productName={selectedProduct.name || t('marketplace.products.unknownProduct')}
          onSuccess={handleProductSubscriptionSuccess}
        />
      )}
    </>
  );
}

