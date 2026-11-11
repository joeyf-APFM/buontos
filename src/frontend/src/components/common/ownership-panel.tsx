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
import { useState, useEffect, useCallback, useId, useRef } from 'react';
import { ActionIcon, Collapse } from '@mantine/core';
import { Users2, History, UserPlus, Loader2, Trash2, ChevronDown, ChevronRight, Import, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RelativeDate } from '@/components/common/relative-date';
import { AssignOwnerDialog } from '@/components/common/assign-owner-dialog';
import { Dialog } from '@/mantine/page';
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
  /**
   * For a page-kit Pane: no border, background or padding of the panel's own,
   * and a compact head (the title and actions). Put it in a Pane without a
   * title, which the panel's head would repeat.
   */
  flush?: boolean;
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
  flush = false,
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
  const importedId = useId();
  // Copy from Team gives focus back here, unless the Assign dialog it opened has it
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  // Assign Owner gives focus back to its header button, also when Copy from
  // Team opened it (that dialog's Assign button is gone by then)
  const assignButtonRef = useRef<HTMLButtonElement>(null);
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

  const closeRemove = () => {
    setRemoveTarget(null);
    setRemoveReason('');
  };

  const hasImportedContacts = importedContacts && importedContacts.length > 0;

  return (
    <>
      <section className={cn(classes.pane, className)} aria-labelledby={titleId} data-flush={flush || undefined}>
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
                ref={copyButtonRef}
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
              <Button ref={assignButtonRef} variant="outline" size="sm" onClick={() => setAssignDialogOpen(true)}>
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
                      <div key={owner.id}>
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
                      </div>
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
                      <div key={owner.id}>
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
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </>
          )}

          {/* Imported Contacts (from ODCS/ODPS) - read-only, collapsible */}
          {hasImportedContacts && (
            <div>
              <div className={classes.spread}>
                <button
                  type="button"
                  className={cn(classes.disclosure, classes.sectionLabel)}
                  aria-expanded={importedOpen}
                  aria-controls={importedId}
                  onClick={() => setImportedOpen((open) => !open)}
                >
                  {importedOpen ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                  {importedContactsLabel ?? t('common:ownership.importedContacts')} ({importedContacts!.length})
                </button>
                {canAssign && onImportAsOwners && (
                  <Button variant="outline" size="sm" onClick={() => onImportAsOwners(importedContacts!)}>
                    <Import />
                    {t('common:ownership.importAsOwners')}
                  </Button>
                )}
              </div>
              {/* No animation: it opened at once on Radix's Collapsible */}
              <Collapse in={importedOpen} id={importedId} transitionDuration={0}>
                <dl className={classes.kv}>
                  {importedContacts!.map((contact, idx) => (
                    <div key={idx}>
                      <dt>{contact.role || t('common:ownership.memberRole')}</dt>
                      <dd>
                        <span className={cn(classes.grow, classes.strong)}>
                          {contact.name || contact.username || contact.email || t('common:states.unknown')}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </Collapse>
            </div>
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
        returnFocusTo={assignButtonRef}
      />

      {/* Remove Owner Confirmation Dialog */}
      <Dialog
        opened={!!removeTarget}
        onClose={closeRemove}
        size="sm"
        role="alertdialog"
        title={t('removeDialog.title')}
        description={t('removeDialog.description')}
        footer={
          <>
            <Button variant="outline" onClick={closeRemove} disabled={isRemoving}>
              {t('removeDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isRemoving}>
              {isRemoving && <Loader2 className={classes.spin} />}
              {t('removeDialog.remove')}
            </Button>
          </>
        }
      >
        <div className={classes.field}>
          <Label htmlFor="remove-reason">{t('removeDialog.reasonLabel')}</Label>
          <Input
            id="remove-reason"
            placeholder={t('removeDialog.reasonPlaceholder')}
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
          />
        </div>
      </Dialog>

      {/* Copy from Team Dialog */}
      <Dialog
        opened={copyFromTeamOpen}
        onClose={() => setCopyFromTeamOpen(false)}
        returnFocusTo={copyButtonRef}
        title={`${t('common:ownership.copyFromTeam')}${ownerTeamName ? `: ${ownerTeamName}` : ''}`}
        description={t('common:ownership.copyFromTeamDescription')}
        footer={
          <Button variant="outline" onClick={() => setCopyFromTeamOpen(false)}>
            {t('common:actions.close')}
          </Button>
        }
      >
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
      </Dialog>
    </>
  );
}
