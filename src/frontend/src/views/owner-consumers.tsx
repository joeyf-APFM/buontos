import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton, TextInput, UnstyledButton } from '@mantine/core';
import { Badge } from '@/components/ui/badge';
import { Package, Users, Search, User, Calendar, MessageSquare } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { RelativeDate } from '@/components/common/relative-date';
import { SummaryStat, SummaryStats } from '@/components/common/summary-stats';
import { PageHeader, PageLayout, Pane } from '@/mantine/page';
import grid from '@/mantine/asset-explorer/explorer.module.css';
import type { DataProduct, SubscriberInfo } from '@/types/data-product';
import classes from './owner-consumers.module.css';

interface ProductWithSubscribers {
  product: DataProduct;
  subscribers: SubscriberInfo[];
  loading: boolean;
}

export default function OwnerConsumersView() {
  const { t } = useTranslation(['data-products', 'common']);
  // The hook returns a new object every render; its functions are stable
  const { get: apiGet } = useApi();
  const setStaticSegments = useBreadcrumbStore((s) => s.setStaticSegments);

  const [products, setProducts] = useState<DataProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [productSubscribers, setProductSubscribers] = useState<Record<string, ProductWithSubscribers>>({});
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setStaticSegments([{ label: t('ownerConsumers.breadcrumb') }]);
  }, [setStaticSegments, t]);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const resp = await apiGet<DataProduct[]>('/api/data-products');
      // A failed load answers with an error and an empty object: guard the list
      setProducts(Array.isArray(resp.data) ? resp.data : []);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setProductsLoading(false);
    }
  }, [apiGet]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Each answer is kept under its own product, so one that comes back late
  // never shows under another
  const fetchSubscribers = useCallback(async (productId: string) => {
    setProductSubscribers((prev) => ({
      ...prev,
      [productId]: { ...prev[productId], loading: true },
    }));
    try {
      const resp = await apiGet<{ subscribers: SubscriberInfo[] }>(`/api/data-products/${productId}/subscribers`);
      const subscribers = resp.data?.subscribers;
      setProductSubscribers((prev) => ({
        ...prev,
        [productId]: {
          product: products.find((p) => p.id === productId)!,
          subscribers: Array.isArray(subscribers) ? subscribers : [],
          loading: false,
        },
      }));
    } catch (err) {
      console.error('Failed to fetch subscribers:', err);
      setProductSubscribers((prev) => ({
        ...prev,
        [productId]: { ...prev[productId], subscribers: [], loading: false },
      }));
    }
  }, [apiGet, products]);

  useEffect(() => {
    if (selectedProductId && !productSubscribers[selectedProductId]) {
      fetchSubscribers(selectedProductId);
    }
  }, [selectedProductId, fetchSubscribers, productSubscribers]);

  // Auto-select first product
  useEffect(() => {
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

  const totalSubscribers = useMemo(() => {
    return Object.values(productSubscribers).reduce(
      (sum, ps) => sum + (ps.subscribers?.length ?? 0),
      0
    );
  }, [productSubscribers]);

  // Fetch subscriber counts for all products on initial load
  useEffect(() => {
    if (products.length > 0) {
      products.forEach((p) => {
        if (!productSubscribers[p.id]) {
          fetchSubscribers(p.id);
        }
      });
    }
  }, [products]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedData = selectedProductId ? productSubscribers[selectedProductId] : null;

  const filteredSubscribers = useMemo(() => {
    if (!selectedData?.subscribers) return [];
    if (!searchQuery.trim()) return selectedData.subscribers;
    const q = searchQuery.toLowerCase();
    return selectedData.subscribers.filter(
      (s) =>
        s.email.toLowerCase().includes(q) ||
        (s.reason && s.reason.toLowerCase().includes(q))
    );
  }, [selectedData, searchQuery]);

  const activeProducts = products.filter((p) => p.status === 'active' || p.status === 'approved');

  const emptyState = (message: string) => (
    <div className={classes.empty}>
      <Users aria-hidden />
      <p>{message}</p>
    </div>
  );

  return (
    <PageLayout
      stackBelow="lg"
      header={
        <>
          <PageHeader title={t('ownerConsumers.breadcrumb')} />
          <SummaryStats label={t('ownerConsumers.summary')}>
            <SummaryStat
              icon={<Package aria-hidden />}
              tone="accent"
              label={t('ownerConsumers.totalProducts')}
              value={products.length}
              loading={productsLoading}
            />
            <SummaryStat
              icon={<Package aria-hidden />}
              tone="good"
              label={t('ownerConsumers.activeProducts')}
              value={activeProducts.length}
              loading={productsLoading}
            />
            <SummaryStat
              icon={<Users aria-hidden />}
              tone="info"
              label={t('ownerConsumers.totalSubscribers')}
              value={totalSubscribers}
              loading={productsLoading}
            />
          </SummaryStats>
        </>
      }
    >
      {/* Product list */}
      <Pane title={t('ownerConsumers.products')} className={classes.productsPane}>
        <div className={classes.productList}>
          {productsLoading ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={40} radius="sm" />)
          ) : products.length === 0 ? (
            <p className={classes.noProducts}>{t('ownerConsumers.noProducts')}</p>
          ) : (
            products.map((p) => {
              const subCount = productSubscribers[p.id]?.subscribers?.length ?? 0;
              const name = p.name ?? p.id ?? '';
              return (
                <UnstyledButton
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className={classes.product}
                  data-selected={selectedProductId === p.id || undefined}
                >
                  <span className={classes.productText}>
                    <span className={classes.productName} title={name}>{name}</span>
                    <span className={classes.productDomain}>{p.domain ?? t('ownerConsumers.noDomain')}</span>
                  </span>
                  <Badge variant="secondary" className={classes.count}>
                    <Users aria-hidden />
                    {subCount}
                  </Badge>
                </UnstyledButton>
              );
            })
          )}
        </div>
      </Pane>

      {/* Subscriber detail */}
      <Pane
        flush
        className={classes.subscribersPane}
        titleTooltip
        title={selectedData?.product
          ? t('ownerConsumers.subscribersFor', { name: selectedData.product.name ?? selectedData.product.id })
          : t('ownerConsumers.selectProduct')}
        actions={selectedProductId && (
          <TextInput
            size="xs"
            placeholder={t('ownerConsumers.filterPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            leftSection={<Search size={14} aria-hidden />}
            className={classes.filter}
          />
        )}
      >
        {!selectedProductId ? (
          emptyState(t('ownerConsumers.selectProductHint'))
        ) : selectedData?.loading ? (
          <div className={classes.skeleton}>
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} height={28} radius="sm" />)}
          </div>
        ) : filteredSubscribers.length === 0 ? (
          emptyState(searchQuery ? t('ownerConsumers.noSubscribersMatch') : t('ownerConsumers.noSubscribers'))
        ) : (
          <div className={grid.tableWrap}>
            <table className={`${grid.table} ${classes.grid}`}>
              <thead>
                <tr>
                  <th>{t('ownerConsumers.colSubscriber')}</th>
                  <th>{t('ownerConsumers.colSubscribed')}</th>
                  <th>{t('ownerConsumers.colReason')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscribers.map((sub) => (
                  <tr key={sub.email}>
                    <td className={classes.subscriberCell}>
                      <span className={classes.subscriber}>
                        <span className={classes.avatar}><User aria-hidden /></span>
                        <span className={classes.email}>{sub.email}</span>
                      </span>
                    </td>
                    <td>
                      <span className={classes.iconText}>
                        <Calendar aria-hidden />
                        <RelativeDate date={sub.subscribed_at} />
                      </span>
                    </td>
                    <td>
                      {sub.reason ? (
                        <span className={classes.iconText}>
                          <MessageSquare aria-hidden />
                          <span className={classes.reason} title={sub.reason}>{sub.reason}</span>
                        </span>
                      ) : (
                        <span className={classes.none}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Pane>
    </PageLayout>
  );
}
