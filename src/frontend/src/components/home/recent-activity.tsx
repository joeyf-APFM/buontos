import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { ListItemSkeleton } from '@/components/common/list-view-skeleton';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/settings';

interface Entry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  username?: string | null;
  timestamp?: string | null;
}

interface RecentActivityProps {
  limit?: number;
}

/** The change log's entity types come as `data_product` or `DataProduct`; one key for both. */
const entityKey = (entityType?: string | null) =>
  String(entityType ?? '').split(':')[0].replace(/[_\s-]/g, '').toLowerCase();

/** The page for an entity, or null when it has none. */
export function entityPath(entityType?: string | null, entityId?: string | null): string | null {
  if (!entityId) return null;
  switch (entityKey(entityType)) {
    case 'dataproduct':
      return `/data-products/${entityId}`;
    case 'datacontract':
      return `/data-contracts/${entityId}`;
    case 'datadomain':
      return `/settings/data-domains/${entityId}`;
    default:
      return null;
  }
}

/** `MATURITY_CHANGED` or `DataProduct` as "Maturity changed" or "Data product". */
export function humanize(raw: string): string {
  const spaced = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The lists the entities' names come from, by entity key; others show their type only. */
const NAME_SOURCES: Record<string, string> = {
  dataproduct: '/api/data-products',
  datacontract: '/api/data-contracts',
};

async function loadNames(entries: Entry[]): Promise<Record<string, string>> {
  const keys = [...new Set(entries.map((e) => entityKey(e.entity_type)).filter((k) => NAME_SOURCES[k]))];
  const names: Record<string, string> = {};
  await Promise.all(
    keys.map(async (key) => {
      try {
        const resp = await fetch(NAME_SOURCES[key]);
        if (!resp.ok) return;
        const list = await resp.json();
        for (const item of Array.isArray(list) ? list : []) {
          const name = item?.name ?? item?.title;
          if (item?.id && name) names[`${key}:${item.id}`] = String(name);
        }
      } catch {
        // A name that cannot be looked up leaves the entity's type as the title
      }
    }),
  );
  return names;
}

export default function RecentActivity({ limit = 6 }: RecentActivityProps) {
  const { t } = useTranslation('home');
  const { isLoading: permissionsLoading, hasPermission } = usePermissions();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (permissionsLoading || !hasPermission('audit', FeatureAccessLevel.READ_ONLY)) {
        setEntries([]);
        return;
      }
      try {
        setLoading(true);
        const resp = await fetch(`/api/change-log?limit=${limit}`);
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data = await resp.json();
        const list: Entry[] = Array.isArray(data) ? data : [];
        setEntries(list);
        setNames(await loadNames(list));
        setError(null);
      } catch (e: any) {
        setEntries([]);
        setError(e.message || t('recentActivity.error'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [permissionsLoading, hasPermission, limit, t]);

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">{t('recentActivity.title')}</h2>
      <Card>
        <CardContent className="p-2">
          {loading ? (
            <ListItemSkeleton count={4} height="h-10" className="space-y-2 p-4" />
          ) : error ? (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4">{t('recentActivity.noActivity')}</p>
          ) : (
            <ul>
              {entries.map((e) => {
                const key = entityKey(e.entity_type);
                const typeLabel = t(`recentActivity.entityTypes.${key}`, { defaultValue: humanize(e.entity_type) });
                const title = names[`${key}:${e.entity_id}`] ?? typeLabel;
                const action = t(`recentActivity.actions.${e.action}`, { defaultValue: humanize(e.action) });
                const who = e.username === 'system'
                  ? t('recentActivity.automatic', { defaultValue: 'Automatic' })
                  : e.username;
                const when = e.timestamp ? new Date(e.timestamp).toLocaleString() : null;
                const path = entityPath(e.entity_type, e.entity_id);
                const row = (
                  <>
                    <span className="block truncate text-sm font-medium text-foreground">{title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[action, title === typeLabel ? null : typeLabel, who, when].filter(Boolean).join(' · ')}
                    </span>
                  </>
                );
                return (
                  <li key={e.id}>
                    {path ? (
                      <Link to={path} className="block rounded-md px-4 py-2 hover:bg-accent/50">{row}</Link>
                    ) : (
                      <div className="px-4 py-2">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
