import { useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { asyncRunProgressText, asyncRunStatusLabel } from '@/lib/schema-import-run-text';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronRight,
  ChevronDown,
  Table2,
  Eye,
  Columns3,
  Box,
  FolderOpen,
  Database,
  Library,
  Server,
  Link2,
  Unlink,
} from 'lucide-react';
import { Loader, Tooltip } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { AssetSelector, type SelectedAsset } from '@/components/common/asset-selector';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import type {
  ImportPreviewItem,
  ImportResultItem,
  ImportRequest,
  ImportResult,
  ImportDepth,
  StartImportRunResponse,
  SchemaImportRunDetail,
} from '@/types/schema-import';
import { Dialog } from '@/mantine/page';
import classes from './import-preview-dialog.module.css';

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

interface TreeNode<T> {
  item: T;
  children: TreeNode<T>[];
  isExpanded: boolean;
  level: number;
}

function buildTree<T>(
  items: T[],
  getPath: (item: T) => string,
  getParentPath: (item: T) => string | null,
): TreeNode<T>[] {
  const nodeMap = new Map<string, TreeNode<T>>();
  const roots: TreeNode<T>[] = [];

  for (const item of items) {
    nodeMap.set(getPath(item), {
      item,
      children: [],
      isExpanded: true,
      level: 0,
    });
  }

  for (const item of items) {
    const parentPath = getParentPath(item);
    const node = nodeMap.get(getPath(item))!;
    const parent = parentPath ? nodeMap.get(parentPath) : undefined;

    if (parent) {
      node.level = parent.level + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: TreeNode<T>[]) => {
    nodes.sort((a, b) => getPath(a.item).localeCompare(getPath(b.item)));
    for (const n of nodes) sortChildren(n.children);
  };
  sortChildren(roots);

  return roots;
}

// ---------------------------------------------------------------------------
// Icon map (mirrors schema-browser.tsx)
// ---------------------------------------------------------------------------

const assetTypeIconMap: Record<string, typeof Database> = {
  table: Table2,
  view: Eye,
  column: Columns3,
  catalog: Library,
  schema: FolderOpen,
  dataset: FolderOpen,
  database: Database,
  'ml model': Box,
  dashboard: Box,
  system: Server,
};

function getAssetIcon(assetType: string) {
  const Icon = assetTypeIconMap[String(assetType ?? '').toLowerCase()] || Box;
  return <Icon className={classes.icon} />;
}

/** The array in an API answer, or none for a malformed one. */
const listOf = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);


// ---------------------------------------------------------------------------
// Mapped asset info (id + display name)
// ---------------------------------------------------------------------------

interface MappedAsset {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ImportPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionId?: string;
  selectedPaths?: string[];
  depth?: ImportDepth;
  // Result-only mode: when provided, the dialog opens straight into the result
  // view for a completed run (skips preview/import). Used to re-open a finished
  // background import from its notification.
  initialResult?: ImportResult | null;
}

export default function ImportPreviewDialog({
  open,
  onOpenChange,
  connectionId = '',
  selectedPaths = [],
  depth = 'full_recursive',
  initialResult = null,
}: ImportPreviewDialogProps) {
  const { t } = useTranslation(['database-schema', 'common']);
  const { post: apiPost, get: apiGet } = useApi();
  const { toast } = useToast();

  const [previewItems, setPreviewItems] = useState<ImportPreviewItem[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Async (background) import state
  const [asyncThreshold, setAsyncThreshold] = useState<number>(200);
  const [isStartingAsync, setIsStartingAsync] = useState(false);
  const [asyncRun, setAsyncRun] = useState<SchemaImportRunDetail | null>(null);

  // Toggle / map-to-existing state
  const [excludedPaths, setExcludedPaths] = useState<Set<string>>(new Set());
  const [pathMappings, setPathMappings] = useState<Record<string, MappedAsset>>({});
  const [selectorOpenForPath, setSelectorOpenForPath] = useState<string | null>(null);

  const loadPreview = async () => {
    setIsLoadingPreview(true);
    setImportResult(null);
    try {
      const payload: ImportRequest = {
        connection_id: connectionId,
        selected_paths: selectedPaths,
        depth,
        dry_run: true,
      };
      const resp = await apiPost<ImportPreviewItem[]>('/api/schema-import/preview', payload);
      if (resp.data) {
        setPreviewItems(listOf<ImportPreviewItem>(resp.data));
        setHasLoaded(true);
      }
    } catch (err) {
      console.error('Preview failed:', err);
      toast({ title: t('database-schema:preview.previewFailed'), description: String(err), variant: 'destructive' });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const executeImport = async () => {
    setIsImporting(true);
    try {
      const mappingsForApi: Record<string, string> = {};
      for (const [path, asset] of Object.entries(pathMappings)) {
        mappingsForApi[path] = asset.id;
      }
      const payload: ImportRequest = {
        connection_id: connectionId,
        selected_paths: selectedPaths,
        depth,
        excluded_paths: Array.from(excludedPaths),
        path_mappings: Object.keys(mappingsForApi).length > 0 ? mappingsForApi : undefined,
      };
      const resp = await apiPost<ImportResult>('/api/schema-import/import', payload);
      if (resp.data) {
        setImportResult(resp.data);
        setCollapsed(new Set());
        toast({
          title: t('database-schema:preview.importComplete'),
          description: t('database-schema:preview.importCompleteSummary', {
            created: resp.data.created,
            skipped: resp.data.skipped,
            errors: resp.data.errors,
          }),
        });
      }
    } catch (err) {
      console.error('Import failed:', err);
      toast({ title: t('database-schema:preview.importFailed'), description: String(err), variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  const startAsyncImport = async () => {
    setIsStartingAsync(true);
    try {
      const mappingsForApi: Record<string, string> = {};
      for (const [path, asset] of Object.entries(pathMappings)) {
        mappingsForApi[path] = asset.id;
      }
      const payload: ImportRequest = {
        connection_id: connectionId,
        selected_paths: selectedPaths,
        depth,
        excluded_paths: Array.from(excludedPaths),
        path_mappings: Object.keys(mappingsForApi).length > 0 ? mappingsForApi : undefined,
      };
      const resp = await apiPost<StartImportRunResponse>('/api/schema-import/import-async', payload);
      if (resp.data) {
        setAsyncRun({
          id: resp.data.run_id,
          status: resp.data.status,
          processed_items: 0,
          created_count: 0,
          skipped_count: 0,
          error_count: 0,
        });
        toast({
          title: t('database-schema:preview.async.started'),
          description: t('database-schema:preview.async.startedDescription'),
        });
      }
    } catch (err) {
      console.error('Async import failed to start:', err);
      toast({ title: t('database-schema:preview.async.startFailed'), description: String(err), variant: 'destructive' });
    } finally {
      setIsStartingAsync(false);
    }
  };

  const cancelAsyncImport = async () => {
    if (!asyncRun) return;
    try {
      await apiPost(`/api/schema-import/runs/${asyncRun.id}/cancel`, {});
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  // Poll the background run until it reaches a terminal state.
  useEffect(() => {
    if (!asyncRun || (asyncRun.status !== 'pending' && asyncRun.status !== 'running')) {
      return;
    }
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const resp = await apiGet<SchemaImportRunDetail>(`/api/schema-import/runs/${asyncRun.id}`);
        if (cancelled || !resp.data) return;
        setAsyncRun(resp.data);
        if (resp.data.status === 'completed' || resp.data.status === 'failed' || resp.data.status === 'cancelled') {
          if (resp.data.result) setImportResult(resp.data.result);
          if (resp.data.status === 'completed') {
            toast({
              title: t('database-schema:preview.importComplete'),
              description: t('database-schema:preview.importCompleteSummary', {
                created: resp.data.created_count,
                skipped: resp.data.skipped_count,
                errors: resp.data.error_count,
              }),
            });
          } else if (resp.data.status === 'failed') {
            toast({
              title: t('database-schema:preview.importFailed'),
              description: resp.data.error || t('database-schema:preview.async.seeRunDetails'),
              variant: 'destructive',
            });
          }
        }
      } catch (err) {
        console.error('Run poll failed:', err);
      }
    }, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [asyncRun?.id, asyncRun?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the async threshold once when the dialog opens.
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const resp = await apiGet<{ schema_import_async_threshold?: number }>('/api/settings');
        if (resp.data?.schema_import_async_threshold) {
          setAsyncThreshold(resp.data.schema_import_async_threshold);
        }
      } catch {
        /* keep default */
      }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setPreviewItems([]);
      setImportResult(null);
      setHasLoaded(false);
      setCollapsed(new Set());
      setExcludedPaths(new Set());
      setPathMappings({});
      setSelectorOpenForPath(null);
      setAsyncRun(null);
    }
    onOpenChange(nextOpen);
  };

  useEffect(() => {
    if (open && !hasLoaded && !isLoadingPreview) {
      // Result-only mode (e.g. reopened from a completed import notification):
      // show the stored result directly instead of running a fresh preview.
      if (initialResult) {
        setImportResult(initialResult);
        setHasLoaded(true);
      } else {
        loadPreview();
      }
    }
  }, [open, hasLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewTree = useMemo(
    () => buildTree(previewItems, (i) => i.path, (i) => i.parent_path),
    [previewItems],
  );

  const resultTree = useMemo(
    () => (importResult ? buildTree(listOf<ImportResultItem>(importResult.items), (i) => i.path, (i) => i.parent_path) : []),
    [importResult],
  );

  const toggleCollapse = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleExclude = useCallback((path: string) => {
    setExcludedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        setPathMappings((pm) => {
          if (path in pm) {
            const { [path]: _, ...rest } = pm;
            return rest;
          }
          return pm;
        });
      }
      return next;
    });
  }, []);

  const handleAssetSelected = useCallback((assets: SelectedAsset[]) => {
    if (!selectorOpenForPath || assets.length === 0) return;
    const picked = assets[0];
    setPathMappings((prev) => ({
      ...prev,
      [selectorOpenForPath]: { id: picked.id, name: picked.name },
    }));
    setExcludedPaths((prev) => {
      if (prev.has(selectorOpenForPath)) {
        const next = new Set(prev);
        next.delete(selectorOpenForPath);
        return next;
      }
      return prev;
    });
    setSelectorOpenForPath(null);
  }, [selectorOpenForPath]);

  const clearMapping = useCallback((path: string) => {
    setPathMappings((prev) => {
      const { [path]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const activeItems = useMemo(
    () => previewItems.filter((i) => !excludedPaths.has(i.path)),
    [previewItems, excludedPaths],
  );
  const toCreate = activeItems.filter((i) => i.will_create && !(i.path in pathMappings)).length;
  const toSkip = activeItems.filter((i) => !i.will_create || i.path in pathMappings).length;

  // Resolve the asset type for the selector target
  const selectorTargetType = useMemo(() => {
    if (!selectorOpenForPath) return undefined;
    const item = previewItems.find((i) => i.path === selectorOpenForPath);
    return item ? [item.asset_type] : undefined;
  }, [selectorOpenForPath, previewItems]);

  // ---------------------------------------------------------------------------
  // Tree renderers
  // ---------------------------------------------------------------------------

  /** The expand toggle of a parent row, or the space it would take. */
  function renderToggle(path: string, hasKids: boolean) {
    if (!hasKids) return <span className={classes.spacer} />;
    return (
      <button onClick={() => toggleCollapse(path)} className={classes.toggle}>
        {collapsed.has(path) ? <ChevronRight /> : <ChevronDown />}
      </button>
    );
  }

  function renderPreviewNode(node: TreeNode<ImportPreviewItem>) {
    const { item, children, level } = node;
    const hasKids = children.length > 0;
    const isCollapsed = collapsed.has(item.path);
    const isExcluded = excludedPaths.has(item.path);
    const mapped = pathMappings[item.path];
    const isMapped = !!mapped;
    const canLink = item.is_ancestor && item.will_create && !isExcluded;
    const label = isMapped ? mapped.name : item.name;

    return (
      <div key={item.path}>
        <div
          data-tree-row
          data-excluded={isExcluded || undefined}
          className={classes.row}
          style={{ '--label-offset': `${level * 16}px` } as CSSProperties}
        >
          {renderToggle(item.path, hasKids)}

          {item.is_ancestor && (
            <Checkbox
              checked={!isExcluded}
              onCheckedChange={() => toggleExclude(item.path)}
            />
          )}

          {isExcluded ? (
            <MinusCircle className={classes.muted} />
          ) : isMapped ? (
            <Link2 className={classes.linked} />
          ) : item.will_create ? (
            <CheckCircle2 className={classes.good} />
          ) : (
            <MinusCircle className={classes.warning} />
          )}

          {getAssetIcon(item.asset_type)}

          {/* A long name keeps to one line; its title shows it in full */}
          <span
            className={classes.label}
            title={label}
            data-linked={isMapped || undefined}
            data-ancestor={(!isMapped && item.is_ancestor) || undefined}
          >
            {label}
          </span>

          {/* Link / unlink icon for ancestors that would be created. One
              button for both, so it stays mounted when a mapping swaps Link
              for Unlink: the kit gives focus back to it as the asset selector
              closes, and focus stays in this dialog (a new button would leave
              it on <body>). */}
          {(canLink || isMapped) && (
            <Tooltip
              label={isMapped ? t('database-schema:preview.unlinkCreateNew') : t('database-schema:preview.linkToExisting')}
              position="top"
              withArrow
            >
              <button
                onClick={() => {
                  if (isMapped) {
                    clearMapping(item.path);
                  } else {
                    setSelectorOpenForPath(item.path);
                  }
                }}
                className={classes.iconButton}
              >
                {isMapped ? <Unlink /> : <Link2 />}
              </button>
            </Tooltip>
          )}

          <Badge variant="outline" className={classes.badge}>{item.asset_type}</Badge>

          {isExcluded ? (
            <span className={classes.status}>{t('database-schema:preview.statusSkip')}</span>
          ) : isMapped ? (
            <span className={`${classes.status} ${classes.statusLinked}`}>{t('database-schema:preview.statusLinked')}</span>
          ) : (
            <span className={classes.status}>
              {item.will_create
                ? (item.is_ancestor ? t('database-schema:preview.statusAuto') : t('database-schema:preview.statusNew'))
                : t('database-schema:preview.statusExists')}
            </span>
          )}
        </div>

        {hasKids && !isCollapsed && children.map(renderPreviewNode)}
      </div>
    );
  }

  function renderResultNode(node: TreeNode<ImportResultItem>) {
    const { item, children, level } = node;
    const hasKids = children.length > 0;
    const isCollapsed = collapsed.has(item.path);

    return (
      <div key={item.path}>
        <div
          data-tree-row
          className={classes.row}
          style={{ '--label-offset': `${level * 16}px` } as CSSProperties}
        >
          {renderToggle(item.path, hasKids)}

          {item.action === 'created' ? (
            <CheckCircle2 className={classes.good} />
          ) : item.action === 'skipped' ? (
            <MinusCircle className={classes.warning} />
          ) : (
            <XCircle className={classes.critical} />
          )}

          {getAssetIcon(item.asset_type)}
          <span className={classes.label} title={item.name}>{item.name}</span>

          <Badge variant="outline" className={classes.badge}>{item.asset_type}</Badge>
          <Badge
            className={classes.badge}
            variant={
              item.action === 'created'
                ? 'default'
                : item.action === 'error'
                  ? 'destructive'
                  : 'secondary'
            }
          >
            {item.action}
          </Badge>
        </div>

        {hasKids && !isCollapsed && children.map(renderResultNode)}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const asyncRunning = !!asyncRun && (asyncRun.status === 'pending' || asyncRun.status === 'running');

  return (
    <>
      {/* As the Radix dialog: a click outside leaves it open; Escape closes
          it, unless the asset selector above it took the key (a Radix layer) */}
      <Dialog
        opened={open}
        onClose={() => handleOpenChange(false)}
        size="lg"
        title={importResult ? t('database-schema:preview.resultsTitle') : t('database-schema:preview.previewTitle')}
        description={
          importResult
            ? t('database-schema:preview.resultSummary', {
                created: importResult.created,
                skipped: importResult.skipped,
                errors: importResult.errors,
              })
            : t('database-schema:preview.previewSummary', { toCreate, toSkip })
        }
        footer={
          importResult ? (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common:actions.close')}
            </Button>
          ) : asyncRunning ? (
            <>
              <Button variant="outline" onClick={cancelAsyncImport}>
                {t('database-schema:preview.async.cancel')}
              </Button>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('database-schema:preview.async.closeKeepRunning')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('common:actions.cancel')}
              </Button>
              {toCreate >= asyncThreshold && (
                <Button
                  variant="secondary"
                  onClick={startAsyncImport}
                  disabled={isStartingAsync || isImporting || toCreate === 0}
                >
                  {isStartingAsync && <Loader size={12} color="currentColor" />}
                  {t('database-schema:preview.async.runInBackground')}
                </Button>
              )}
              <Button
                onClick={executeImport}
                disabled={isImporting || isStartingAsync || toCreate === 0}
              >
                {isImporting && <Loader size={12} color="currentColor" />}
                {t('database-schema:preview.importAssets', { count: toCreate })}
              </Button>
            </>
          )
        }
      >
        {isLoadingPreview ? (
          <div className={classes.loading}>
            <Loader size={18} />
            <span>{t('database-schema:preview.analyzing')}</span>
          </div>
        ) : importResult ? (
          <div className={classes.tree}>
            {resultTree.map(renderResultNode)}
            {resultTree.length === 0 && (
              <div className={classes.empty}>{t('database-schema:preview.noResultItems')}</div>
            )}
          </div>
        ) : (
          <div className={classes.tree}>
            {previewTree.map(renderPreviewNode)}
            {previewTree.length === 0 && (
              <div className={classes.empty}>{t('database-schema:preview.noImportable')}</div>
            )}
          </div>
        )}

        {/* Background-run progress (while an async import is in flight) */}
        {asyncRun && !importResult && (
          <div className={classes.run}>
            <div className={classes.runLine}>
              {asyncRunning && <Loader size={14} />}
              <span className={classes.runStatus}>{asyncRunStatusLabel(asyncRun.status, t)}</span>
              <span className={classes.runText}>
                {asyncRun.total_items
                  ? asyncRunProgressText(asyncRun, t)
                  : asyncRun.progress_message || t('database-schema:preview.async.starting')}
              </span>
            </div>
            <p className={classes.runHint}>{t('database-schema:preview.async.closeHint')}</p>
          </div>
        )}
      </Dialog>

      {/* Asset selector opened from a link icon */}
      <AssetSelector
        isOpen={!!selectorOpenForPath}
        onOpenChange={(open) => { if (!open) setSelectorOpenForPath(null); }}
        onConfirm={handleAssetSelected}
        targetAssetTypes={selectorTargetType}
        title={t('database-schema:preview.linkToExisting')}
        description={t('database-schema:preview.assetSelectorDescription')}
        confirmLabel={t('database-schema:preview.useSelected')}
      />
    </>
  );
}
