import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tags, Pencil, Loader2, RefreshCcw } from 'lucide-react';
import TagSelector from '@/components/ui/tag-selector';
import TagChip, { AssignedTag } from '@/components/ui/tag-chip';
import { useApi } from '@/hooks/use-api';
import { usePermissions } from '@/stores/permissions-store';
import { FeatureAccessLevel } from '@/types/feature-access-levels';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import classes from '@/components/common/panel.module.css';

interface Props {
  /** Stable identifier of the entity the tags are assigned to (e.g. a table's full path). */
  entityId: string;
  /** Polymorphic entity type understood by the tags backend (e.g. 'catalog-object'). */
  entityType: string;
  /**
   * For a page-kit Pane: no card, border or padding of its own, and a compact
   * head (the title and actions). Put it in a Pane without a title, which the
   * panel's head would repeat.
   */
  flush?: boolean;
}

/**
 * Surfaces the generic entity-tag assignment API
 * (GET/POST /api/entities/{entityType}/{entityId}/tags) so that a user can view
 * and apply tags to any polymorphic entity, including Unity Catalog objects in
 * the Catalog Commander Info panel.
 */
const EntityTagsPanel: React.FC<Props> = ({ entityId, entityType, flush = false }) => {
  const { get, post, loading: saving } = useApi();
  const { toast } = useToast();
  const { t } = useTranslation('metadata');
  const { hasPermission } = usePermissions();
  const canEditTags = hasPermission('tags', FeatureAccessLevel.READ_WRITE);
  const titleId = React.useId();

  const [assignedTags, setAssignedTags] = React.useState<AssignedTag[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<(string | AssignedTag)[]>([]);

  const fetchTags = React.useCallback(async () => {
    if (!entityId) return;
    try {
      setLoading(true);
      const resp = await get<AssignedTag[]>(`/api/entities/${entityType}/${encodeURIComponent(entityId)}/tags`);
      setAssignedTags(Array.isArray(resp.data) ? resp.data : []);
    } catch (e: any) {
      // A missing assignment is not an error; only surface real failures.
      setAssignedTags([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, get]);

  React.useEffect(() => { fetchTags(); }, [fetchTags]);

  const startEditing = () => {
    setDraft(assignedTags.map(tag => tag.fully_qualified_name));
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      // The backend accepts a list of FQN strings or {tag_fqn} objects.
      const payload = draft.map(tag => (typeof tag === 'string' ? { tag_fqn: tag } : { tag_fqn: tag.fully_qualified_name }));
      const resp = await post<AssignedTag[]>(`/api/entities/${entityType}/${encodeURIComponent(entityId)}/tags:set`, payload);
      if (resp.error) throw new Error(resp.error);
      setAssignedTags(Array.isArray(resp.data) ? resp.data : []);
      setEditing(false);
      toast({ title: t('tags.messages.saveSuccess') || 'Tags updated' });
    } catch (e: any) {
      toast({ title: t('tags.messages.saveFailed') || 'Failed to update tags', description: e.message, variant: 'destructive' });
    }
  };

  const title = t('tags.title') || 'Tags';
  const description = t('tags.description') || 'Apply governance tags to this object.';
  // Flush (a Pane's content) on the shared panel styles; the Card keeps its Tailwind look
  const look = (dense: string, card: string) => (flush ? dense : card);

  const tools = (
    <TooltipProvider>
      <div className={look(classes.toolbar, 'flex items-center gap-1 border rounded-md bg-muted/40 px-1 py-0.5 ml-1')}>
        {canEditTags && !editing && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('tags.edit') || 'Edit tags'} onClick={startEditing}>
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('tags.edit') || 'Edit tags'}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('tags.refresh') || 'Refresh'} onClick={fetchTags} disabled={editing}>
              <RefreshCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('tags.refresh') || 'Refresh'}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );

  const content = editing ? (
    <div className={look(classes.form, 'space-y-3')}>
      <TagSelector
        value={draft}
        onChange={setDraft}
        placeholder={t('tags.placeholder') || 'Search and select tags...'}
      />
      <div className={look(classes.buttons, 'flex gap-2')}>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className={look(classes.spin, 'h-4 w-4 mr-1 animate-spin')} />}
          {t('tags.save') || 'Save'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
          {t('tags.cancel') || 'Cancel'}
        </Button>
      </div>
    </div>
  ) : loading ? (
    <div className={look(classes.inlineLoading, 'flex items-center gap-2 text-sm text-muted-foreground')}>
      <Loader2 className={look(classes.spin, 'h-4 w-4 animate-spin')} /> {t('common:actions.loading')}
    </div>
  ) : assignedTags.length === 0 ? (
    <div className={look(classes.empty, 'text-sm text-muted-foreground')}>{t('tags.noTags') || 'No tags applied.'}</div>
  ) : (
    <div className={look(classes.chips, 'flex flex-wrap gap-1')}>
      {assignedTags.map(tag => (
        <TagChip key={tag.tag_id} tag={tag} size="sm" displayFormat="long" />
      ))}
    </div>
  );

  if (flush) {
    return (
      <section className={classes.pane} aria-labelledby={titleId} data-flush>
        <div className={classes.headGroup}>
          <div className={classes.head}>
            <h3 id={titleId} className={classes.title}>
              <Tags aria-hidden />
              {title}
            </h3>
            <div className={classes.actions}>{tools}</div>
          </div>
          <p className={classes.subtitle}>{description}</p>
        </div>
        <div className={classes.body}>{content}</div>
      </section>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          {title}
          {tools}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
};

export default EntityTagsPanel;
