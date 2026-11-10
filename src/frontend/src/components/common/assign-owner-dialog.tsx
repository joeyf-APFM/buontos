/**
 * Dialog for assigning a business owner to an object.
 * Used internally by OwnershipPanel.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/mantine/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { PrincipalPicker } from '@/components/common/principal-picker';
import type { OwnerObjectType } from '@/types/business-owner';
import type { BusinessRoleRead } from '@/types/business-role';
import classes from './panel.module.css';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AssignOwnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectType: OwnerObjectType;
  objectId: string;
  onSuccess: () => void;
  initialEmail?: string;
  initialName?: string;
}

export function AssignOwnerDialog({ open, onOpenChange, objectType, objectId, onSuccess, initialEmail, initialName }: AssignOwnerDialogProps) {
  const { t } = useTranslation('common');
  const { get: apiGet, post: apiPost } = useApi();
  const { toast } = useToast();

  const [roles, setRoles] = useState<BusinessRoleRead[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [noRolesError, setNoRolesError] = useState(false);

  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [defaultRoleId, setDefaultRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (open && roles.length === 0) {
      apiGet<BusinessRoleRead[]>('/api/business-roles')
        .then((res) => {
          if (res.data && Array.isArray(res.data)) {
            const active = res.data.filter((r) => r.status === 'active');
            setRoles(active);
            if (active.length === 0) {
              setNoRolesError(true);
            } else {
              // Prefer a role named "Business Owner", else use the first active role
              const boRole = active.find((r) => r.name.toLowerCase() === 'business owner');
              setDefaultRoleId(boRole ? boRole.id : active[0].id);
              setNoRolesError(false);
            }
          }
        });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open) {
      if (initialEmail) setUserEmail(initialEmail);
      if (initialName) setUserName(initialName);
    } else {
      setUserEmail('');
      setUserName('');
      setDefaultRoleId(null);
      setNoRolesError(false);
    }
  }, [open, initialEmail, initialName]);

  const handleSubmit = async () => {
    if (!userEmail.trim() || !defaultRoleId) return;
    setSubmitting(true);
    try {
      const res = await apiPost('/api/business-owners', {
        object_type: objectType,
        object_id: objectId,
        user_email: userEmail.trim(),
        user_name: userName.trim() || null,
        role_id: defaultRoleId,
      });
      if (res.error) throw new Error(res.error);
      toast({ title: t('common:assignOwner.title'), description: t('common:assignOwner.assignedSuccess') });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('common:assignOwner.errorAssigning'), description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = userEmail.trim().length > 0 && !noRolesError && defaultRoleId != null;

  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      size="sm"
      title={t('common:assignOwner.title')}
      description={t('assignDialog.description', { defaultValue: 'Assign a business owner.' })}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting && <Loader2 className={classes.spin} />}
            {t('common:assignOwner.title')}
          </Button>
        </>
      }
    >
      <div className={classes.form}>
        {noRolesError && (
          <Alert variant="destructive">
            <AlertCircle size={16} />
            <AlertDescription>
              {t('assignDialog.noRolesError', { defaultValue: 'No business roles configured; ask an admin.' })}
            </AlertDescription>
          </Alert>
        )}
        <div className={classes.field}>
          <Label htmlFor="owner-email">{t('common:assignOwner.emailLabel')} *</Label>
          <PrincipalPicker
            id="owner-email"
            accepts={['user']}
            value={userEmail || null}
            onChange={(next) => setUserEmail(next ?? '')}
            placeholder={t('common:assignOwner.emailPlaceholder')}
            aria-label={t('common:assignOwner.ownerUserAria')}
          />
        </div>

        <div className={classes.field}>
          <Label htmlFor="owner-name">{t('common:assignOwner.nameLabel')}</Label>
          <Input
            id="owner-name"
            placeholder={t('common:assignOwner.namePlaceholder')}
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
