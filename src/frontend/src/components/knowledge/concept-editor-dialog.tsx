import React, { useState, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Input, Loader, Select, TextInput, Textarea } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/mantine/page';
import { badgeToneStyle } from '@/components/common/aura-status';
import { FIELD_CLASSES, HINT_BELOW, SELECT_CLASSES } from '@/components/common/dialog-form';
import form from '@/components/common/dialog-form.module.css';
import ConceptSelectDialog from '@/components/semantic/concept-select-dialog';
import { collectionSourceKey } from '@/lib/collection-source-key';
import { statusTone } from './concept-tones';
import classes from './concept-editor-dialog.module.css';
import {
  OntologyConcept,
  ConceptCreate,
  ConceptUpdate,
  CollectionType,
  KnowledgeCollection,
} from '@/types/ontology';
import {
  Plus,
  X,
  Link2,
  Calendar,
  Shield,
  ArrowUp,
  History,
  Send,
} from 'lucide-react';

interface ConceptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  concept?: OntologyConcept | null; // null = create mode
  collection?: KnowledgeCollection; // Preferred scheme in create mode
  collections?: KnowledgeCollection[]; // Schemes offered in create mode (may be nested)
  onSave: (data: ConceptCreate | ConceptUpdate, isNew: boolean) => Promise<void>;
  onSubmitForReview?: (concept: OntologyConcept) => Promise<void>;
  onPromote?: (concept: OntologyConcept) => void;
  onViewHistory?: (concept: OntologyConcept) => void;
  readOnly?: boolean;
  /** Create mode only: the fixed type of the new entry (e.g. from the Explore
   *  Create menu). Defaults to 'concept'; the dialog never changes it. */
  initialConceptType?: EditorConceptType;
  /** Called from the "no fitting scheme" notice so the caller can open the
   *  scheme editor preset to that kind. The button is hidden without it. */
  onCreateScheme?: (kind: CollectionType) => void;
}

export type EditorConceptType = 'class' | 'concept' | 'property' | 'individual' | 'term';

// Scheme kinds an entry of each type may live in. The type is fixed, so it
// decides which schemes the dialog offers (not the other way round).
const SCHEME_KINDS_BY_TYPE: Record<EditorConceptType, CollectionType[]> = {
  term: ['glossary'],
  concept: ['taxonomy'],
  class: ['ontology'],
  individual: ['ontology'],
  property: ['ontology'],
};

export function schemeKindsForType(type: EditorConceptType): CollectionType[] {
  return SCHEME_KINDS_BY_TYPE[type] ?? ['taxonomy'];
}

// Flatten the (possibly nested) scheme tree into the editable schemes of the
// given kinds. Non-editable schemes are skipped but their children still count.
function fittingSchemes(colls: KnowledgeCollection[], kinds: CollectionType[]): KnowledgeCollection[] {
  const result: KnowledgeCollection[] = [];
  const seen = new Set<string>();
  const visit = (c: KnowledgeCollection) => {
    if (c.is_editable && kinds.includes(c.collection_type) && !seen.has(c.iri)) {
      seen.add(c.iri);
      result.push(c);
    }
    c.child_collections?.forEach(visit);
  };
  colls.forEach(visit);
  return result;
}

// Every scheme in the (possibly nested) tree, once each, editable or not.
function allSchemes(colls: KnowledgeCollection[]): KnowledgeCollection[] {
  const result: KnowledgeCollection[] = [];
  const seen = new Set<string>();
  const visit = (c: KnowledgeCollection) => {
    if (!seen.has(c.iri)) {
      seen.add(c.iri);
      result.push(c);
    }
    c.child_collections?.forEach(visit);
  };
  colls.forEach(visit);
  return result;
}

// Parent field per type. Only listed types show one; the payload field is
// always `broader_iris` and the backend picks the predicate by type
// (class -> rdfs:subClassOf, concept -> skos:broader). Glossary terms stay a
// flat list of agreed terms (hierarchy lives in taxonomies); add a 'term'
// entry here to bring their Parent field back.
const PARENT_FIELD_BY_TYPE: Partial<Record<EditorConceptType, {
  labelKey: string;
  defaultLabel: string;
  addKey: string;
  defaultAdd: string;
}>> = {
  concept: {
    labelKey: 'semantic-models:conceptEditor.parentConcept',
    defaultLabel: 'Parent Concept',
    addKey: 'semantic-models:conceptEditor.addParent',
    defaultAdd: 'Add Parent',
  },
  class: {
    labelKey: 'semantic-models:conceptEditor.subclassOf',
    defaultLabel: 'Subclass of',
    addKey: 'semantic-models:conceptEditor.selectClass',
    defaultAdd: 'Select Class',
  },
};

// Short display name for an IRI (local name after # or the last /).
function iriLocalName(iri: string): string {
  const hash = iri.lastIndexOf('#');
  const tail = hash >= 0 ? iri.slice(hash + 1) : iri.slice(iri.lastIndexOf('/') + 1);
  return tail || iri;
}


export const ConceptEditorDialog: React.FC<ConceptEditorDialogProps> = ({
  open,
  onOpenChange,
  concept,
  collection,
  collections = [],
  onSave,
  onSubmitForReview,
  onPromote,
  onViewHistory,
  readOnly = false,
  initialConceptType,
  onCreateScheme,
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    collection_iri: '',
    label: '',
    definition: '',
    concept_type: 'concept' as 'class' | 'concept' | 'property' | 'individual' | 'term',
    property_type: 'object' as 'datatype' | 'object' | 'annotation',
    domain: '',
    range: '',
    synonyms: [] as string[],
    examples: [] as string[],
    broader_iris: [] as string[],
    narrower_iris: [] as string[],
    related_iris: [] as string[],
  });

  const conceptTypes = [
    { value: 'concept', label: t('semantic-models:types.concept'), description: t('semantic-models:conceptEditor.typeDescriptions.concept') },
    { value: 'class', label: t('semantic-models:types.class'), description: t('semantic-models:conceptEditor.typeDescriptions.class') },
    { value: 'property', label: t('semantic-models:types.property'), description: t('semantic-models:conceptEditor.typeDescriptions.property') },
    { value: 'individual', label: t('semantic-models:types.individual'), description: t('semantic-models:conceptEditor.typeDescriptions.individual') },
    { value: 'term', label: t('semantic-models:types.term'), description: t('semantic-models:conceptEditor.typeDescriptions.term') },
  ];

  const propertyTypes = [
    { value: 'object', label: t('semantic-models:propertyTypes.object'), description: t('semantic-models:conceptEditor.propertyTypeDescriptions.object') },
    { value: 'datatype', label: t('semantic-models:propertyTypes.datatype'), description: t('semantic-models:conceptEditor.propertyTypeDescriptions.datatype') },
    { value: 'annotation', label: t('semantic-models:propertyTypes.annotation'), description: t('semantic-models:conceptEditor.propertyTypeDescriptions.annotation') },
  ];
  const [newSynonym, setNewSynonym] = useState('');
  const [newExample, setNewExample] = useState('');
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  // The picker is Radix (R38) with no trigger: it gives focus back to this
  const parentButton = useRef<HTMLButtonElement>(null);
  const formId = useId();

  const isNew = !concept;
  const canEdit = !readOnly && (!concept?.status || concept.status === 'draft');
  // Create mode: only editable schemes of the kinds the (fixed) type allows.
  // The `collection` prop joins the pool so a preset scheme is always found.
  const schemeKinds = schemeKindsForType(formData.concept_type);
  const schemeOptions = isNew
    ? fittingSchemes(collection ? [collection, ...collections] : collections, schemeKinds)
    : [];
  const schemeOptionKey = schemeOptions.map((c) => c.iri).join('|');
  const noFittingScheme = isNew && schemeOptions.length === 0;
  const typeLabel =
    conceptTypes.find((ct) => ct.value === formData.concept_type)?.label ?? formData.concept_type;
  const parentField = PARENT_FIELD_BY_TYPE[formData.concept_type];
  const showParent = !!parentField;
  // An entry is never its own parent; a class also may not subclass one of
  // its current subclasses (edit mode), which would create a cycle.
  const excludedParentIris = new Set<string>(
    concept
      ? [concept.iri, ...(formData.concept_type === 'class' ? concept.child_concepts || [] : [])]
      : [],
  );
  // The parent picker lists the TARGET scheme only (a hierarchy lives inside
  // its scheme): the picked scheme in create mode, the entry's own scheme
  // when editing. No resolvable key falls back to the unscoped list.
  const schemePool = allSchemes(collection ? [collection, ...collections] : collections);
  const schemeLabels: Record<string, string> = {};
  schemePool.forEach((c) => {
    const key = collectionSourceKey(c);
    if (!(key in schemeLabels)) schemeLabels[key] = c.label;
  });
  const targetScheme = isNew ? schemePool.find((c) => c.iri === formData.collection_iri) : undefined;
  const parentScopeKey = (isNew ? (targetScheme ? collectionSourceKey(targetScheme) : '') : concept?.source_context) || undefined;
  const parentScopeLabel = parentScopeKey ? targetScheme?.label || schemeLabels[parentScopeKey] : undefined;
  // Never offered: self, direct children (deeper descendants are not known
  // here) and parents already chosen.
  const pickerExcludeIris = Array.from(
    new Set([
      ...(concept ? [concept.iri, ...(concept.child_concepts || [])] : []),
      ...formData.broader_iris,
    ]),
  );
  const isClassParent = formData.concept_type === 'class';

  useEffect(() => {
    if (concept) {
      setFormData({
        collection_iri: concept.source_context || '',
        label: concept.label || '',
        definition: concept.comment || '',
        concept_type: (concept.concept_type as any) || 'concept',
        property_type: (concept.property_type as any) || 'object',
        domain: concept.domain || '',
        range: concept.range || '',
        synonyms: concept.synonyms || [],
        examples: concept.examples || [],
        broader_iris: concept.parent_concepts || [],
        narrower_iris: concept.child_concepts || [],
        related_iris: concept.related_concepts || [],
      });
    } else {
      setFormData({
        collection_iri: collection?.iri || '',
        label: '',
        definition: '',
        // Fixed for the dialog's lifetime; it decides which schemes are offered.
        concept_type: initialConceptType || 'concept',
        property_type: 'object',
        domain: '',
        range: '',
        synonyms: [],
        examples: [],
        broader_iris: [],
        narrower_iris: [],
        related_iris: [],
      });
    }
  }, [concept, collection, open, initialConceptType]);

  // Keep the picked scheme valid: the preset `collection` when it fits,
  // otherwise the first fitting scheme (or none). After the reset above, so
  // a reset that empties the scheme is followed by the pick in one commit.
  useEffect(() => {
    if (!isNew) return;
    const iris = schemeOptionKey ? schemeOptionKey.split('|') : [];
    setFormData((prev) => {
      if (iris.includes(prev.collection_iri)) return prev;
      const preferred = collection && iris.includes(collection.iri) ? collection.iri : iris[0] || '';
      return prev.collection_iri === preferred ? prev : { ...prev, collection_iri: preferred };
    });
  }, [isNew, schemeOptionKey, collection, formData.collection_iri]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || noFittingScheme) return;
    
    setIsLoading(true);
    try {
      const baseData = {
        label: formData.label,
        definition: formData.definition || undefined,
        concept_type: formData.concept_type,
        synonyms: formData.synonyms,
        examples: formData.examples,
        broader_iris: formData.broader_iris,
        narrower_iris: formData.narrower_iris,
        related_iris: formData.related_iris,
      };
      
      // Add property-specific fields
      const propertyData = formData.concept_type === 'property' ? {
        property_type: formData.property_type,
        domain: formData.domain || undefined,
        range: formData.range || undefined,
      } : {};
      
      if (isNew) {
        await onSave(
          {
            collection_iri: formData.collection_iri,
            ...baseData,
            ...propertyData,
          } as ConceptCreate,
          true
        );
      } else {
        await onSave(
          {
            ...baseData,
            ...propertyData,
          } as ConceptUpdate,
          false
        );
      }
      onOpenChange(false);
    } catch {
      // The caller reports a failed save (its toast); the editor stays open
    } finally {
      setIsLoading(false);
    }
  };

  const addSynonym = () => {
    if (newSynonym.trim() && !formData.synonyms.includes(newSynonym.trim())) {
      setFormData((prev) => ({
        ...prev,
        synonyms: [...prev.synonyms, newSynonym.trim()],
      }));
      setNewSynonym('');
    }
  };

  const removeSynonym = (syn: string) => {
    setFormData((prev) => ({
      ...prev,
      synonyms: prev.synonyms.filter((s) => s !== syn),
    }));
  };

  const addExample = () => {
    if (newExample.trim() && !formData.examples.includes(newExample.trim())) {
      setFormData((prev) => ({
        ...prev,
        examples: [...prev.examples, newExample.trim()],
      }));
      setNewExample('');
    }
  };

  const removeExample = (ex: string) => {
    setFormData((prev) => ({
      ...prev,
      examples: prev.examples.filter((e) => e !== ex),
    }));
  };

  const title = isNew
    ? t('semantic-models:conceptEditor.createTitle', 'Create Entry')
    : t('semantic-models:conceptEditor.editTitle', 'Edit Entry');
  const removeLabel = (name: string) =>
    t('semantic-models:conceptEditor.removeValue', { defaultValue: 'Remove {{name}}', name });

  return (
    <>
      <Dialog
        opened={open}
        onClose={() => onOpenChange(false)}
        size="lg"
        title={
          <span className={form.titleLine}>
            {title}
            {concept?.status && (
              <Badge variant="outline" style={badgeToneStyle(statusTone(concept.status))}>
                {t(`semantic-models:status.${concept.status}`, concept.status)}
              </Badge>
            )}
          </span>
        }
        description={
          isNew
            ? t('semantic-models:conceptEditor.createDescription', 'Add a new entry to a scheme.')
            : <span className={form.code}>{concept?.iri}</span>
        }
        footer={
          <>
            {/* Action buttons for existing concepts, at the start of the row */}
            {!isNew && concept && (onViewHistory || onPromote || (onSubmitForReview && concept.status === 'draft')) && (
              <div className={classes.footerStart}>
                {onViewHistory && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => onViewHistory(concept)}>
                    <History aria-hidden />
                    {t('semantic-models:conceptEditor.history')}
                  </Button>
                )}
                {onSubmitForReview && concept.status === 'draft' && (
                  <Button type="button" variant="outline" size="sm" onClick={() => onSubmitForReview(concept)}>
                    <Send aria-hidden />
                    {t('semantic-models:conceptEditor.submitForReview')}
                  </Button>
                )}
                {onPromote && (
                  <Button type="button" variant="outline" size="sm" onClick={() => onPromote(concept)}>
                    <ArrowUp aria-hidden />
                    {t('semantic-models:promotion.promote')}
                  </Button>
                )}
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t('common:actions.cancel')}
            </Button>
            {canEdit && (
              // In the footer, outside the form: it submits the form by its id
              <Button type="submit" form={formId} disabled={isLoading || !formData.label || noFittingScheme}>
                {isLoading && <Loader size={12} color="currentColor" />}
                {isNew ? t('common:actions.create') : t('common:actions.save')}
              </Button>
            )}
          </>
        }
      >
        <form id={formId} onSubmit={handleSubmit} className={form.form}>
          {/* Type: fixed (preset on create, the entry's own on edit). */}
          <div className={form.inline} data-testid="concept-type-row">
            <span className={form.muted}>{t('Type')}:</span>
            <Badge variant="outline">{typeLabel}</Badge>
          </div>

          {/* Scheme (for new entries): only schemes that fit the type. */}
          {isNew && !noFittingScheme && (
            <Select
              label={t('semantic-models:conceptEditor.collectionLabel', 'Scheme')}
              placeholder={t('semantic-models:conceptEditor.selectCollectionPlaceholder', 'Select scheme...')}
              data={schemeOptions.map((c) => ({ value: c.iri, label: c.label }))}
              value={formData.collection_iri || null}
              onChange={(value) => value && setFormData((prev) => ({ ...prev, collection_iri: value }))}
              disabled={schemeOptions.length <= 1}
              allowDeselect={false}
              classNames={SELECT_CLASSES}
            />
          )}

          {/* No editable scheme of the right kind: say so instead of an
              empty dropdown, and offer to create one. */}
          {noFittingScheme && (
            <div className={classes.notice} data-testid="no-scheme-notice">
              <p className={form.muted}>
                {t('semantic-models:conceptEditor.noFittingScheme', {
                  defaultValue: 'No editable scheme for this entry type yet ({{kind}}). Create one first.',
                  // Localized kind label (Glossary / Taxonomy / Ontology), not the raw id.
                  kind: t(`semantic-models:collections.${schemeKinds[0]}`),
                })}
              </p>
              {onCreateScheme && (
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => onCreateScheme(schemeKinds[0])}>
                    <Plus aria-hidden />
                    {t('concepts:explore.createScheme', 'New Concept Scheme')}
                  </Button>
                </div>
              )}
            </div>
          )}

          <TextInput
            id="label"
            label={t('semantic-models:conceptEditor.label')}
            value={formData.label}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setFormData((prev) => ({ ...prev, label: value }));
            }}
            placeholder={t('semantic-models:conceptEditor.labelPlaceholder')}
            required
            withAsterisk={false}
            disabled={!canEdit}
            classNames={FIELD_CLASSES}
            data-autofocus
          />

          <Textarea
            id="definition"
            label={t('semantic-models:fields.definition')}
            value={formData.definition}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setFormData((prev) => ({ ...prev, definition: value }));
            }}
            placeholder={t('semantic-models:conceptEditor.definitionPlaceholder')}
            rows={3}
            disabled={!canEdit}
            classNames={FIELD_CLASSES}
          />

          {/* Parent: see PARENT_FIELD_BY_TYPE. Hidden for other types, but
              broader_iris stays in state and in the save payload so existing
              parents of a term, property or individual are kept. */}
          {parentField && (
            <div role="group" aria-labelledby={`${formId}-parent`} className={classes.field} data-testid="parent-field">
              <span id={`${formId}-parent`} className={form.label}>
                {t(parentField.labelKey, parentField.defaultLabel)}
              </span>
              {(formData.broader_iris.length > 0 || !canEdit) && (
                <div className={classes.chips}>
                  {formData.broader_iris.map((iri) => (
                    <Badge key={iri} variant="secondary" className={classes.chip} title={iri}>
                      {iriLocalName(iri)}
                      {canEdit && (
                        <button
                          type="button"
                          className={classes.remove}
                          aria-label={t('semantic-models:conceptEditor.removeParent', { defaultValue: 'Remove {{name}}', name: iriLocalName(iri) })}
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              broader_iris: prev.broader_iris.filter((p) => p !== iri),
                            }))
                          }
                        >
                          <X aria-hidden />
                        </button>
                    )}
                  </Badge>
                ))}
                {formData.broader_iris.length === 0 && !canEdit && <span className={form.muted}>-</span>}
              </div>
              )}
              {canEdit && (
                <div>
                  <Button ref={parentButton} type="button" variant="outline" size="sm" onClick={() => setParentPickerOpen(true)}>
                    <Plus aria-hidden />
                    {t(parentField.addKey, parentField.defaultAdd)}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Property-specific fields: shown for every property. */}
          {formData.concept_type === 'property' && (
            <section className={form.section} aria-labelledby={`${formId}-property`}>
              <h4 id={`${formId}-property`} className={`${form.sectionTitle} ${form.titleLine}`}>
                <Link2 aria-hidden size={14} />
                {t('semantic-models:conceptEditor.propertyConfiguration')}
              </h4>
              <Select
                label={t('semantic-models:conceptEditor.propertyType')}
                placeholder={t('semantic-models:conceptEditor.selectPropertyTypePlaceholder')}
                data={propertyTypes.map((type) => ({ value: type.value, label: type.label }))}
                renderOption={({ option }) => (
                  <div className={classes.option}>
                    <span>{option.label}</span>
                    <span className={classes.optionHint}>
                      {propertyTypes.find((type) => type.value === option.value)?.description}
                    </span>
                  </div>
                )}
                value={formData.property_type}
                onChange={(value) => value && setFormData((prev) => ({ ...prev, property_type: value as typeof prev.property_type }))}
                disabled={!canEdit}
                allowDeselect={false}
                classNames={SELECT_CLASSES}
              />
              <TextInput
                id="domain"
                label={t('semantic-models:fields.domain')}
                description={t('semantic-models:conceptEditor.domainHelp')}
                inputWrapperOrder={HINT_BELOW}
                value={formData.domain}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormData((prev) => ({ ...prev, domain: value }));
                }}
                placeholder={t('semantic-models:conceptEditor.domainPlaceholder')}
                disabled={!canEdit}
                classNames={FIELD_CLASSES}
              />
              <TextInput
                id="range"
                label={t('semantic-models:fields.range')}
                description={
                  formData.property_type === 'datatype'
                    ? t('semantic-models:conceptEditor.rangeDatatypeHelp')
                    : t('semantic-models:conceptEditor.rangeObjectHelp')
                }
                inputWrapperOrder={HINT_BELOW}
                value={formData.range}
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setFormData((prev) => ({ ...prev, range: value }));
                }}
                placeholder={
                  formData.property_type === 'datatype'
                    ? t('semantic-models:conceptEditor.rangeDatatypePlaceholder')
                    : t('semantic-models:conceptEditor.rangeObjectPlaceholder')
                }
                disabled={!canEdit}
                classNames={FIELD_CLASSES}
              />
            </section>
          )}

          {/* Synonyms */}
          <Input.Wrapper
            label={t('semantic-models:fields.synonyms')}
            labelProps={{ htmlFor: `${formId}-synonym` }}
            classNames={FIELD_CLASSES}
            className={formData.concept_type === 'property' ? form.section : undefined}
          >
            {formData.synonyms.length > 0 && (
              <div className={classes.chips}>
                {formData.synonyms.map((syn) => (
                  <Badge key={syn} variant="secondary" className={classes.chip} title={syn}>
                    {syn}
                    {canEdit && (
                      <button type="button" className={classes.remove} aria-label={removeLabel(syn)} onClick={() => removeSynonym(syn)}>
                        <X aria-hidden />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
            )}
            {canEdit && (
              <div className={classes.addRow}>
                <TextInput
                  id={`${formId}-synonym`}
                  className={classes.addInput}
                  value={newSynonym}
                  onChange={(e) => setNewSynonym(e.currentTarget.value)}
                  placeholder={t('semantic-models:conceptEditor.addSynonymPlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSynonym();
                    }
                  }}
                />
                <ActionIcon
                  variant="default"
                  size={28}
                  aria-label={t('semantic-models:conceptEditor.addSynonym', 'Add synonym')}
                  onClick={addSynonym}
                >
                  <Plus aria-hidden size={14} />
                </ActionIcon>
              </div>
            )}
          </Input.Wrapper>

          {/* Examples */}
          <Input.Wrapper
            label={t('semantic-models:fields.examples')}
            labelProps={{ htmlFor: `${formId}-example` }}
            classNames={FIELD_CLASSES}
          >
            {formData.examples.length > 0 && (
              <ul className={classes.examples}>
                {formData.examples.map((ex) => (
                  <li key={ex} className={classes.example}>
                    <span className={classes.exampleText} title={ex}>{ex}</span>
                    {canEdit && (
                      <button type="button" className={classes.remove} aria-label={removeLabel(ex)} onClick={() => removeExample(ex)}>
                        <X aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className={classes.addRow}>
                <TextInput
                  id={`${formId}-example`}
                  className={classes.addInput}
                  value={newExample}
                  onChange={(e) => setNewExample(e.currentTarget.value)}
                  placeholder={t('semantic-models:conceptEditor.addExamplePlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExample();
                    }
                  }}
                />
                <ActionIcon
                  variant="default"
                  size={28}
                  aria-label={t('semantic-models:conceptEditor.addExample', 'Add example')}
                  onClick={addExample}
                >
                  <Plus aria-hidden size={14} />
                </ActionIcon>
              </div>
            )}
          </Input.Wrapper>

          {/* Governance info (for existing concepts) */}
          {!isNew && concept && (concept.certified_at || concept.promotion_type) && (
            <div className={form.section}>
              {concept.certified_at && (
                <div className={`${form.inline} ${form.muted}`}>
                  <span className={form.titleLine}>
                    <Shield aria-hidden size={14} className={classes.certified} />
                    {t('semantic-models:conceptEditor.certified')}: {new Date(concept.certified_at).toLocaleDateString()}
                  </span>
                  {concept.certification_expires_at && (
                    <span className={form.titleLine}>
                      <Calendar aria-hidden size={14} />
                      {t('semantic-models:conceptEditor.expires')}: {new Date(concept.certification_expires_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              )}
              {concept.promotion_type && (
                <div className={`${form.inline} ${form.muted}`}>
                  <ArrowUp aria-hidden size={14} />
                  <span>
                    {concept.promotion_type === 'promoted' ? t('semantic-models:conceptEditor.promotedFrom') : t('semantic-models:conceptEditor.migratedFrom')}:{' '}
                    <span className={form.code}>{concept.source_collection_iri}</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </form>
      </Dialog>

      {/* Mounted only while open: the picker fetches on mount. It stays Radix
          (R38) and opens on top of the kit Dialog. */}
      {showParent && parentPickerOpen && (
        <ConceptSelectDialog
          isOpen={parentPickerOpen}
          onOpenChange={setParentPickerOpen}
          entityType="class"
          // Class parents: classes. Taxonomy parents: SKOS concepts (no terms).
          conceptTypes={isClassParent ? ['class'] : ['concept']}
          scopeSourceKey={parentScopeKey}
          scopeLabel={parentScopeLabel}
          schemeLabels={schemeLabels}
          // Classes may subclass one from another ontology (opt-in).
          allowOtherSchemes={isClassParent}
          excludeIris={pickerExcludeIris}
          returnFocusTo={parentButton}
          title={
            isClassParent
              ? t('semantic-models:conceptEditor.selectSuperclass', 'Select Superclass')
              : t('semantic-models:conceptEditor.selectParentConcept', 'Select Parent Concept')
          }
          searchPlaceholder={
            isClassParent
              ? t('semantic-models:conceptEditor.searchClasses', 'Search classes...')
              : t('semantic-models:conceptEditor.searchConceptsInScheme', 'Search concepts in this scheme...')
          }
          onSelect={(iri) => {
            setFormData((prev) =>
              prev.broader_iris.includes(iri) || excludedParentIris.has(iri)
                ? prev
                : { ...prev, broader_iris: [...prev.broader_iris, iri] },
            );
            setParentPickerOpen(false);
          }}
        />
      )}
    </>
  );
};

export default ConceptEditorDialog;

