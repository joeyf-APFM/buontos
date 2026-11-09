import { Outlet, Navigate } from 'react-router-dom';
import usePermissionsStore, { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';
import { Loader2 } from 'lucide-react';

// The Settings menu lives in the app shell (mantine/shell/nav-config.ts,
// group Settings); this layout only gates the area and renders the page.
export default function SettingsLayout() {
  const { isLoading: permissionsLoading, hasPermission } = usePermissions();
  // Read internal init flags directly (the hook only exposes the public API).
  // We need to distinguish "store not yet initialized" from "initialized and
  // user genuinely lacks access" — otherwise we'd redirect on first mount
  // before the permissions fetch has even started.
  const initAttempted = usePermissionsStore((s) => s._initAttempted);
  const isInitializing = usePermissionsStore((s) => s._isInitializing);

  if (permissionsLoading || isInitializing || !initAttempted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Layout gate: users below Read-only on `settings` cannot enter the
  // Settings area at all. Redirect home rather than render pages
  // they cannot use.
  if (!hasPermission('settings', FeatureAccessLevel.READ_ONLY)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex gap-8 min-h-[calc(100vh-12rem)]">
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
