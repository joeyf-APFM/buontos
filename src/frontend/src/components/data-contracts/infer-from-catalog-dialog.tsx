import { useState, useEffect, useCallback, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Combobox, Loader, Select, type SelectProps } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { SELECT_CLASSES, uniqueOptions } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import classes from './contract-form-dialogs.module.css';
import { useApi } from '@/hooks/use-api';
import SchemaBrowser from '@/components/schema-importer/schema-browser';
import type { Connection } from '@/types/connections';

export interface CatalogSchemaResult {
  name: string;
  physicalName: string;
  description: string;
  physicalType: string;
  properties: Array<{
    name: string;
    physicalType: string;
    logicalType: string;
    required: boolean;
    description: string;
    partitioned: boolean;
  }>;
}

interface InferFromCatalogDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onInfer: (schemas: CatalogSchemaResult[]) => void;
}

export default function InferFromCatalogDialog({
  isOpen,
  onOpenChange,
  onInfer,
}: InferFromCatalogDialogProps) {
  const { get: apiGet } = useApi();
  const { t } = useTranslation(['data-contracts', 'common']);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [isInferring, setIsInferring] = useState(false);
  const connectionLabelId = useId();

  const fetchConnections = useCallback(async () => {
    setIsLoadingConnections(true);
    try {
      const resp = await apiGet<Connection[]>('/api/connections');
      if (resp.data) {
        const enabled = resp.data.filter((c) => c.enabled);
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
    if (isOpen) {
      fetchConnections();
      setSelectedConnectionId(null);
      setSelectedPaths(new Set());
    }
  }, [isOpen, fetchConnections]);

  const handleConnectionChange = (id: string) => {
    setSelectedConnectionId(id);
    setSelectedPaths(new Set());
  };

  const handleInfer = async () => {
    if (!selectedConnectionId || selectedPaths.size === 0) return;

    setIsInferring(true);
    const schemas: CatalogSchemaResult[] = [];

    try {
      for (const path of selectedPaths) {
        const resp = await fetch(
          `/api/schema-import/metadata/${selectedConnectionId}?path=${encodeURIComponent(path)}`
        );
        if (!resp.ok) continue;
        const metadata = await resp.json();

        const columns = metadata.schema_info?.columns || [];
        schemas.push({
          name: metadata.name || path.split('.').pop() || path,
          physicalName: metadata.path || metadata.identifier || path,
          description: metadata.description || metadata.comment || '',
          physicalType: metadata.asset_type || 'table',
          properties: columns.map((c: any) => ({
            name: c.name || '',
            physicalType: c.data_type || '',
            logicalType: c.logical_type || 'string',
            required: c.nullable === undefined ? false : !c.nullable,
            description: c.description || '',
            partitioned: c.is_partition_key || false,
          })),
        });
      }

      if (schemas.length > 0) {
        onInfer(schemas);
      }
    } finally {
      setIsInferring(false);
    }
  };

  const connectionOptions = uniqueOptions(connections.map((c) => ({ value: c.id, label: c.name, type: c.connector_type })));
  // An option's name and its connector type, as the Radix items showed them
  const renderConnection: SelectProps['renderOption'] = ({ option }) => (
    <span className={form.optionLine}>
      <span>{option.label}</span>
      <Badge variant="outline">{(option as typeof connectionOptions[number]).type}</Badge>
    </span>
  );
  const chosen = connectionOptions.find((o) => o.value === selectedConnectionId);

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="xl"
      height="80vh"
      title={t('data-contracts:infer.catalogDialogTitle', 'Infer Schema from Catalog')}
      description={t('data-contracts:infer.catalogDialogDescription', 'Browse a connected catalog and select tables or views to infer their schema into this contract.')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            onClick={handleInfer}
            disabled={selectedPaths.size === 0 || isInferring}
          >
            {isInferring && <Loader size={12} color="currentColor" />}
            {selectedPaths.size > 0
              ? t('data-contracts:infer.inferSchemasButton', {
                  count: selectedPaths.size,
                  defaultValue: 'Infer {{count}} Schema',
                  defaultValue_other: 'Infer {{count}} Schemas',
                })
              : t('data-contracts:infer.inferSchema', 'Infer Schema')}
          </Button>
        </>
      }
    >
      {/* Connection selector */}
      <div className={classes.toolbar}>
        <span id={connectionLabelId} className={classes.toolbarLabel}>{t('data-contracts:infer.connectionLabel', 'Connection:')}</span>
        {isLoadingConnections ? (
          <div className={form.loading}>
            <Loader size={14} />
            {t('common:states.loading')}
          </div>
        ) : connections.length === 0 ? (
          <span className={form.muted}>
            {t('data-contracts:infer.noConnections', 'No connections configured. Add one in Settings > Connectors.')}
          </span>
        ) : (
          <Select
            aria-labelledby={connectionLabelId}
            className={classes.connection}
            placeholder={t('data-contracts:infer.chooseConnection', 'Choose connection...')}
            data={connectionOptions}
            value={selectedConnectionId}
            onChange={(value) => value && handleConnectionChange(value)}
            allowDeselect={false}
            renderOption={renderConnection}
            // The chosen connection's type stays in the field, as the Radix SelectValue repeated the item
            {...(chosen ? {
              rightSection: (
                <span className={form.fieldBadge}>
                  <Badge variant="outline">{chosen.type}</Badge>
                  <Combobox.Chevron />
                </span>
              ),
              rightSectionWidth: 'auto' as const,
              rightSectionPointerEvents: 'none' as const,
            } : {})}
            classNames={SELECT_CLASSES}
          />
        )}
        {selectedPaths.size > 0 && (
          <Badge variant="secondary">{t('data-contracts:infer.selectedCount', '{{count}} selected', { count: selectedPaths.size })}</Badge>
        )}
      </div>

      {/* Schema browser */}
      <div className={classes.browser}>
        <SchemaBrowser
          connectionId={selectedConnectionId}
          selectedPaths={selectedPaths}
          onSelectionChange={setSelectedPaths}
        />
      </div>
    </Dialog>
  );
}
