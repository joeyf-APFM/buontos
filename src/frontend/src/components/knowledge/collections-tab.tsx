import { useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Menu, Tooltip, UnstyledButton } from '@mantine/core';
import {
  FolderTree,
  Pencil,
  Trash2,
  Download,
  MoreHorizontal,
  Lock,
  Building2,
  Users,
  Briefcase,
  Globe,
  ArrowUpDown,
  ExternalLink,
  X,
} from 'lucide-react';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import EntityMetadataPanel from '@/components/metadata/entity-metadata-panel';
import { badgeToneStyle, type StatusTone } from '@/components/common/aura-status';
import { DetailsGrid, Pane } from '@/mantine/page';
import type { KnowledgeCollection, CollectionType, ScopeLevel } from '@/types/ontology';
import classes from './collections-tab.module.css';

interface CollectionsTabProps {
  collections: KnowledgeCollection[];
  selectedCollection: KnowledgeCollection | null;
  onSelectCollection: (collection: KnowledgeCollection | null) => void;
  onEditCollection: (collection: KnowledgeCollection) => void;
  onDeleteCollection: (collection: KnowledgeCollection) => void;
  onExportCollection: (collection: KnowledgeCollection, format: 'turtle' | 'rdfxml') => void;
  canEdit: boolean;
}

// Each scheme type in a tone of its own (the Aura status palette)
const typeTones: Record<CollectionType, StatusTone> = {
  glossary: 'emerald',
  taxonomy: 'gold',
  ontology: 'accent',
};

const scopeIcons: Record<ScopeLevel, ReactNode> = {
  enterprise: <Building2 aria-hidden />,
  domain: <Briefcase aria-hidden />,
  department: <Users aria-hidden />,
  team: <Users aria-hidden />,
  project: <FolderTree aria-hidden />,
  external: <Globe aria-hidden />,
};

const scopeDescriptions: Record<ScopeLevel, string> = {
  enterprise: 'Company-wide definitions used across all domains',
  domain: 'Business domain specific terms and definitions',
  department: 'Department level terminology',
  team: 'Team-specific vocabulary',
  project: 'Project-specific definitions',
  external: 'Imported or external vocabulary',
};

const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

/** A header label that sorts its column, in the grid's header-label look. */
function SortButton({ column, label }: { column: Column<KnowledgeCollection, unknown>; label: string }) {
  return (
    <UnstyledButton className={classes.sort} onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
      {label}
      <ArrowUpDown aria-hidden className={classes.sortIcon} data-active={column.getIsSorted() ? '' : undefined} />
    </UnstyledButton>
  );
}

/** The scheme's type, as a badge in its tone. */
function TypeBadge({ type, label }: { type: CollectionType; label: string }) {
  const tone = typeTones[type];
  return (
    <Badge variant="outline" style={tone ? badgeToneStyle(tone) : undefined}>
      {label}
    </Badge>
  );
}

/**
 * The scope, with its icon and its meaning on hover; in the details pane
 * also on focus (in the table, one tab stop per row would be too many).
 */
function ScopeLine({ scope, focusable = false }: { scope: ScopeLevel; focusable?: boolean }) {
  return (
    <Tooltip label={scopeDescriptions[scope]} events={TOOLTIP_EVENTS}>
      <span className={classes.scope} tabIndex={focusable ? 0 : undefined}>
        {scopeIcons[scope]}
        <span>{scope}</span>
      </span>
    </Tooltip>
  );
}

/**
 * Collections' list and the chosen scheme's details (wave 2 Task 12a): the
 * shared DataTable in a flush kit pane, and beside it, once a row is chosen,
 * a pane with the scheme's details. Both are panes of the page's content row.
 */
export const CollectionsTab: React.FC<CollectionsTabProps> = ({
  collections,
  selectedCollection,
  onSelectCollection,
  onEditCollection,
  onDeleteCollection,
  onExportCollection,
  canEdit,
}) => {
  const { t } = useTranslation(['semantic-models', 'common']);

  // The handlers through a ref, so the columns stay memoised (and a focused
  // cell keeps its focus) when the page re-renders with new handlers
  const handlers = useRef({ onEditCollection, onDeleteCollection, onExportCollection });
  useEffect(() => {
    handlers.current = { onEditCollection, onDeleteCollection, onExportCollection };
  });

  const typeLabel = useCallback((type: string) => t(`semantic-models:collections.${type}`) || type, [t]);

  const columns: ColumnDef<KnowledgeCollection>[] = useMemo(() => [
    {
      accessorKey: 'label',
      header: ({ column }) => <SortButton column={column} label={t('common:labels.name')} />,
      cell: ({ row }) => {
        const collection = row.original;
        const name = collection.label || collection.iri;
        return (
          <div className={classes.nameCell}>
            <span className={classes.nameLine}>
              <span className={classes.name}>{name}</span>
              {!collection.is_editable && (
                <Lock role="img" aria-label={t('semantic-models:badges.readonly')} className={classes.lock} />
              )}
            </span>
            {collection.description && (
              <span className={classes.description} title={collection.description}>
                {collection.description}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'collection_type',
      header: ({ column }) => <SortButton column={column} label={t('common:labels.type')} />,
      cell: ({ row }) => (
        <TypeBadge type={row.original.collection_type as CollectionType} label={typeLabel(row.original.collection_type)} />
      ),
    },
    {
      accessorKey: 'scope_level',
      header: ({ column }) => <SortButton column={column} label={t('semantic-models:fields.scope')} />,
      cell: ({ row }) => <ScopeLine scope={row.original.scope_level as ScopeLevel} />,
    },
    {
      accessorKey: 'concept_count',
      header: ({ column }) => <SortButton column={column} label={t('semantic-models:fields.concepts')} />,
      cell: ({ row }) => <Badge variant="secondary">{row.original.concept_count || 0}</Badge>,
    },
    {
      accessorKey: 'source_type',
      header: t('semantic-models:fields.source'),
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.source_type === 'imported' ? t('semantic-models:badges.imported') : t('semantic-models:badges.custom')}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const collection = row.original;
        const editable = canEdit && collection.is_editable;
        return (
          <div className={classes.actions}>
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  className={classes.action}
                  aria-label={t('semantic-models:collections.actionsFor', {
                    defaultValue: 'Actions for {{name}}',
                    name: collection.label || collection.iri,
                  })}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal aria-hidden />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                <Menu.Label>{t('common:labels.actions')}</Menu.Label>
                {editable && (
                  <>
                    <Menu.Item leftSection={<Pencil aria-hidden />} onClick={() => handlers.current.onEditCollection(collection)}>
                      {t('common:actions.edit')}
                    </Menu.Item>
                    <Menu.Divider />
                  </>
                )}
                <Menu.Item leftSection={<Download aria-hidden />} onClick={() => handlers.current.onExportCollection(collection, 'turtle')}>
                  {t('common:actions.exportTurtle')}
                </Menu.Item>
                <Menu.Item leftSection={<Download aria-hidden />} onClick={() => handlers.current.onExportCollection(collection, 'rdfxml')}>
                  {t('common:actions.exportRdfXml')}
                </Menu.Item>
                {editable && (
                  <>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<Trash2 aria-hidden />}
                      onClick={() => handlers.current.onDeleteCollection(collection)}
                    >
                      {t('common:actions.delete')}
                    </Menu.Item>
                  </>
                )}
              </Menu.Dropdown>
            </Menu>
          </div>
        );
      },
    },
  ], [t, canEdit, typeLabel]);

  const selected = selectedCollection;
  const selectedName = selected ? selected.label || selected.iri : '';

  return (
    <>
      <Pane flush aria-label={t('semantic-models:collections.listPane', 'Scheme list')}>
        <div className={classes.body}>
          <DataTable
            columns={columns}
            data={collections}
            searchColumn="label"
            storageKey="knowledge-collections-sort"
            onRowClick={(row) => onSelectCollection(selected?.iri === row.original.iri ? null : row.original)}
          />
        </div>
      </Pane>

      {selected && (
        <Pane
          title={selectedName}
          titleTooltip
          actions={
            <>
              {canEdit && selected.is_editable && (
                <Button variant="outline" size="sm" onClick={() => onEditCollection(selected)}>
                  <Pencil aria-hidden />
                  {t('common:actions.edit')}
                </Button>
              )}
              <ActionIcon
                variant="subtle"
                className={classes.action}
                aria-label={t('common:actions.close')}
                onClick={() => onSelectCollection(null)}
              >
                <X aria-hidden />
              </ActionIcon>
            </>
          }
        >
          <div className={classes.details}>
            <p className={classes.iri} title={selected.iri}>{selected.iri}</p>

            {selected.description && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>{t('common:labels.description')}</h3>
                <p className={classes.prose}>{selected.description}</p>
              </section>
            )}

            <DetailsGrid
              rows={[
                {
                  label: t('common:labels.type'),
                  value: <TypeBadge type={selected.collection_type as CollectionType} label={typeLabel(selected.collection_type)} />,
                },
                { label: t('semantic-models:fields.scope'), value: <ScopeLine scope={selected.scope_level as ScopeLevel} focusable /> },
                { label: t('semantic-models:fields.concepts'), value: <Badge variant="secondary">{selected.concept_count || 0}</Badge> },
                {
                  label: t('semantic-models:fields.source'),
                  value: (
                    <Badge variant="outline">
                      {selected.source_type === 'imported' ? t('semantic-models:badges.imported') : t('semantic-models:badges.custom')}
                    </Badge>
                  ),
                },
                {
                  label: t('common:labels.status'),
                  value: (
                    <span className={classes.badges}>
                      <Badge variant={selected.status === 'active' ? 'default' : 'secondary'}>{selected.status || 'active'}</Badge>
                      {!selected.is_editable && (
                        <Badge variant="outline">
                          <Lock aria-hidden />
                          {t('semantic-models:badges.readonly')}
                        </Badge>
                      )}
                    </span>
                  ),
                },
              ]}
            />

            {selected.source_url && (
              <section className={classes.section}>
                <h3 className={classes.sectionTitle}>{t('semantic-models:fields.sourceUrl')}</h3>
                <a href={selected.source_url} target="_blank" rel="noopener noreferrer" className={classes.link}>
                  {selected.source_url}
                  <ExternalLink aria-hidden />
                </a>
              </section>
            )}

            {selected.created_at && (
              <p className={classes.created}>Created: {new Date(selected.created_at).toLocaleDateString()}</p>
            )}

            <EntityMetadataPanel entityType="collection" entityId={selected.iri} />
          </div>
        </Pane>
      )}
    </>
  );
};
