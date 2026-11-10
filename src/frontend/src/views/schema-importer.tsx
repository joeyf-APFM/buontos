import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader, Select } from '@mantine/core';
import { Import, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Breadcrumb, PageHeader, PageLayout, Pane } from '@/mantine/page';
import { isFullBleed } from '@/mantine/shell/full-bleed';
import { useApi } from '@/hooks/use-api';
import useBreadcrumbStore from '@/stores/breadcrumb-store';
import type { Connection } from '@/types/connections';
import type { ImportDepth, ImportResult, SchemaImportRunDetail } from '@/types/schema-import';
import SchemaBrowser from '@/components/schema-importer/schema-browser';
import ImportPreviewDialog from '@/components/schema-importer/import-preview-dialog';
import { useUICustomizationStore } from '@/stores/ui-customization-store';
import { useToast } from '@/hooks/use-toast';
import classes from './schema-importer.module.css';

const DEPTHS: { value: ImportDepth; id: string; label: string; hint: string }[] = [
  { value: 'selected_only', id: 'depth-selected', label: 'depthSelectedOnly', hint: 'depthSelectedOnlyHint' },
  { value: 'one_level', id: 'depth-one', label: 'depthOneLevel', hint: 'depthOneLevelHint' },
  { value: 'full_recursive', id: 'depth-full', label: 'depthFullRecursive', hint: 'depthFullRecursiveHint' },
];

export default function SchemaImporterView() {
  const { t } = useTranslation(['database-schema', 'settings', 'common']);
  const appName = useUICustomizationStore((s) => s.getAppName());
  const { get: apiGet } = useApi();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  // On its own route the page fills the main area and draws its breadcrumb;
  // at /concepts/import it sits inside the Concepts layout's padding
  const ownsPage = isFullBleed(useLocation().pathname);
  const setStaticSegments = useBreadcrumbStore((s) => s.setStaticSegments);
  const setDynamicTitle = useBreadcrumbStore((s) => s.setDynamicTitle);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [importDepth, setImportDepth] = useState<ImportDepth>('full_recursive');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  // Result-only view for a completed run reopened from its notification (?runId=).
  const [runResult, setRunResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    setStaticSegments([]);
    setDynamicTitle(t('settings:schemaImporter.title', 'Schema Importer'));
    return () => {
      setStaticSegments([]);
      setDynamicTitle(null);
    };
  }, [t, setStaticSegments, setDynamicTitle]);

  const fetchConnections = useCallback(async () => {
    setIsLoadingConnections(true);
    try {
      const resp = await apiGet<Connection[]>('/api/connections');
      // A malformed answer lists no connections
      if (Array.isArray(resp.data)) {
        const enabled = resp.data.filter((c) => c?.enabled);
        setConnections(enabled);
        if (enabled.length === 1) {
          setSelectedConnectionId(enabled[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch connections:', err);
    } finally {
      setIsLoadingConnections(false);
    }
  }, [apiGet]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Reopen a completed background import's result when deep-linked via ?runId=
  // (from the completion notification's "Open" button).
  const runIdParam = searchParams.get('runId');
  useEffect(() => {
    if (!runIdParam) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiGet<SchemaImportRunDetail>(`/api/schema-import/runs/${runIdParam}`);
        if (cancelled) return;
        if (resp.data?.result) {
          setRunResult(resp.data.result);
        } else {
          toast({
            title: 'Import still running',
            description: "You'll be notified when it completes.",
          });
        }
      } catch (err) {
        console.error('Failed to load import run:', err);
        toast({ title: 'Could not load import result', description: String(err), variant: 'destructive' });
      }
    })();
    return () => { cancelled = true; };
  }, [runIdParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeRunResult = () => {
    setRunResult(null);
    // Drop ?runId= so a refresh/re-close doesn't reopen the result.
    searchParams.delete('runId');
    setSearchParams(searchParams, { replace: true });
  };

  const handleConnectionChange = (id: string) => {
    setSelectedConnectionId(id);
    setSelectedPaths(new Set());
  };

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const canPreview = selectedPaths.size > 0;
  const title = t('settings:schemaImporter.title', 'Schema Importer');

  // One option per connection id: Mantine's Select throws on a repeated value
  const connectionOptions = useMemo(() => {
    const seen = new Set<string>();
    return connections
      .filter((c) => !seen.has(c.id) && !!seen.add(c.id))
      .map((c) => ({ value: c.id, label: c.name }));
  }, [connections]);
  const connectorType = (id: string) => connections.find((c) => c.id === id)?.connector_type;

  const options = (
    <Pane
      title={t('database-schema:importer.options')}
      actions={selectedConnection?.connector_type && <span className={classes.tag}>{selectedConnection.connector_type}</span>}
      className={classes.optionsPane}
    >
      {/* Connection selector */}
      <div className={classes.group}>
        <h3 className={classes.groupTitle}>{t('common:labels.connection')}</h3>
        <p className={classes.groupHint}>{t('database-schema:importer.selectConnectionDescription')}</p>
        {isLoadingConnections ? (
          <div className={classes.loading}>
            <Loader size={14} />
            {t('common:states.loading')}
          </div>
        ) : connections.length === 0 ? (
          <p className={classes.empty}>{t('database-schema:importer.noConnections')}</p>
        ) : (
          <Select
            data={connectionOptions}
            value={selectedConnectionId}
            onChange={(v) => v && handleConnectionChange(v)}
            allowDeselect={false}
            // Unnamed, as the Radix trigger was (R16): the placeholder would
            // name the field, so it is only there while nothing is picked
            placeholder={selectedConnectionId ? undefined : t('database-schema:importer.chooseConnection')}
            renderOption={({ option }) => (
              <span className={classes.option}>
                <span className={classes.optionName}>{option.label}</span>
                <span className={classes.tag}>{connectorType(option.value)}</span>
              </span>
            )}
          />
        )}
      </div>

      {/* Import depth */}
      <div className={classes.group}>
        <h3 className={classes.groupTitle}>{t('database-schema:importer.importDepth')}</h3>
        <p className={classes.groupHint}>{t('database-schema:importer.importDepthDescription')}</p>
        <RadioGroup value={importDepth} onValueChange={(v) => setImportDepth(v as ImportDepth)}>
          {DEPTHS.map((d) => (
            <div key={d.value} className={classes.radio}>
              <RadioGroupItem value={d.value} id={d.id} />
              {/* The name and the hint together name the radio, as before */}
              <label htmlFor={d.id} className={classes.radioLabel}>
                <span className={classes.radioName}>{t(`database-schema:importer.${d.label}`)}</span>
                {' '}
                <span className={classes.radioHint}>{t(`database-schema:importer.${d.hint}`)}</span>
              </label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Actions */}
      <div className={classes.actions}>
        <Button onClick={() => setIsPreviewOpen(true)} disabled={!canPreview} variant="outline">
          <Eye />
          {t('database-schema:importer.previewSelected', { count: selectedPaths.size })}
        </Button>
        <Button onClick={() => setIsPreviewOpen(true)} disabled={!canPreview}>
          <Import />
          {t('common:actions.import')}
        </Button>
      </div>
    </Pane>
  );

  /* Right: the tree browser */
  const resources = (
    <Pane
      title={
        selectedConnection
          ? t('database-schema:importer.resourcesTitle', { name: selectedConnection.name })
          : t('database-schema:importer.resources')
      }
      actions={
        selectedPaths.size > 0 && (
          <span className={classes.tag}>{t('database-schema:importer.selectedCount', { count: selectedPaths.size })}</span>
        )
      }
      flush
      // The connection's name can be too long for the head
      titleTooltip
      className={classes.resourcesPane}
    >
      <div className={classes.resourcesBody}>
        <p className={classes.paneHint}>{t('database-schema:importer.resourcesDescription')}</p>
        <SchemaBrowser
          pane
          connectionId={selectedConnectionId}
          selectedPaths={selectedPaths}
          onSelectionChange={setSelectedPaths}
        />
      </div>
    </Pane>
  );

  const header = <PageHeader title={title} />;
  const intro = (
    <p className={classes.intro} data-ruled={ownsPage || undefined}>
      {t(
        'settings:schemaImporter.description',
        'Browse remote systems and import their structure as {{appName}} assets.',
        { appName },
      )}
    </p>
  );

  const dialogs: ReactNode = (
    <>
      {/* Preview / Import dialog */}
      {selectedConnectionId && (
        <ImportPreviewDialog
          open={isPreviewOpen}
          onOpenChange={setIsPreviewOpen}
          connectionId={selectedConnectionId}
          selectedPaths={Array.from(selectedPaths)}
          depth={importDepth}
        />
      )}

      {/* Result-only view for a completed run reopened from its notification */}
      {runResult && (
        <ImportPreviewDialog
          open={true}
          onOpenChange={(open) => { if (!open) closeRunResult(); }}
          initialResult={runResult}
        />
      )}
    </>
  );

  if (ownsPage) {
    return (
      <>
        <PageLayout
          fullBleed
          stackBelow="lg"
          breadcrumb={<Breadcrumb items={[{ label: title }]} />}
          header={<>{header}{intro}</>}
        >
          {options}
          {resources}
        </PageLayout>
        {dialogs}
      </>
    );
  }

  return (
    <div className={classes.embedded}>
      {header}
      {intro}
      {/* The kit's content row (composed), stacking below lg like PageLayout's stackBelow */}
      <div className={classes.row} data-stack-below="lg">
        {options}
        {resources}
      </div>
      {dialogs}
    </div>
  );
}
