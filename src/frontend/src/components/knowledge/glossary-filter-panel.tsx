import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGlossaryPreferencesStore } from '@/stores/glossary-preferences-store';
import { ActionIcon, Checkbox, Collapse, Menu, Select, Switch, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, Pane } from '@/mantine/page';
import { useMenuItemFocus } from '@/mantine/use-menu-item-focus';
import {
  ChevronRight,
  ChevronDown,
  Filter,
  FolderTree,
  Zap,
  Languages,
  MoreHorizontal,
  List,
  ListTree,
  Share2,
  Library,
} from 'lucide-react';
import { systemRdfNamespaceDisplayLabel } from '@/lib/system-rdf-namespace-labels';
import type { OntologyConcept, KnowledgeCollection } from '@/types/ontology';
import type { GroupByDimension } from '@/stores/glossary-preferences-store';
import { getAvailableLanguages, getLanguageDisplayName } from '@/lib/ontology-utils';
import { collectionSourceKey } from '@/lib/collection-source-key';
import classes from './glossary-filter-panel.module.css';

// The scheme types' icons, as on Define
const TYPE_ICONS: Record<string, typeof Filter> = {
  glossary: List,
  taxonomy: ListTree,
  ontology: Share2,
  other: Filter,
};

const TOOLTIP_EVENTS = { hover: true, focus: true, touch: false };

interface SchemeActionsProps {
  collection: KnowledgeCollection;
  label: string;
  deletable: boolean;
  onRename: (collection: KnowledgeCollection) => void;
  /** Asks first: opens the delete confirm */
  onDelete: (collection: KnowledgeCollection) => void;
}

/**
 * A scheme's Rename / Delete menu. Both items open a kit Dialog (the scheme
 * editor, the confirm), which keeps focus: one useMenuItemFocus per menu (R51).
 */
function SchemeActions({ collection, label, deletable, onRename, onDelete }: SchemeActionsProps) {
  const { t } = useTranslation(['semantic-models', 'common']);
  const { menuProps, opensDialog } = useMenuItemFocus();
  return (
    <Menu position="bottom-end" withinPortal {...menuProps}>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          size={20}
          className={classes.chipAction}
          aria-label={t('semantic-models:collections.actionsFor', { defaultValue: 'Actions for {{name}}', name: label })}
        >
          <MoreHorizontal aria-hidden />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={opensDialog(() => onRename(collection))}>
          {t('common:actions.rename', 'Rename')}
        </Menu.Item>
        {deletable ? (
          <Menu.Item color="red" onClick={opensDialog(() => onDelete(collection))}>
            {t('common:actions.delete', 'Delete')}
          </Menu.Item>
        ) : (
          // Off, with the reason under it
          <Menu.Item disabled>
            <span className={classes.disabledItem}>
              {t('common:actions.delete', 'Delete')}
              <span className={classes.disabledReason}>
                {t('semantic-models:filters.importedDisable', 'Imported — cannot delete')}
              </span>
            </span>
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

interface GlossaryFilterPanelProps {
  // Data for computing counts
  filteredConcepts: OntologyConcept[];
  sourceConceptCounts: Record<string, number>;
  // Source filtering
  availableSources: string[];
  hiddenSources: string[];
  onToggleSource: (source: string) => void;
  onSelectAllSources: () => void;
  onSelectNoneSources: (sources: string[]) => void;
  // Display options
  // The "Group by" lens re-organizes terms under dimension headers. This is a
  // LENS, not a second filter -- filtering stays driven by the source chips above.
  groupByDimension: GroupByDimension;
  onSetGroupByDimension: (dimension: GroupByDimension) => void;
  showProperties: boolean;
  onSetShowProperties: (enabled: boolean) => void;
  // Include built-in system ontologies (optional; toggle hidden when omitted)
  showSystemSources?: boolean;
  onSetShowSystemSources?: (enabled: boolean) => void;
  // Language selection
  selectedLanguage: string;
  onSetSelectedLanguage: (lang: string) => void;
  // Expansion state
  isFilterExpanded: boolean;
  onSetFilterExpanded: (expanded: boolean) => void;
  // Collections and callbacks for scheme actions (optional for read-only
  // views). The actions menu shows only with both callbacks: the caller passes
  // them only to a user who may write schemes.
  collections?: KnowledgeCollection[];
  onRenameScheme?: (collection: KnowledgeCollection) => void;
  onDeleteScheme?: (collection: KnowledgeCollection) => void;
}

export function GlossaryFilterPanel({
  filteredConcepts,
  sourceConceptCounts,
  availableSources,
  hiddenSources,
  onToggleSource,
  onSelectAllSources,
  onSelectNoneSources,
  groupByDimension,
  onSetGroupByDimension,
  showProperties,
  onSetShowProperties,
  showSystemSources = false,
  onSetShowSystemSources,
  selectedLanguage,
  onSetSelectedLanguage,
  isFilterExpanded,
  onSetFilterExpanded,
  collections,
  onRenameScheme,
  onDeleteScheme,
}: GlossaryFilterPanelProps) {
  const { t } = useTranslation(['semantic-models', 'common']);

  // Local search text; the Name/Size sort is a persisted user preference.
  const [searchText, setSearchText] = useState('');
  const sortMode = useGlossaryPreferencesStore((s) => s.sourceSortMode);
  const setSortMode = useGlossaryPreferencesStore((s) => s.setSourceSortMode);
  const [deleteConfirmScheme, setDeleteConfirmScheme] = useState<KnowledgeCollection | null>(null);
  const bodyId = useId();

  // Flatten collections tree and build a map: source key (the concepts' group
  // name) → collection
  const collectionsBySource = useMemo(() => {
    const map = new Map<string, KnowledgeCollection>();
    if (!collections) return map;
    const visit = (c: KnowledgeCollection) => {
      map.set(collectionSourceKey(c), c);
      if (c.child_collections && c.child_collections.length > 0) {
        c.child_collections.forEach(visit);
      }
    };
    collections.forEach(visit);
    return map;
  }, [collections]);

  // Group sources by collection type (glossary/taxonomy/ontology/other)
  const sourcesByType = useMemo(() => {
    const groups: Record<string, string[]> = {
      glossary: [],
      taxonomy: [],
      ontology: [],
      other: [],
    };

    availableSources.forEach((source) => {
      const collection = collectionsBySource.get(source);
      if (collection) {
        const type = collection.collection_type;
        if (type === 'glossary' || type === 'taxonomy' || type === 'ontology') {
          groups[type].push(source);
        } else {
          groups.other.push(source);
        }
      } else {
        // Source with no collection record
        groups.other.push(source);
      }
    });

    return groups;
  }, [availableSources, collectionsBySource]);

  // Apply search filter to sources
  const filteredSourcesByType = useMemo(() => {
    const filtered: Record<string, string[]> = {};
    const searchLower = searchText.toLowerCase();

    Object.entries(sourcesByType).forEach(([type, sources]) => {
      filtered[type] = sources.filter((source) => {
        const collection = collectionsBySource.get(source);
        const label = collection?.label || systemRdfNamespaceDisplayLabel(source, t);
        return label.toLowerCase().includes(searchLower);
      });
    });

    return filtered;
  }, [sourcesByType, searchText, collectionsBySource, t]);

  // Sort sources within each type
  const sortedSourcesByType = useMemo(() => {
    const sorted: Record<string, string[]> = {};

    Object.entries(filteredSourcesByType).forEach(([type, sources]) => {
      const sorted_sources = [...sources];
      if (sortMode === 'name') {
        sorted_sources.sort((a, b) => {
          const aLabel = (collectionsBySource.get(a)?.label) || systemRdfNamespaceDisplayLabel(a, t);
          const bLabel = (collectionsBySource.get(b)?.label) || systemRdfNamespaceDisplayLabel(b, t);
          return aLabel.localeCompare(bLabel);
        });
      } else if (sortMode === 'size') {
        sorted_sources.sort((a, b) => {
          const aCount = sourceConceptCounts[a] || 0;
          const bCount = sourceConceptCounts[b] || 0;
          return bCount - aCount;
        });
      }
      sorted[type] = sorted_sources;
    });

    return sorted;
  }, [filteredSourcesByType, sortMode, collectionsBySource, sourceConceptCounts, t]);

  // Compute available languages from all concepts
  const availableLanguages = useMemo(() => {
    return getAvailableLanguages(filteredConcepts);
  }, [filteredConcepts]);

  // Keep the panel when the system toggle is wired: with system ontologies
  // hidden, a fresh workspace may have no sources yet, and the toggle is the
  // only way to bring them back.
  if (availableSources.length === 0 && !onSetShowSystemSources) {
    return null;
  }

  const visibleCount = availableSources.filter((s) => !hiddenSources.includes(s)).length;
  const sourceLabel = (source: string) =>
    collectionsBySource.get(source)?.label || systemRdfNamespaceDisplayLabel(source, t);

  return (
    <Pane flush aria-label={t('semantic-models:explore.filtersPane', 'Filters')}>
      <div className={classes.head}>
        <UnstyledButton
          className={classes.toggle}
          aria-expanded={isFilterExpanded}
          aria-controls={bodyId}
          onClick={() => onSetFilterExpanded(!isFilterExpanded)}
        >
          {isFilterExpanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          <Filter aria-hidden />
          {t('semantic-models:filters.bySource')}
          {hiddenSources.length > 0 && (
            <Badge variant="secondary">
              {visibleCount}/{availableSources.length}
            </Badge>
          )}
        </UnstyledButton>
        <div className={classes.headActions}>
          <Button variant="ghost" size="sm" onClick={onSelectAllSources}>
            {t('semantic-models:filters.all')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onSelectNoneSources(availableSources)}>
            {t('semantic-models:filters.none')}
          </Button>
          <div role="group" aria-label={t('semantic-models:filters.sortBy', 'Sort by')} className={classes.sort}>
            <Button
              variant={sortMode === 'name' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={sortMode === 'name'}
              onClick={() => setSortMode('name')}
            >
              {t('semantic-models:filters.sortName', 'Name')}
            </Button>
            <Button
              variant={sortMode === 'size' ? 'default' : 'outline'}
              size="sm"
              aria-pressed={sortMode === 'size'}
              onClick={() => setSortMode('size')}
            >
              {t('semantic-models:filters.sortSize', 'Size')}
            </Button>
          </div>
        </div>
      </div>

      <Collapse in={isFilterExpanded} transitionDuration={0}>
        <div id={bodyId} className={classes.body}>
          <TextInput
            className={classes.search}
            placeholder={t('semantic-models:filters.searchSchemes', 'Search schemes...')}
            aria-label={t('semantic-models:filters.searchSchemes', 'Search schemes...')}
            value={searchText}
            onChange={(e) => setSearchText(e.currentTarget.value)}
          />

          {/* Source chips grouped by type. Height-bounded scroll area so a
              large source count doesn't explode the panel; each chip is an
              independent checkbox. Each type row starts with its icon and
              count, its name in the tooltip (hover and focus). */}
          <div className={classes.sources}>
            {(['glossary', 'taxonomy', 'ontology', 'other'] as const).map((type) => {
              const sources = sortedSourcesByType[type] || [];
              if (sources.length === 0) return null;

              const typeLabel = t(`semantic-models:filters.groupType${type.charAt(0).toUpperCase() + type.slice(1)}`,
                type === 'glossary' ? 'GLOSSARIES' : type === 'taxonomy' ? 'TAXONOMIES' : type === 'ontology' ? 'ONTOLOGIES' : 'OTHER'
              );
              const TypeIcon = TYPE_ICONS[type] || Filter;

              return (
                <div key={type} role="group" aria-label={typeLabel} className={classes.typeRow}>
                  <Tooltip label={typeLabel} events={TOOLTIP_EVENTS}>
                    <span role="img" tabIndex={0} aria-label={typeLabel} className={classes.typeMark}>
                      <TypeIcon aria-hidden />
                      <Badge variant="secondary">{sources.length}</Badge>
                    </span>
                  </Tooltip>
                  <div className={classes.chips}>
                    {sources.map((source) => {
                      const isVisible = !hiddenSources.includes(source);
                      const conceptCount = sourceConceptCounts[source] || 0;
                      const collection = collectionsBySource.get(source);
                      const isDeletable = collection && collection.source_type !== 'imported' && collection.is_editable;
                      const label = sourceLabel(source);

                      return (
                        <div key={source} className={classes.chip} data-visible={isVisible || undefined}>
                          <Checkbox
                            size="xs"
                            className={classes.chipCheck}
                            checked={isVisible}
                            onChange={() => onToggleSource(source)}
                            label={
                              <span className={classes.chipLabel}>
                                <span className={classes.chipName} title={source}>{label}</span>
                                <Badge variant="secondary">{conceptCount}</Badge>
                              </span>
                            }
                          />

                          {/* Actions for schemes with a collection record (only if callbacks provided) */}
                          {collection && onRenameScheme && onDeleteScheme && (
                            <SchemeActions
                              collection={collection}
                              label={label}
                              deletable={!!isDeletable}
                              onRename={onRenameScheme}
                              onDelete={setDeleteConfirmScheme}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Display options. The "Group by" lens re-organizes the same
              chips/terms under dimension headers: a LENS, not a second filter. */}
          <div className={classes.options}>
            <Select
              label={
                <span className={classes.optionLabel}>
                  <FolderTree aria-hidden />
                  {t('semantic-models:filters.groupBy', 'Group by')}
                </span>
              }
              aria-label={t('semantic-models:filters.groupBy', 'Group by')}
              // Option labels are the dimension noun only: "Group by" is the label
              data={[
                { value: 'none', label: t('semantic-models:filters.groupByNone', 'None') },
                { value: 'scheme', label: t('semantic-models:filters.groupByScheme', 'Scheme') },
                { value: 'source', label: t('semantic-models:filters.groupByDimSource', 'Source') },
                { value: 'domain', label: t('semantic-models:filters.groupByDimDomain', 'Domain') },
              ]}
              value={groupByDimension}
              onChange={(value) => value && onSetGroupByDimension(value as GroupByDimension)}
              allowDeselect={false}
              classNames={{ root: classes.inlineField, label: classes.inlineLabel, wrapper: classes.groupByField }}
            />

            <Switch
              classNames={{ root: classes.option, label: classes.inlineLabel }}
              labelPosition="left"
              label={
                <span className={classes.optionLabel}>
                  <Zap aria-hidden />
                  {t('semantic-models:filters.showProperties')}
                </span>
              }
              aria-label={t('semantic-models:filters.showProperties')}
              checked={showProperties}
              onChange={(e) => onSetShowProperties(e.currentTarget.checked)}
            />

            {/* Show built-in system ontologies (Ontos / ODCS / Databricks, ...) */}
            {onSetShowSystemSources && (
              <Switch
                classNames={{ root: classes.option, label: classes.inlineLabel }}
                labelPosition="left"
                label={
                  <span className={classes.optionLabel}>
                    <Library aria-hidden />
                    {t('semantic-models:filters.showSystemSources', 'Show system ontologies')}
                  </span>
                }
                aria-label={t('semantic-models:filters.showSystemSources', 'Show system ontologies')}
                checked={showSystemSources}
                onChange={(e) => onSetShowSystemSources(e.currentTarget.checked)}
              />
            )}

            {/* Label Language Selector */}
            {availableLanguages.length > 0 && (
              <Select
                label={
                  <span className={classes.optionLabel}>
                    <Languages aria-hidden />
                    {t('semantic-models:filters.labelLanguage', 'Label Language')}
                  </span>
                }
                aria-label={t('semantic-models:filters.labelLanguage', 'Label Language')}
                data={availableLanguages.map((lang) => ({ value: lang, label: getLanguageDisplayName(lang) }))}
                value={selectedLanguage}
                onChange={(value) => value && onSetSelectedLanguage(value)}
                allowDeselect={false}
                classNames={{ root: classes.inlineField, label: classes.inlineLabel, wrapper: classes.languageField }}
              />
            )}
          </div>
        </div>
      </Collapse>

      {/* Delete confirmation */}
      <Dialog
        opened={!!deleteConfirmScheme}
        onClose={() => setDeleteConfirmScheme(null)}
        role="alertdialog"
        size="sm"
        title={t('semantic-models:dialogs.deleteScheme.title', 'Delete Scheme')}
        description={t('semantic-models:dialogs.deleteScheme.description',
          'Are you sure you want to delete "{{label}}"? This will delete all concepts in this scheme and cannot be undone.',
          { label: deleteConfirmScheme?.label || '' }
        )}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteConfirmScheme(null)}>
              {t('common:actions.cancel', 'Cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmScheme && onDeleteScheme) {
                  onDeleteScheme(deleteConfirmScheme);
                  setDeleteConfirmScheme(null);
                }
              }}
            >
              {t('common:actions.delete', 'Delete')}
            </Button>
          </>
        }
      />
    </Pane>
  );
}
