import { useState, useEffect, useCallback, useId } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Collapse, Table, Tooltip } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PanelSkeleton } from '@/components/common/list-view-skeleton';
import { badgeToneStyle, type StatusTone } from '@/components/common/aura-status';
import { Dialog, Pane } from '@/mantine/page';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { RelativeDate } from '@/components/common/relative-date';
import HandleAccessGrantDialog from './handle-access-grant-dialog';
import {
  Clock,
  Users,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import classes from './access-grants-panel.module.css';

interface AccessGrant {
  id: string;
  grantee_email: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  permission_level: string;
  granted_at: string;
  expires_at: string;
  granted_by?: string;
  status: string;
  days_until_expiry?: number;
  is_active: boolean;
}

interface AccessGrantRequest {
  id: string;
  requester_email: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  requested_duration_days: number;
  permission_level: string;
  reason?: string;
  status: string;
  created_at: string;
}

interface AccessGrantSummary {
  active_grants_count: number;
  pending_requests_count: number;
  expiring_soon_count: number;
  total_grants_count: number;
}

interface AccessGrantsPanelProps {
  entityType: string;
  entityId: string;
  canManage?: boolean;
  showPendingRequests?: boolean;
  compact?: boolean;
}

const PERMISSION_BADGES: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string }> = {
  READ: { variant: 'secondary', label: 'Read' },
  WRITE: { variant: 'default', label: 'Write' },
  MANAGE: { variant: 'outline', label: 'Manage' },
};

const STATUS_BADGES: Record<string, { tone: StatusTone; label: string }> = {
  active: { tone: 'good', label: 'Active' },
  expired: { tone: 'neutral', label: 'Expired' },
  revoked: { tone: 'critical', label: 'Revoked' },
  pending: { tone: 'warning', label: 'Pending' },
};

export default function AccessGrantsPanel({
  entityType,
  entityId,
  canManage = false,
  showPendingRequests = true,
  compact = false,
}: AccessGrantsPanelProps) {
  const { get, post } = useApi();
  const { toast } = useToast();
  const { t } = useTranslation(['access-grants', 'common']);

  const [grants, setGrants] = useState<AccessGrant[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AccessGrantRequest[]>([]);
  const [summary, setSummary] = useState<AccessGrantSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [grantToRevoke, setGrantToRevoke] = useState<AccessGrant | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [handleRequestDialogOpen, setHandleRequestDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessGrantRequest | null>(null);
  const bodyId = useId();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [grantsRes, summaryRes] = await Promise.all([
        get<{ grants: AccessGrant[]; total: number }>(
          `/api/access-grants/entity/${entityType}/${entityId}?include_inactive=false`
        ),
        get<AccessGrantSummary>(`/api/access-grants/entity/${entityType}/${entityId}/summary`),
      ]);

      if (grantsRes.data) {
        setGrants(grantsRes.data.grants || []);
      }
      if (summaryRes.data) {
        setSummary(summaryRes.data);
      }

      // Fetch pending requests if needed
      if (showPendingRequests && canManage) {
        const requestsRes = await get<{ requests: AccessGrantRequest[]; total: number }>(
          `/api/access-grants/entity/${entityType}/${entityId}/requests`
        );
        if (requestsRes.data) {
          setPendingRequests(requestsRes.data.requests || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch access grants:', err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, showPendingRequests, canManage, get]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRevoke = async () => {
    if (!grantToRevoke) return;

    setRevoking(true);
    try {
      const res = await post(`/api/access-grants/${grantToRevoke.id}/revoke`, {});
      if (res.error) {
        throw new Error(res.error);
      }

      toast({
        title: t('access-grants:panel.revokedTitle', 'Access Revoked'),
        description: t('access-grants:panel.revokedDescription', {
          user: grantToRevoke.grantee_email,
          defaultValue: 'Access for {{user}} has been revoked.',
        }),
      });

      setRevokeDialogOpen(false);
      setGrantToRevoke(null);
      fetchData();
    } catch (e: any) {
      toast({
        title: t('common:toast.error', 'Error'),
        description: e.message || t('access-grants:panel.revokeError', 'Failed to revoke access'),
        variant: 'destructive',
      });
    } finally {
      setRevoking(false);
    }
  };

  const openRevokeDialog = (grant: AccessGrant) => {
    setGrantToRevoke(grant);
    setRevokeDialogOpen(true);
  };

  const openHandleRequestDialog = (request: AccessGrantRequest) => {
    setSelectedRequest(request);
    setHandleRequestDialogOpen(true);
  };

  const formatDaysUntilExpiry = (days?: number): string => {
    if (days === undefined || days === null) return t('access-grants:panel.expiry.unknown', 'Unknown');
    if (days < 0) return t('access-grants:panel.expiry.expired', 'Expired');
    if (days === 0) return t('access-grants:panel.expiry.today', 'Today');
    if (days < 7) return t('access-grants:panel.expiry.days', { count: days });
    if (days < 30) return t('access-grants:panel.expiry.weeks', { count: Math.floor(days / 7) });
    return t('access-grants:panel.expiry.months', { count: Math.floor(days / 30) });
  };

  const expiryTone = (days?: number): StatusTone => {
    if (days === undefined || days === null || days < 0) return 'critical';
    if (days <= 7) return 'warning';
    return 'good';
  };

  const hasContent = grants.length > 0 || pendingRequests.length > 0;
  const totalCount = (summary?.active_grants_count || 0) + (summary?.pending_requests_count || 0);
  const title = t('access-grants:panel.title', 'Access Grants');

  return (
    <Pane
      title={title}
      actions={
        <>
          {totalCount > 0 && <Badge variant="secondary">{totalCount}</Badge>}
          {summary && summary.expiring_soon_count > 0 && (
            <Tooltip
              withinPortal
              label={t('access-grants:panel.expiringSoonTooltip', { count: summary.expiring_soon_count })}
            >
              <Badge variant="outline" className={classes.badge} style={badgeToneStyle('warning')}>
                <AlertTriangle className={classes.mark} aria-hidden />
                {t('access-grants:panel.expiringBadge', {
                  count: summary.expiring_soon_count,
                  defaultValue: '{{count}} expiring',
                })}
              </Badge>
            </Tooltip>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={classes.iconButton}
            aria-label={t('access-grants:panel.refresh', 'Refresh')}
            onClick={() => fetchData()}
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={classes.iconButton}
            aria-label={title}
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </>
      }
    >
      <p className={classes.lead}>
        {t('access-grants:panel.description', 'Users with time-limited access to this resource')}
      </p>

      <Collapse in={expanded} id={bodyId} transitionDuration={0}>
        {loading ? (
          <PanelSkeleton rows={2} rowHeight="h-10" />
        ) : (
          <div className={classes.sections}>
            {/* Pending Requests Section */}
            {showPendingRequests && canManage && pendingRequests.length > 0 && (
              <div className={classes.section}>
                <div className={classes.sectionTitle} data-tone="warning">
                  <Clock aria-hidden />
                  {t('access-grants:panel.pendingRequestsCount', { count: pendingRequests.length })}
                </div>
                <Table className={classes.table} withRowBorders={false}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('access-grants:panel.columns.requester', 'Requester')}</Table.Th>
                      <Table.Th>{t('common:labels.permission', 'Permission')}</Table.Th>
                      <Table.Th>{t('access-grants:panel.columns.duration', 'Duration')}</Table.Th>
                      <Table.Th>{t('access-grants:panel.requestedAt', 'Requested')}</Table.Th>
                      <Table.Th className={classes.end}>{t('access-grants:panel.columns.actions', 'Actions')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pendingRequests.map((request) => (
                      <Table.Tr key={request.id}>
                        <Table.Td className={classes.person}>{request.requester_email}</Table.Td>
                        <Table.Td>
                          <Badge variant={PERMISSION_BADGES[request.permission_level]?.variant || 'secondary'}>
                            {t(`access-grants:permissionLevels.${request.permission_level}`, PERMISSION_BADGES[request.permission_level]?.label || request.permission_level)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{t('access-grants:panel.durationDays', { count: request.requested_duration_days })}</Table.Td>
                        <Table.Td>
                          <RelativeDate date={request.created_at} />
                        </Table.Td>
                        <Table.Td className={classes.end}>
                          <Button variant="outline" size="sm" onClick={() => openHandleRequestDialog(request)}>
                            {t('access-grants:panel.review', 'Review')}
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            )}

            {/* Active Grants Section */}
            {grants.length > 0 ? (
              <div className={classes.section}>
                {pendingRequests.length > 0 && (
                  <div className={classes.sectionTitle} data-tone="good">
                    <Users aria-hidden />
                    {t('access-grants:panel.activeGrantsCount', { count: grants.length })}
                  </div>
                )}
                <Table className={classes.table} withRowBorders={false}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{t('access-grants:panel.columns.user', 'User')}</Table.Th>
                      <Table.Th>{t('common:labels.permission', 'Permission')}</Table.Th>
                      <Table.Th>{t('access-grants:panel.columns.expires', 'Expires')}</Table.Th>
                      <Table.Th>{t('access-grants:panel.columns.grantedBy', 'Granted By')}</Table.Th>
                      <Table.Th>{t('common:labels.status', 'Status')}</Table.Th>
                      {canManage && <Table.Th className={classes.end}>{t('access-grants:panel.columns.actions', 'Actions')}</Table.Th>}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {grants.map((grant) => (
                      <Table.Tr key={grant.id}>
                        <Table.Td className={classes.person}>{grant.grantee_email}</Table.Td>
                        <Table.Td>
                          <Badge variant={PERMISSION_BADGES[grant.permission_level]?.variant || 'secondary'}>
                            {t(`access-grants:permissionLevels.${grant.permission_level}`, PERMISSION_BADGES[grant.permission_level]?.label || grant.permission_level)}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Tooltip
                            withinPortal
                            label={t('access-grants:panel.expiresTooltip', { date: new Date(grant.expires_at).toLocaleString() })}
                          >
                            <Badge variant="outline" style={badgeToneStyle(expiryTone(grant.days_until_expiry))}>
                              {formatDaysUntilExpiry(grant.days_until_expiry)}
                            </Badge>
                          </Tooltip>
                        </Table.Td>
                        <Table.Td className={classes.muted}>{grant.granted_by || '-'}</Table.Td>
                        <Table.Td>
                          <Badge
                            variant="outline"
                            style={STATUS_BADGES[grant.status] ? badgeToneStyle(STATUS_BADGES[grant.status].tone) : undefined}
                          >
                            {t(`access-grants:statuses.${grant.status}`, STATUS_BADGES[grant.status]?.label || grant.status)}
                          </Badge>
                        </Table.Td>
                        {canManage && (
                          <Table.Td className={classes.end}>
                            {grant.is_active && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`${classes.iconButton} ${classes.danger}`}
                                aria-label={t('access-grants:panel.revoke', 'Revoke')}
                                onClick={() => openRevokeDialog(grant)}
                              >
                                <XCircle />
                              </Button>
                            )}
                          </Table.Td>
                        )}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </div>
            ) : !hasContent ? (
              <div className={classes.empty}>
                <Users className={classes.emptyIcon} aria-hidden />
                <p>{t('access-grants:panel.noGrants', 'No access grants for this resource')}</p>
                <p className={classes.muted}>
                  {t('access-grants:panel.noGrantsHint', 'Users can request time-limited access using the "Request Access" button.')}
                </p>
              </div>
            ) : null}
          </div>
        )}
      </Collapse>

      {/* Revoke Confirmation Dialog */}
      <Dialog
        opened={revokeDialogOpen}
        onClose={() => setRevokeDialogOpen(false)}
        role="alertdialog"
        size="sm"
        title={t('access-grants:panel.revokeTitle', 'Revoke Access')}
        description={
          <Trans
            i18nKey="access-grants:panel.revokeConfirmDetailed"
            values={{ user: grantToRevoke?.grantee_email }}
            components={{ bold: <strong /> }}
          />
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)} disabled={revoking}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking && <Loader2 className={classes.spin} />}
              {t('access-grants:panel.revokeTitle', 'Revoke Access')}
            </Button>
          </>
        }
      />

      {/* Handle Request Dialog */}
      {selectedRequest && (
        <HandleAccessGrantDialog
          isOpen={handleRequestDialogOpen}
          onOpenChange={setHandleRequestDialogOpen}
          request={selectedRequest}
          onDecisionMade={() => {
            fetchData();
            setSelectedRequest(null);
          }}
        />
      )}
    </Pane>
  );
}
