import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Menu, Tooltip, UnstyledButton } from '@mantine/core';
import {
  KnowledgeCollection,
  CollectionType,
} from '@/types/ontology';
import {
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
  Book,
  Network,
  GitBranch,
  Lock,
  Pencil,
  Plus,
  MoreVertical,
  Import,
  Download,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import classes from './collection-tree.module.css';

// A scheme tree (wave 2 Task 12a: Mantine and collection-tree.module.css).
// Exported from components/knowledge, though no page renders it today.

interface CollectionTreeProps {
  collections: KnowledgeCollection[];
  selectedCollection?: string;
  onSelectCollection: (collection: KnowledgeCollection) => void;
  onCreateCollection?: () => void;
  onEditCollection?: (collection: KnowledgeCollection) => void;
  onDeleteCollection?: (collection: KnowledgeCollection) => void;
  onImportToCollection?: (collection: KnowledgeCollection) => void;
  onExportCollection?: (collection: KnowledgeCollection) => void;
  canEdit?: boolean;
}

interface CollectionNodeProps {
  collection: KnowledgeCollection;
  level: number;
  selectedCollection?: string;
  onSelectCollection: (collection: KnowledgeCollection) => void;
  onEditCollection?: (collection: KnowledgeCollection) => void;
  onDeleteCollection?: (collection: KnowledgeCollection) => void;
  onImportToCollection?: (collection: KnowledgeCollection) => void;
  onExportCollection?: (collection: KnowledgeCollection) => void;
  canEdit?: boolean;
  expandedCollections: Set<string>;
  toggleExpand: (iri: string) => void;
}

const getCollectionIcon = (type: CollectionType, isExpanded: boolean) => {
  switch (type) {
    case 'glossary':
      return isExpanded
        ? <FolderOpen aria-hidden className={classes.icon} data-type="glossary" />
        : <Folder aria-hidden className={classes.icon} data-type="glossary" />;
    case 'taxonomy':
      return <GitBranch aria-hidden className={classes.icon} data-type="taxonomy" />;
    case 'ontology':
      return <Network aria-hidden className={classes.icon} data-type="ontology" />;
    default:
      return <Book aria-hidden className={classes.icon} />;
  }
};

const CollectionNode: React.FC<CollectionNodeProps> = ({
  collection,
  level,
  selectedCollection,
  onSelectCollection,
  onEditCollection,
  onDeleteCollection,
  onImportToCollection,
  onExportCollection,
  canEdit,
  expandedCollections,
  toggleExpand,
}) => {
  const { t } = useTranslation(['semantic-models', 'common']);
  const isExpanded = expandedCollections.has(collection.iri);
  const isSelected = selectedCollection === collection.iri;
  const hasChildren = collection.child_collections && collection.child_collections.length > 0;

  const handleClick = () => {
    onSelectCollection(collection);
    if (hasChildren) {
      toggleExpand(collection.iri);
    }
  };

  return (
    <div>
      <div
        className={classes.row}
        data-selected={isSelected || undefined}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/Collapse button */}
        <span className={classes.toggleSlot}>
          {hasChildren && (
            <UnstyledButton
              className={classes.toggle}
              aria-label={t(isExpanded ? 'semantic-models:collectionTree.collapse' : 'semantic-models:collectionTree.expand', { name: collection.label })}
              aria-expanded={isExpanded}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(collection.iri);
              }}
            >
              {isExpanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
            </UnstyledButton>
          )}
        </span>

        {/* Collection Icon */}
        {getCollectionIcon(collection.collection_type, isExpanded)}

        {/* Label and badges */}
        <span className={classes.labelLine}>
          <span className={classes.label} title={collection.label}>
            {collection.label}
          </span>

          {/* Editable indicator */}
          {!collection.is_editable && (
            <Tooltip label={t('semantic-models:collectionTree.readOnly')} events={{ hover: true, focus: true, touch: false }}>
              <Lock role="img" aria-label={t('semantic-models:collectionTree.readOnly')} className={classes.lock} />
            </Tooltip>
          )}

          {/* Source type badge for imported */}
          {collection.source_type === 'imported' && (
            <Badge variant="outline">{t('semantic-models:badges.imported')}</Badge>
          )}

          {/* Concept count */}
          <Badge variant="secondary" className={classes.count}>
            {collection.concept_count}
          </Badge>
        </span>

        {/* Action menu */}
        {canEdit && (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                className={classes.menuButton}
                aria-label={t('semantic-models:collections.actionsFor', { defaultValue: 'Actions for {{name}}', name: collection.label })}
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
              {collection.is_editable && onEditCollection && (
                <Menu.Item leftSection={<Pencil aria-hidden />} onClick={() => onEditCollection(collection)}>
                  {t('common:actions.edit')}
                </Menu.Item>
              )}
              {onExportCollection && (
                <Menu.Item leftSection={<Download aria-hidden />} onClick={() => onExportCollection(collection)}>
                  {t('common:actions.export')}
                </Menu.Item>
              )}
              {collection.is_editable && onImportToCollection && (
                <Menu.Item leftSection={<Import aria-hidden />} onClick={() => onImportToCollection(collection)}>
                  {t('common:actions.import')}
                </Menu.Item>
              )}
              {collection.is_editable && collection.source_type === 'custom' && onDeleteCollection && (
                <>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<Trash2 aria-hidden />} onClick={() => onDeleteCollection(collection)}>
                    {t('common:actions.delete')}
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {collection.child_collections.map((child) => (
            <CollectionNode
              key={child.iri}
              collection={child}
              level={level + 1}
              selectedCollection={selectedCollection}
              onSelectCollection={onSelectCollection}
              onEditCollection={onEditCollection}
              onDeleteCollection={onDeleteCollection}
              onImportToCollection={onImportToCollection}
              onExportCollection={onExportCollection}
              canEdit={canEdit}
              expandedCollections={expandedCollections}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CollectionTree: React.FC<CollectionTreeProps> = ({
  collections,
  selectedCollection,
  onSelectCollection,
  onCreateCollection,
  onEditCollection,
  onDeleteCollection,
  onImportToCollection,
  onExportCollection,
  canEdit = false,
}) => {
  const { t } = useTranslation(['semantic-models', 'common']);
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(collections.map((c) => c.iri)) // Start with all expanded
  );

  const toggleExpand = useCallback((iri: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev);
      if (next.has(iri)) {
        next.delete(iri);
      } else {
        next.add(iri);
      }
      return next;
    });
  }, []);

  return (
    <div className={classes.tree}>
      {/* Header with Create button */}
      {canEdit && onCreateCollection && (
        <div className={classes.head}>
          <span className={classes.headTitle}>{t('semantic-models:collections.title')}</span>
          <ActionIcon
            variant="subtle"
            className={classes.menuButton}
            aria-label={t('semantic-models:actions.createCollection')}
            onClick={onCreateCollection}
          >
            <Plus aria-hidden />
          </ActionIcon>
        </div>
      )}

      {/* Tree */}
      <div className={classes.body}>
        {collections.length === 0 ? (
          <div className={classes.empty}>
            <Folder aria-hidden className={classes.emptyIcon} />
            <p>{t('semantic-models:collectionTree.noCollectionsYet')}</p>
            {canEdit && onCreateCollection && (
              <Button variant="outline" size="sm" onClick={onCreateCollection}>
                <Plus aria-hidden />
                {t('semantic-models:actions.createCollection')}
              </Button>
            )}
          </div>
        ) : (
          collections.map((collection) => (
            <CollectionNode
              key={collection.iri}
              collection={collection}
              level={0}
              selectedCollection={selectedCollection}
              onSelectCollection={onSelectCollection}
              onEditCollection={onEditCollection}
              onDeleteCollection={onDeleteCollection}
              onImportToCollection={onImportToCollection}
              onExportCollection={onExportCollection}
              canEdit={canEdit}
              expandedCollections={expandedCollections}
              toggleExpand={toggleExpand}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default CollectionTree;

