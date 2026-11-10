import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import usePermissionsStore, { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import { SettingsFormSkeleton } from '@/components/common/list-view-skeleton';
import classes from './settings-page-wrapper.module.css';

interface SettingsPageWrapperProps {
  title: string;
  /**
   * Per-sub-page permission ID (e.g. `settings-general`, `settings-git`).
   * Access is granted only if the user holds at least `Read-only` on BOTH
   * the parent `settings` feature (the layout gate) AND this specific
   * sub-page permission.
   */
  permissionId: string;
  /**
   * The page is in FULL_BLEED_ROUTES (mantine/shell/full-bleed.ts), so the
   * layout draws no padding: the loading and access-denied states then get
   * the page surface and a margin of their own. Off by default; the page
   * itself draws both once it renders.
   */
  fullBleed?: boolean;
  children: React.ReactNode;
}

/**
 * Shared wrapper for standalone settings pages.
 * Handles permission check, loading state, and the page's title for the
 * shell's breadcrumb.
 */
export default function SettingsPageWrapper({ title, permissionId, fullBleed = false, children }: SettingsPageWrapperProps) {
  const { t } = useTranslation(['settings', 'common']);
  const { isLoading: permissionsLoading, hasPermission } = usePermissions();
  // Distinguish "store not yet initialized" from "user lacks access" — without
  // this guard we'd flash the Access Denied panel on first mount before the
  // permissions fetch has even started.
  const initAttempted = usePermissionsStore((s) => s._initAttempted);
  const isInitializing = usePermissionsStore((s) => s._isInitializing);
  const setStaticSegments = useBreadcrumbStore((state) => state.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((state) => state.setDynamicTitle);

  const hasLayoutAccess = hasPermission('settings', FeatureAccessLevel.READ_ONLY);
  const hasPageAccess = hasPermission(permissionId, FeatureAccessLevel.READ_ONLY);
  const hasSettingsAccess = hasLayoutAccess && hasPageAccess;

  useEffect(() => {
    setStaticSegments([]);
    setDynamicTitle(title);
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [title, setStaticSegments, setDynamicTitle]);

  // On a full-bleed page, a state the wrapper draws instead of the page
  const frame = (state: React.ReactNode) =>
    fullBleed ? (
      <div className={classes.state} data-settings-state="">
        <div className={classes.stateBody}>{state}</div>
      </div>
    ) : (
      state
    );

  if (permissionsLoading || isInitializing || !initAttempted) {
    // Render a generic settings form skeleton while permissions resolve.
    // Individual settings pages render their own content-shaped skeletons
    // afterwards if they have additional async loads.
    return frame(<SettingsFormSkeleton sections={2} fieldsPerSection={3} />);
  }

  if (!hasSettingsAccess) {
    return frame(
      <div className={classes.denied}>
        <Alert variant="destructive" className={classes.alert}>
          <ShieldX size={16} />
          <AlertTitle className={classes.title}>
            {t('settings:accessDenied.title', 'Access Denied')}
          </AlertTitle>
          <AlertDescription className={classes.description}>
            <p>
              {t('settings:accessDenied.message', 'You do not have permission to access this page. This page is restricted to users with administrative privileges.')}
            </p>
            <p>
              {t('settings:accessDenied.action', 'If you believe you should have access, please contact your administrator or ')}
              <Link to="/" className={classes.link}>
                {t('settings:accessDenied.returnHome', 'return to the home page')}
              </Link>
              {t('settings:accessDenied.requestRole', ' to request an appropriate role.')}
            </p>
          </AlertDescription>
        </Alert>
      </div>,
    );
  }

  return <>{children}</>;
}
