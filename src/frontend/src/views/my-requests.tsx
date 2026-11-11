import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link, useLocation } from 'react-router-dom';
import { ActionIcon, Alert, Loader } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Inbox, XCircle, ShieldCheck, Package, Bell } from 'lucide-react';
import { RelativeDate } from '@/components/common/relative-date';
import { ListViewSkeleton } from '@/components/common/list-view-skeleton';
import { SummaryStat, SummaryStats } from '@/components/common/summary-stats';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { PageHeader, PageLayout, Pane, Tabs } from '@/mantine/page';
import grid from '@/mantine/asset-explorer/explorer.module.css';
import type { DataProduct } from '@/types/data-product';
import classes from './my-requests.module.css';

interface AccessGrantRequestItem {
  id: string;
  requester_email: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
  requested_duration_days: number;
  permission_level: string;
  reason?: string | null;
  status: string;
  created_at: string;
  handled_at?: string | null;
  handled_by?: string | null;
  admin_message?: string | null;
}

interface MyRequestsResponse {
  requests: AccessGrantRequestItem[];
  total: number;
}

type RequestRow = {
  id: string;
  entityName: string;
  entityType: string;
  entityId: string;
  permissionLevel: string;
  durationDays: number;
  status: string;
  created_at: string;
  handled_at?: string | null;
  canCancel: boolean;
  raw: AccessGrantRequestItem;
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  approved: 'default',
  denied: 'destructive',
  cancelled: 'outline',
  expired: 'outline',
};

function getEntityDetailPath(entityType: string, entityId: string, basePath: string): string | null {
  const key = entityType?.toLowerCase?.() ?? '';
  if (!entityId) return null;
  const prefix = basePath.split('/').slice(0, 2).join('/');
  if (key === 'data_product') return `${prefix}/my-products/${entityId}`;
  if (key === 'data_contract') return `${prefix}/contracts/${entityId}`;
  return null;
}

function entityTypeLabel(entityType: string, t: TFunction): string {
  const key = entityType?.toLowerCase?.() ?? '';
  if (key === 'data_product') return t('data-asset-reviews:myRequests.entityTypes.dataProduct');
  if (key === 'data_contract') return t('data-asset-reviews:myRequests.entityTypes.dataContract');
  return entityType;
}

export default function MyRequests() {
  const { t } = useTranslation(['data-asset-reviews', 'common', 'home']);
  // The hook returns a new object every render; its functions are stable
  const { get: apiGet, delete: apiDelete } = useApi();
  const { toast } = useToast();
  const { pathname } = useLocation();

  const [activeTab, setActiveTab] = useState('requests');

  // Access requests state
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<DataProduct[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);

  // The shell's breadcrumb names this menu page from the menu: no titles to set

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const resp = await fetch('/api/access-grants/my-requests');
      if (!resp.ok) {
        setRequestsError(`HTTP ${resp.status}`);
        setRows([]);
        return;
      }
      const data: MyRequestsResponse = await resp.json();
      const mapped: RequestRow[] = (data?.requests ?? []).map((req) => ({
        id: req.id,
        entityName: req.entity_name || req.entity_id,
        entityType: req.entity_type,
        entityId: req.entity_id,
        permissionLevel: req.permission_level,
        durationDays: req.requested_duration_days,
        status: req.status,
        created_at: req.created_at,
        handled_at: req.handled_at,
        canCancel: req.status === 'pending',
        raw: req,
      }));
      mapped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setRows(mapped);
    } catch (e) {
      console.warn('Failed to fetch access requests:', e);
      setRequestsError(e instanceof Error ? e.message : t('data-asset-reviews:myRequests.loadFailed'));
      setRows([]);
    } finally {
      setRequestsLoading(false);
    }
  }, [t]);

  const loadSubscriptions = useCallback(async () => {
    setSubscriptionsLoading(true);
    setSubscriptionsError(null);
    try {
      const data = await apiGet('/api/data-products/my-subscriptions');
      setSubscriptions(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Failed to fetch subscriptions:', e);
      setSubscriptionsError(e instanceof Error ? e.message : t('data-asset-reviews:myRequests.loadFailed'));
      setSubscriptions([]);
    } finally {
      setSubscriptionsLoading(false);
    }
  }, [apiGet, t]);

  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => { loadSubscriptions(); }, [loadSubscriptions]);

  const handleCancel = async (requestId: string) => {
    try {
      setCancellingId(requestId);
      await apiDelete(`/api/access-grants/requests/${requestId}`);
      toast({ title: t('home:myRequests.cancelSuccess'), variant: 'default' });
      await loadRequests();
    } catch (e) {
      toast({
        title: t('common:toast.error'),
        description: e instanceof Error ? e.message : t('data-asset-reviews:myRequests.cancelError'),
        variant: 'destructive',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const prefix = pathname.split('/').slice(0, 2).join('/');
  const requestsLabel = t('data-asset-reviews:myRequests.accessRequestsTab');
  const subscriptionsLabel = t('data-asset-reviews:myRequests.subscriptionsTab');

  const errorState = (message: string, onRetry: () => void) => (
    <div className={classes.state}>
      <Alert color="red" variant="light" icon={<AlertCircle />} className={classes.alert}>{message}</Alert>
      <Button variant="outline" onClick={onRetry}>{t('common:retry')}</Button>
    </div>
  );

  const emptyState = (icon: ReactNode, message: string) => (
    <div className={classes.empty}>
      {icon}
      <p>{message}</p>
    </div>
  );

  return (
    <PageLayout
      header={
        <>
          <PageHeader title={t('home:myRequests.title')} />
          <p className={classes.subtitle}>{t('home:myRequests.description')}</p>
          <SummaryStats label={t('data-asset-reviews:myRequests.summary')}>
            <SummaryStat
              icon={<ShieldCheck aria-hidden />}
              tone="warning"
              label={t('data-asset-reviews:myRequests.pendingRequests')}
              value={pendingCount}
              loading={requestsLoading}
            />
            <SummaryStat
              icon={<Bell aria-hidden />}
              tone="info"
              label={t('data-asset-reviews:myRequests.totalRequests')}
              value={rows.length}
              loading={requestsLoading}
            />
            <SummaryStat
              icon={<Package aria-hidden />}
              tone="good"
              label={t('data-asset-reviews:myRequests.activeSubscriptions')}
              value={subscriptions.length}
              loading={subscriptionsLoading}
            />
          </SummaryStats>
        </>
      }
    >
      <div className={classes.body}>
        <Tabs value={activeTab} onChange={(v) => v && setActiveTab(v)}>
          <Tabs.List>
            <Tabs.Tab value="requests">
              {requestsLabel}
              {pendingCount > 0 && <Badge variant="secondary" className={classes.tabCount}>{pendingCount}</Badge>}
            </Tabs.Tab>
            <Tabs.Tab value="subscriptions">
              {subscriptionsLabel}
              {subscriptions.length > 0 && (
                <Badge variant="secondary" className={classes.tabCount}>{subscriptions.length}</Badge>
              )}
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="requests">
            <Pane flush aria-label={requestsLabel}>
              {requestsLoading ? (
                <div className={classes.skeleton}>
                  <ListViewSkeleton columns={7} rows={5} toolbarButtons={0} showToolbar={false} showPagination={false} />
                </div>
              ) : requestsError ? (
                errorState(requestsError, loadRequests)
              ) : rows.length === 0 ? (
                emptyState(<Inbox aria-hidden />, t('home:myRequests.empty'))
              ) : (
                <div className={grid.tableWrap}>
                  <table className={`${grid.table} ${classes.grid}`}>
                    <thead>
                      <tr>
                        <th>{t('data-asset-reviews:myRequests.assetType')}</th>
                        <th>{t('common:labels.name')}</th>
                        <th>{t('common:labels.permission')}</th>
                        <th>{t('common:labels.status')}</th>
                        <th>{t('home:myRequests.requestedAt')}</th>
                        <th>{t('home:myRequests.handledAt')}</th>
                        <th className={classes.actions} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const variant = STATUS_VARIANTS[row.status] ?? 'outline';
                        const detailPath = getEntityDetailPath(row.entityType, row.entityId, pathname);
                        return (
                          <tr key={row.id}>
                            <td className={classes.muted}>{entityTypeLabel(row.entityType, t)}</td>
                            <td className={classes.nameCell}>
                              <span className={classes.name}>
                                {detailPath ? (
                                  <Link to={detailPath} className={classes.link}>{row.entityName}</Link>
                                ) : (
                                  <span className={classes.strong}>{row.entityName}</span>
                                )}
                                <span className={classes.detail}>
                                  ({row.permissionLevel}, {row.durationDays}d)
                                </span>
                              </span>
                            </td>
                            <td><Badge variant="outline">{row.permissionLevel}</Badge></td>
                            <td><Badge variant={variant}>{row.status}</Badge></td>
                            <td><RelativeDate date={row.created_at} /></td>
                            <td>
                              {row.handled_at ? <RelativeDate date={row.handled_at} /> : <span className={classes.none}>—</span>}
                            </td>
                            <td className={classes.actions}>
                              {row.canCancel && (
                                <ActionIcon
                                  variant="subtle"
                                  className={classes.cancel}
                                  onClick={() => handleCancel(row.id)}
                                  disabled={cancellingId === row.id}
                                  title={t('common:actions.cancel')}
                                >
                                  {cancellingId === row.id ? <Loader size={12} color="currentColor" /> : <XCircle aria-hidden />}
                                </ActionIcon>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Pane>
          </Tabs.Panel>

          <Tabs.Panel value="subscriptions">
            <Pane flush aria-label={subscriptionsLabel}>
              {subscriptionsLoading ? (
                <div className={classes.skeleton}>
                  <ListViewSkeleton columns={4} rows={4} toolbarButtons={0} showToolbar={false} showPagination={false} />
                </div>
              ) : subscriptionsError ? (
                errorState(subscriptionsError, loadSubscriptions)
              ) : subscriptions.length === 0 ? (
                emptyState(<Package aria-hidden />, t('data-asset-reviews:myRequests.noSubscriptions'))
              ) : (
                <div className={grid.tableWrap}>
                  <table className={`${grid.table} ${classes.grid}`}>
                    <thead>
                      <tr>
                        <th>{t('data-asset-reviews:myRequests.product')}</th>
                        <th>{t('common:labels.domain')}</th>
                        <th>{t('common:labels.status')}</th>
                        <th>{t('common:labels.version')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subscriptions.map((product) => (
                        <tr key={product.id}>
                          <td className={classes.nameCell}>
                            <span className={classes.name}>
                              <Link to={`${prefix}/my-products/${product.id}`} className={classes.link}>
                                {product.name ?? product.id}
                              </Link>
                            </span>
                          </td>
                          <td className={classes.muted}>{product.domain ?? '—'}</td>
                          <td>
                            <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>{product.status}</Badge>
                          </td>
                          <td className={classes.muted}>{product.version ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Pane>
          </Tabs.Panel>
        </Tabs>
      </div>
    </PageLayout>
  );
}
