import React, { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader, Select, Switch, TextInput, Textarea, Tooltip } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/mantine/page';
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import {
  KnowledgeCollection,
  KnowledgeCollectionCreate,
  KnowledgeCollectionUpdate,
  CollectionType,
  ScopeLevel,
} from '@/types/ontology';
import { buildSchemeOptionGroups } from '@/lib/scheme-select-options';
import { useSchemeSelectData } from './scheme-select-data';
import classes from './collection-editor-dialog.module.css';

// Marker the backend writes as `created_by` on sources it auto-registers as
// collections (bundled / imported ontologies). These are also read-only.
const SYSTEM_CREATED_BY = 'urn:user:system';

// The Parent Scheme field's "None (root scheme)": a Select needs a value of its own
const ROOT = '_none';

const SCOPES: ScopeLevel[] = ['enterprise', 'domain', 'department', 'team', 'project', 'external'];
const TYPES: CollectionType[] = ['glossary', 'taxonomy', 'ontology'];

/** True when a scheme may be offered as a parent: editable and not a system source. */
export function isNestableParent(c: KnowledgeCollection): boolean {
  return c.is_editable === true && c.created_by !== SYSTEM_CREATED_BY;
}

interface CollectionEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: KnowledgeCollection | null; // null = create mode
  collections?: KnowledgeCollection[]; // For parent selection
  onSave: (data: KnowledgeCollectionCreate | KnowledgeCollectionUpdate, isNew: boolean) => Promise<void>;
  /** Create mode only: preselect the scheme Type (e.g. from a "no fitting
   *  scheme" notice). Defaults to glossary. */
  initialCollectionType?: CollectionType;
}

/**
 * Create or edit a concept scheme (a collection): Define's Author card,
 * Collections' Create and Edit, and Explore's New Concept Scheme. On the kit
 * Dialog since wave 2 Task 12a, with Mantine fields.
 */
export const CollectionEditorDialog: React.FC<CollectionEditorDialogProps> = ({
  open,
  onOpenChange,
  collection,
  collections = [],
  onSave,
  initialCollectionType,
}) => {
  const { t } = useTranslation(['semantic-models', 'common']);
  const formId = useId();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    label: '',
    description: '',
    collection_type: 'glossary' as CollectionType,
    scope_level: 'enterprise' as ScopeLevel,
    parent_collection_iri: '',
    is_editable: true,
  });

  const isNew = !collection;

  useEffect(() => {
    if (collection) {
      setFormData({
        label: collection.label || '',
        description: collection.description || '',
        collection_type: collection.collection_type,
        scope_level: collection.scope_level,
        parent_collection_iri: collection.parent_collection_iri || '',
        is_editable: collection.is_editable,
      });
    } else {
      setFormData({
        label: '',
        description: '',
        collection_type: initialCollectionType || 'glossary',
        scope_level: 'enterprise',
        parent_collection_iri: '',
        is_editable: true,
      });
    }
  }, [collection, open, initialCollectionType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const data = {
        label: formData.label,
        description: formData.description || undefined,
        collection_type: isNew ? formData.collection_type : undefined,
        scope_level: formData.scope_level,
        parent_collection_iri: formData.parent_collection_iri || undefined,
        is_editable: formData.is_editable,
      };
      await onSave(data, isNew);
      onOpenChange(false);
    } catch {
      // The caller reports a failed save (its toast); the editor stays open
    } finally {
      setIsLoading(false);
    }
  };

  // Parent options. Only schemes the user can actually nest under are
  // offered: editable, not system/bundled, and not the scheme being edited.
  // Each scheme is judged on its own, so a qualifying child of a skipped
  // parent is still listed.
  const parentOptionGroups = useMemo(
    () =>
      buildSchemeOptionGroups(collections, {
        include: (c) => isNestableParent(c) && c.iri !== collection?.iri,
      }),
    [collections, collection?.iri],
  );
  const rootLabel = t('semantic-models:collectionEditor.noneRootCollection', 'None (root scheme)');
  const leading = useMemo(() => [{ value: ROOT, label: rootLabel }], [rootLabel]);
  const parentSelect = useSchemeSelectData(parentOptionGroups, leading);

  const typeOptions = TYPES.map((type) => ({ value: type, label: t(`semantic-models:collections.${type}`) }));
  const scopeOptions = SCOPES.map((scope) => ({ value: scope, label: t(`semantic-models:scopes.${scope}`) }));

  const typeTip = t(
    'collection.typeTooltip',
    'Glossary, taxonomy, and ontology are points on a maturity ladder, not different tools. Glossary = a flat list of agreed terms and definitions. Taxonomy = terms arranged in a broader/narrower hierarchy. Ontology = formal classes and properties a machine can reason over. Pick where you are today; you can add structure later.',
  );
  const editableHint = t('semantic-models:collectionEditor.editableHelp', 'Allow creating and editing concepts in this scheme');

  return (
    <Dialog
      opened={open}
      onClose={() => onOpenChange(false)}
      size="sm"
      title={isNew ? t('Create scheme', 'Create Scheme') : t('Edit scheme', 'Edit Scheme')}
      description={
        isNew
          ? t('Create a new concept scheme. Start simple as a glossary; you can add structure later.')
          : t('Update scheme settings.')
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {t('common:actions.cancel')}
          </Button>
          {/* In the footer, outside the form: it submits the form by its id */}
          <Button type="submit" form={formId} disabled={isLoading || !formData.label}>
            {isLoading && <Loader size={12} color="currentColor" />}
            {isNew ? t('common:actions.create') : t('common:actions.save')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className={form.form}>
        <TextInput
          label={t('common:labels.name')}
          value={formData.label}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setFormData((prev) => ({ ...prev, label: value }));
          }}
          placeholder={t('semantic-models:collectionEditor.namePlaceholder', 'e.g., Finance Glossary')}
          required
          withAsterisk={false}
          classNames={FIELD_CLASSES}
          data-autofocus
        />

        <Textarea
          label={t('common:labels.description')}
          value={formData.description}
          onChange={(e) => {
            const value = e.currentTarget.value;
            setFormData((prev) => ({ ...prev, description: value }));
          }}
          placeholder={t('semantic-models:collectionEditor.descriptionPlaceholder', 'Optional description...')}
          rows={3}
          classNames={FIELD_CLASSES}
        />

        {/* Scheme Type (only for new) */}
        {isNew && (
          <Select
            label={
              <span className={classes.labelLine}>
                {t('Type')}
                <Tooltip
                  label={typeTip}
                  multiline
                  w={280}
                  events={{ hover: true, focus: true, touch: false }}
                >
                  <span
                    role="img"
                    className={classes.info}
                    tabIndex={0}
                    aria-label={t('semantic-models:collectionEditor.typeInfo', 'About scheme types')}
                  >
                    i
                  </span>
                </Tooltip>
              </span>
            }
            // The field's own name, without the info mark's
            aria-label={t('Type')}
            data={typeOptions}
            value={formData.collection_type}
            onChange={(value) => value && setFormData((prev) => ({ ...prev, collection_type: value as CollectionType }))}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />
        )}

        <Select
          label={t('semantic-models:fields.scope')}
          data={scopeOptions}
          value={formData.scope_level}
          onChange={(value) => value && setFormData((prev) => ({ ...prev, scope_level: value as ScopeLevel }))}
          allowDeselect={false}
          classNames={SELECT_CLASSES}
        />

        <Select
          label={t('semantic-models:collectionEditor.parentCollection', 'Parent Scheme')}
          data={parentSelect.data}
          renderOption={parentSelect.renderOption}
          value={formData.parent_collection_iri || ROOT}
          onChange={(value) =>
            value && setFormData((prev) => ({ ...prev, parent_collection_iri: value === ROOT ? '' : value }))
          }
          allowDeselect={false}
          classNames={SELECT_CLASSES}
        />

        {/* Editable Toggle: its label and hint, the switch at the end */}
        <div className={form.toggle}>
          <div>
            <label htmlFor={`${formId}-editable`} className={form.toggleLabel}>
              {t('semantic-models:collectionEditor.editable')}
            </label>
            <p id={`${formId}-editable-hint`} className={form.hint}>{editableHint}</p>
          </div>
          <Switch
            id={`${formId}-editable`}
            aria-describedby={`${formId}-editable-hint`}
            checked={formData.is_editable}
            onChange={(e) => {
              const checked = e.currentTarget.checked;
              setFormData((prev) => ({ ...prev, is_editable: checked }));
            }}
          />
        </div>
      </form>
    </Dialog>
  );
};

export default CollectionEditorDialog;
