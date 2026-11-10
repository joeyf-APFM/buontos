/**
 * Reusable ownership panel for embedding in detail pages.
 * Shows current and (optionally) previous owners for any object type.
 * Optionally shows imported ODCS/ODPS contacts as read-only provenance.
 * Self-contained: manages assign and remove dialogs internally.
 *
 * Usage:
 *   <OwnershipPanel objectType="data_product" objectId={product.id} canAssign />
 *   <OwnershipPanel
 *     objectType="data_contract" objectId={contract.id} canAssign
 *     importedContacts={contract.team}
 *     importedContactsLabel="Imported Contacts"
 *   />
 */
import { Fragment, useState, useEffect, useCallback, useId } from 'react';
import { ActionIcon } from '@mantine/core';
import { Users2, History, UserPlus, Loader2, Trash2, ChevronDown, ChevronRight, Import, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RelativeDate } from '@/components/common/relative-date';
import { AssignOwnerDialog } from '@/components/common/assign-owner-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { BusinessOwnerRead, OwnerObjectType } from '@/types/business-owner';
import classes from './panel.module.css';

export interface ImportedContact {
  username?: string;
  name?: string;
  email?: string;
  role?: string;
  description?: string;
  dateIn?: string;
  dateOut?: string;
}

interface OwnershipPanelProps {
  objectType: OwnerObjectType;
  objectId: string;
  /** If true the "Assign Owner" button and per-row remove buttons are shown. */
  canAssign?: boolean;
  /** Optional CSS class name */
  className?: string;
  /** Imported ODCS/ODPS team contacts to display as read-only provenance */
  importedContacts?: ImportedContact[];
  /** Label for the imported contacts section */
  importedContactsLabel?: string;
  /** Callback when user clicks "Import as Owners" on the imported contacts */
  onImportAsOwners?: (contacts: ImportedContact[]) => void;
  /** Ontos Team ID for "Copy from Team" functionality */
  ownerTeamId?: string;
  /** Ontos Team name for display */
  ownerTeamName?: string;
}

export function OwnershipPanel({
  objectType,
  objectId,
  canAssign = false,
  className,
  importedContacts,
  importedContactsLabel,
  onImportAsOwners,
  ownerTeamId,
  ownerTeamName,
}: OwnershipPanelProps) {
  const [currentOwners, setCurrentOwners] = useState<BusinessOwnerRead[]>([]);
  const [previousOwners, setPreviousOwners] = useState<BusinessOwnerRead[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [importedOpen, setImportedOpen] = useState(false);

  // Assign dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [pendingMember, setPendingMember] = useState<{ member_identifier: string; member_name?: string } | null>(null);

  // Copy from Team dialog state
  const [copyFromTeamOpen, setCopyFromTeamOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; member_identifier: string; member_type: string; member_name?: string }>>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);

  // Remove dialog state
  const [removeTarget, setRemoveTarget] = useState<BusinessOwnerRead | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);

  const { t } = useTranslation(['business-owners', 'common']);
  const titleId = useId();
  const { get: apiGet, post: apiPost } = useApi();
  const { toast } = useToast();

  const fetchOwners = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiGet<BusinessOwnerRead[]>(
        `/api/business-owners/by-object/${objectType}?object_id=${encodeURIComponent(objectId)}&active_only=false`
      );
      if (response.error) throw new Error(response.error);
      const all = Array.isArray(response.data) ? response.data : [];
      setCurrentOwners(all.filter((o) => o.is_active));
      setPreviousOwners(all.filter((o) => !o.is_active));
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('messages.errorFetching'), description: err.message });
      setCurrentOwners([]);
      setPreviousOwners([]);
    } finally {
      setIsLoading(false);
    }
  }, [objectType, objectId, apiGet, toast, t]);

  useEffect(() => {
    if (objectId) fetchOwners();
  }, [objectId, fetchOwners]);

  useEffect(() => {
    if (!copyFromTeamOpen || !ownerTeamId) return;
    (async () => {
      setTeamMembersLoading(true);
      try {
        const res = await apiGet<Array<{ id: string; member_identifier: string; member_type: string; member_name?: string }>>(
          `/api/teams/${ownerTeamId}/members`
        );
        if (!res.error && Array.isArray(res.data)) {
          setTeamMembers(res.data);
        }
      } catch { /* best effort */ }
      finally { setTeamMembersLoading(false); }
    })();
  }, [copyFromTeamOpen, ownerTeamId, apiGet]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      const res = await apiPost(`/api/business-owners/${removeTarget.id}/remove`, {
        removal_reason: removeReason.trim() || null,
      });
      if (res.error) throw new Error(res.error);
      toast({ title: t('messages.removed'), description: t('messages.removedSuccess') });
      setRemoveTarget(null);
      setRemoveReason('');
      fetchOwners();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('messages.errorRemoving'), description: err.message });
    } finally {
      setIsRemoving(false);
    }
  };

  const hasImportedContacts = importedContacts && importedContacts.length > 0;

  return (
    <>
      <section className={cn(classes.pane, className)} aria-labelledby={titleId}>
        <div className={classes.head}>
          <h3 id={titleId} className={classes.title}>
            <Users2 aria-hidden />
            {t('panel.title')}
          </h3>
          <div className={classes.actions}>
            {previousOwners.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
                <History />
                {t('panel.history')}
              </Button>
            )}
            {canAssign && ownerTeamId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCopyFromTeamOpen(true)}
                title={ownerTeamName ? t('common:ownership.copyMembersFrom', { name: ownerTeamName }) : t('common:ownership.copyFromAssignedTeam')}
              >
                <Copy />
                {t('common:ownership.copyFromTeam')}
              </Button>
            )}
            {canAssign && (
              <Button variant="outline" size="sm" onClick={() => setAssignDialogOpen(true)}>
                <UserPlus />
                {t('panel.assignOwner')}
              </Button>
            )}
          </div>
        </div>
        <div className={classes.body}>
          {isLoading ? (
            <div className={classes.loading}>
              <Loader2 className={classes.spin} />
            </div>
          ) : currentOwners.length === 0 && previousOwners.length === 0 ? (
            <p className={classes.empty}>{t('panel.noOwners')}</p>
          ) : (
            <>
              {/* Current owners: the role in the label column */}
              {currentOwners.length > 0 && (
                <>
                  <p className={classes.sectionLabel}>{t('panel.currentOwners')}</p>
                  <dl className={classes.kv}>
                    {currentOwners.map((owner) => (
                      <Fragment key={owner.id}>
                        <dt>{owner.role_name || '—'}</dt>
                        <dd>
                          <span className={cn(classes.grow, classes.strong)}>{owner.user_name || owner.user_email}</span>
                          <RelativeDate date={owner.assigned_at} className={classes.muted} />
                          {canAssign && (
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size={24}
                              className={classes.remove}
                              onClick={() => setRemoveTarget(owner)}
                            >
                              <Trash2 size={14} />
                            </ActionIcon>
                          )}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                </>
              )}

              {/* Previous owners, shown with History */}
              {showHistory && previousOwners.length > 0 && (
                <>
                  <p className={classes.sectionLabel}>{t('panel.previousOwners')}</p>
                  <dl className={cn(classes.kv, classes.dimmed)}>
                    {previousOwners.map((owner) => (
                      <Fragment key={owner.id}>
                        <dt>{owner.role_name || '—'}</dt>
                        <dd>
                          <span className={classes.grow}>{owner.user_name || owner.user_email}</span>
                          {owner.removal_reason && (
                            <span className={cn(classes.muted, classes.italic)}>{owner.removal_reason}</span>
                          )}
                          {owner.removed_at && (
                            <RelativeDate date={owner.removed_at} className={classes.muted} />
                          )}
                        </dd>
                      </Fragment>
                    ))}
                  </dl>
                </>
              )}
            </>
          )}

          {/* Imported Contacts (from ODCS/ODPS) - read-only, collapsible */}
          {hasImportedContacts && (
            <Collapsible open={importedOpen} onOpenChange={setImportedOpen}>
              <div className={classes.spread}>
                <CollapsibleTrigger asChild>
                  <button type="button" className={cn(classes.disclosure, classes.sectionLabel)}>
                    {importedOpen ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                    {importedContactsLabel ?? t('common:ownership.importedContacts')} ({importedContacts!.length})
                  </button>
                </CollapsibleTrigger>
                {canAssign && onImportAsOwners && (
                  <Button variant="outline" size="sm" onClick={() => onImportAsOwners(importedContacts!)}>
                    <Import />
                    {t('common:ownership.importAsOwners')}
                  </Button>
                )}
              </div>
              <CollapsibleContent>
                <dl className={classes.kv}>
                  {importedContacts!.map((contact, idx) => (
                    <Fragment key={idx}>
                      <dt>{contact.role || t('common:ownership.memberRole')}</dt>
                      <dd>
                        <span className={cn(classes.grow, classes.strong)}>
                          {contact.name || contact.username || contact.email || t('common:states.unknown')}
                        </span>
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </section>

      {/* Assign Owner Dialog */}
      <AssignOwnerDialog
        open={assignDialogOpen}
        onOpenChange={(open) => { setAssignDialogOpen(open); if (!open) setPendingMember(null); }}
        objectType={objectType}
        objectId={objectId}
        onSuccess={fetchOwners}
        initialEmail={pendingMember?.member_identifier}
        initialName={pendingMember?.member_name ?? ''}
      />

      {/* Remove Owner Confirmation Dialog */}
      <Dialog open={!!removeTarget} onOpenChange={(open) => { if (!open) { setRemoveTarget(null); setRemoveReason(''); } }}>
        <DialogContent style={{ maxWidth: 400 }}>
          <DialogHeader>
            <DialogTitle>{t('removeDialog.title')}</DialogTitle>
            <DialogDescription>{t('removeDialog.description')}</DialogDescription>
          </DialogHeader>
          <div className={classes.field}>
            <Label htmlFor="remove-reason">{t('removeDialog.reasonLabel')}</Label>
            <Input
              id="remove-reason"
              placeholder={t('removeDialog.reasonPlaceholder')}
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemoveTarget(null); setRemoveReason(''); }} disabled={isRemoving}>
              {t('removeDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving && <Loader2 className={classes.spin} />}
              {t('removeDialog.remove')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy from Team Dialog */}
      <Dialog open={copyFromTeamOpen} onOpenChange={setCopyFromTeamOpen}>
        <DialogContent style={{ maxWidth: 500 }}>
          <DialogHeader>
            <DialogTitle>{t('common:ownership.copyFromTeam')}{ownerTeamName ? `: ${ownerTeamName}` : ''}</DialogTitle>
            <DialogDescription>
              {t('common:ownership.copyFromTeamDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className={classes.scroll}>
            {teamMembersLoading ? (
              <div className={classes.loading}>
                <Loader2 className={classes.spin} />
              </div>
            ) : teamMembers.length === 0 ? (
              <p className={cn(classes.empty, classes.center)}>{t('common:ownership.noTeamMembers')}</p>
            ) : (
              <div className={classes.rows}>
                {teamMembers.map((member) => {
                  const alreadyOwner = currentOwners.some(
                    (o) => o.user_email.toLowerCase() === member.member_identifier.toLowerCase()
                  );
                  return (
                    <div key={member.id} className={classes.row}>
                      <div className={classes.rowMain}>
                        <Badge variant="outline">{member.member_type}</Badge>
                        <span className={classes.grow}>{member.member_name || member.member_identifier}</span>
                      </div>
                      {alreadyOwner ? (
                        <Badge variant="secondary">{t('common:ownership.alreadyOwner')}</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPendingMember(member);
                            setCopyFromTeamOpen(false);
                            setAssignDialogOpen(true);
                          }}
                        >
                          <UserPlus />
                          {t('common:actions.assign')}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyFromTeamOpen(false)}>
              {t('common:actions.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
