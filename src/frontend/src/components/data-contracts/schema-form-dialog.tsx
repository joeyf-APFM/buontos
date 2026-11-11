import { useEffect, useId, useRef, useState } from 'react'
import { Select, TextInput, Textarea } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/mantine/page'
import { useOpenerRef } from '@/components/common/use-opener-ref'
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'
import classes from './contract-form-dialogs.module.css'
import { Plus, Trash2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useTranslation } from 'react-i18next'
import SchemaPropertyEditor, { type SchemaPropertyEditorHandle } from './schema-property-editor'
import BusinessConceptsDisplay from '@/components/business-concepts/business-concepts-display'
import type { SchemaObject, ColumnProperty, SchemaRelationship } from '@/types/data-contract'

type SchemaFormProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (schema: SchemaObject) => Promise<void>
  initial?: SchemaObject
}

const PHYSICAL_TYPES = ['table', 'view', 'materialized_view', 'external_table', 'managed_table', 'streaming_table']
const RELATIONSHIP_TYPES = ['foreignKey', 'reference']

/** A relationship's end, as text */
const endText = (end: unknown) => (typeof end === 'string' ? end : JSON.stringify(end))

export default function SchemaFormDialog({ isOpen, onOpenChange, onSubmit, initial }: SchemaFormProps) {
  const { toast } = useToast()
  const { t } = useTranslation(['data-contracts', 'common'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Focus goes back to the opener only if free: a 409 hands it to the version prompt
  const opener = useOpenerRef(isOpen)
  const propertyEditorRef = useRef<SchemaPropertyEditorHandle | null>(null)
  const conceptsLabelId = useId()
  const infoLabelId = useId()
  const relationshipsLabelId = useId()

  // Schema-level fields
  const [name, setName] = useState('')
  const [physicalName, setPhysicalName] = useState('')
  const [description, setDescription] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [physicalType, setPhysicalType] = useState('table')
  const [dataGranularityDescription, setDataGranularityDescription] = useState('')

  // Properties (columns)
  const [properties, setProperties] = useState<ColumnProperty[]>([])
  const [schemaSemanticConcepts, setSchemaSemanticConcepts] = useState<{ iri: string; label?: string }[]>([])

  // Schema-level relationships (ODCS v3.1.0)
  const [schemaRelationships, setSchemaRelationships] = useState<SchemaRelationship[]>([])
  const [newRelFrom, setNewRelFrom] = useState('')
  const [newRelTo, setNewRelTo] = useState('')
  const [newRelType, setNewRelType] = useState('foreignKey')

  // Initialize form when dialog opens
  useEffect(() => {
    if (isOpen && initial) {
      setName(initial.name || '')
      setPhysicalName(initial.physicalName || '')
      setDescription(initial.description || '')
      setBusinessName(initial.businessName || '')
      setPhysicalType(initial.physicalType || 'table')
      setDataGranularityDescription(initial.dataGranularityDescription || '')
      // Normalize legacy snake_case fields coming from backend or older drafts
      const normalizedProps = (initial.properties || []).map((p: any) => ({
        ...p,
        logicalType: p.logicalType || p.logical_type || 'string',
        physicalType: p.physicalType || p.physical_type,
        primaryKey: p.primaryKey ?? p.primary_key,
        primaryKeyPosition: p.primaryKeyPosition ?? p.primary_key_position,
        partitionKeyPosition: p.partitionKeyPosition ?? p.partition_key_position,
      }))
      setProperties(normalizedProps)
      // Load semantics
      const concepts = (initial as any).semanticConcepts as { iri: string; label?: string }[] | undefined
      if (concepts && Array.isArray(concepts)) {
        setSchemaSemanticConcepts(concepts)
      } else if (initial.authoritativeDefinitions && initial.authoritativeDefinitions.length > 0) {
        setSchemaSemanticConcepts(initial.authoritativeDefinitions.map(def => ({ iri: (def as any).url })))
      } else {
        setSchemaSemanticConcepts([])
      }
      setSchemaRelationships(initial.relationships || [])
    } else if (isOpen && !initial) {
      // Reset for new schema
      setName('')
      setPhysicalName('')
      setDescription('')
      setBusinessName('')
      setPhysicalType('table')
      setDataGranularityDescription('')
      setProperties([])
      setSchemaSemanticConcepts([])
      setSchemaRelationships([])
      setNewRelFrom('')
      setNewRelTo('')
      setNewRelType('foreignKey')
    }
  }, [isOpen, initial])

  const handleSubmit = async () => {
    // Validate
    if (!name.trim()) {
      toast({ title: t('data-contracts:schema.toast.validationError', 'Validation Error'), description: t('data-contracts:schema.toast.nameRequired', 'Schema name is required'), variant: 'destructive' })
      return
    }

    const propsToUse = propertyEditorRef.current?.getPropertiesForSubmit?.() ?? properties
    if (propsToUse.length === 0) {
      toast({ title: t('data-contracts:schema.toast.validationError', 'Validation Error'), description: t('data-contracts:schema.toast.columnRequired', 'At least one column is required'), variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const schema: SchemaObject = {
        name: name.trim(),
        physicalName: physicalName.trim() || undefined,
        description: description.trim() || undefined,
        businessName: businessName.trim() || undefined,
        physicalType: physicalType || undefined,
        dataGranularityDescription: dataGranularityDescription.trim() || undefined,
        properties: propsToUse,
        authoritativeDefinitions: schemaSemanticConcepts.length > 0 ? schemaSemanticConcepts.map(c => ({ url: c.iri, type: 'http://databricks.com/ontology/uc/semanticAssignment' })) : undefined,
        // @ts-ignore retain local concepts for further editing flows
        semanticConcepts: schemaSemanticConcepts.length > 0 ? schemaSemanticConcepts : undefined,
        relationships: schemaRelationships.length > 0 ? schemaRelationships : undefined,
      }

      await onSubmit(schema)
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: t('common:toast.error', 'Error'),
        description: error?.message || t('data-contracts:schema.toast.saveError', 'Failed to save schema'),
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      returnFocusTo={opener}
      size="xl"
      title={initial ? t('data-contracts:schema.editTitle', 'Edit Schema') : t('data-contracts:schema.addTitle', 'Add New Schema')}
      description={t('data-contracts:schema.description', 'Define a schema object (table/view) and its properties (columns).')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('data-contracts:schemaEditor.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving') : initial ? t('common:actions.saveChanges') : t('data-contracts:schemaEditor.addSchema')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        {/* Schema-level fields */}
        <section aria-labelledby={infoLabelId} className={form.form}>
          <h3 id={infoLabelId} className={form.sectionTitle}>{t('data-contracts:schema.sections.information', 'Schema Information')}</h3>

          <div className={form.row}>
            <TextInput
              id="name"
              label={t('common:labels.name', 'Name')}
              required
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder={t('data-contracts:schema.fields.namePlaceholder', 'e.g., customers')}
              classNames={FIELD_CLASSES}
            />
            <TextInput
              id="physicalName"
              label={t('data-contracts:schema.fields.physicalName', 'Physical Name')}
              value={physicalName}
              onChange={(e) => setPhysicalName(e.currentTarget.value)}
              placeholder={t('data-contracts:schema.fields.physicalNamePlaceholder', 'e.g., catalog.schema.customers')}
              classNames={FIELD_CLASSES}
            />
          </div>

          <div className={form.row}>
            <TextInput
              id="businessName"
              label={t('data-contracts:schema.fields.businessName', 'Business Name')}
              value={businessName}
              onChange={(e) => setBusinessName(e.currentTarget.value)}
              placeholder={t('data-contracts:schema.fields.businessNamePlaceholder', 'Human-readable name')}
              classNames={FIELD_CLASSES}
            />
            <Select
              id="physicalType"
              label={t('data-contracts:schema.fields.physicalType', 'Physical Type')}
              data={PHYSICAL_TYPES}
              value={physicalType}
              onChange={(value) => value && setPhysicalType(value)}
              allowDeselect={false}
              classNames={SELECT_CLASSES}
            />
          </div>

          <Textarea
            id="description"
            label={t('common:labels.description', 'Description')}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            placeholder={t('data-contracts:schema.fields.descriptionPlaceholder', 'Describe this schema')}
            autosize
            minRows={2}
            maxRows={8}
            classNames={FIELD_CLASSES}
          />

          <TextInput
            id="dataGranularityDescription"
            label={t('data-contracts:schema.fields.dataGranularity', 'Data Granularity')}
            value={dataGranularityDescription}
            onChange={(e) => setDataGranularityDescription(e.currentTarget.value)}
            placeholder={t('data-contracts:schema.fields.dataGranularityPlaceholder', 'e.g., One row per customer')}
            classNames={FIELD_CLASSES}
          />
        </section>

        {/* Schema-level Business Concepts */}
        <div role="group" aria-labelledby={conceptsLabelId} className={form.form}>
          <h3 id={conceptsLabelId} className={form.sectionTitle}>{t('data-contracts:schema.sections.businessConcepts', 'Business Concepts')}</h3>
          <BusinessConceptsDisplay
            concepts={schemaSemanticConcepts}
            onConceptsChange={setSchemaSemanticConcepts}
            entityType="data_contract_schema"
            entityId={name || 'schema'}
            conceptType="class"
            entityName={name || undefined}
          />
        </div>

        {/* Unity Catalog Metadata (read-only, shown when present) */}
        {initial && (initial.tableType || initial.owner || initial.createdAt || initial.updatedAt || initial.tableProperties) && (
          <section className={form.section}>
            <h3 className={form.sectionTitle}>{t('data-contracts:schema.sections.ucMetadata', 'Unity Catalog Metadata (Read-Only)')}</h3>

            {(initial.tableType || initial.owner) && (
              <div className={form.row}>
                {initial.tableType && (
                  <TextInput label={t('data-contracts:schema.fields.tableType', 'Table Type')} value={initial.tableType} disabled classNames={FIELD_CLASSES} />
                )}
                {initial.owner && (
                  <TextInput label={t('common:labels.owner', 'Owner')} value={initial.owner} disabled classNames={FIELD_CLASSES} />
                )}
              </div>
            )}

            {(initial.createdAt || initial.updatedAt) && (
              <div className={form.row}>
                {initial.createdAt && (
                  <TextInput label={t('common:labels.createdAt', 'Created At')} value={initial.createdAt} disabled classNames={FIELD_CLASSES} />
                )}
                {initial.updatedAt && (
                  <TextInput label={t('common:labels.updatedAt', 'Updated At')} value={initial.updatedAt} disabled classNames={FIELD_CLASSES} />
                )}
              </div>
            )}

            {initial.tableProperties && Object.keys(initial.tableProperties).length > 0 && (
              <div>
                <div className={form.label}>{t('data-contracts:schema.fields.tableProperties', 'Table Properties')}</div>
                <dl className={classes.properties}>
                  {Object.entries(initial.tableProperties).map(([key, value]) => (
                    <div key={key} className={classes.propertyLine}>
                      <dt>{key}:</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>
        )}

        {/* Properties section */}
        <section className={form.section}>
          <h3 className={form.sectionTitle}>
            {t('data-contracts:schema.sections.properties', 'Properties (Columns)')} <span className={form.error}>*</span>
          </h3>

          <SchemaPropertyEditor
            ref={propertyEditorRef}
            properties={properties}
            onChange={setProperties}
          />
        </section>

        {/* Schema-level Relationships (ODCS v3.1.0) */}
        <section aria-labelledby={relationshipsLabelId} className={form.section}>
          <div className={classes.sectionHead}>
            <h3 id={relationshipsLabelId} className={form.sectionTitle}>{t('data-contracts:schema.sections.relationships', 'Relationships (Foreign Keys)')}</h3>
            {schemaRelationships.length > 0 && (
              <Badge variant="secondary">{schemaRelationships.length}</Badge>
            )}
          </div>

          {schemaRelationships.length > 0 && (
            <ul className={classes.list}>
              {schemaRelationships.map((rel, idx) => (
                <li key={idx} className={classes.listRow}>
                  <span className={classes.relationship}>
                    <Badge variant="outline">{rel.type}</Badge>
                    <span className={classes.mono}>{endText(rel.from)}</span>
                    <span className={classes.arrow} aria-hidden>→</span>
                    <span className={classes.mono}>{endText(rel.to)}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSchemaRelationships(schemaRelationships.filter((_, i) => i !== idx))}
                    aria-label={t('data-contracts:schema.relationships.remove', 'Remove relationship {{from}} → {{to}}', { from: endText(rel.from), to: endText(rel.to) })}
                  >
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className={classes.addBox}>
            <div className={classes.addFields}>
              <TextInput
                label={t('data-contracts:schema.relationships.from', 'From (local column)')}
                value={newRelFrom}
                onChange={(e) => setNewRelFrom(e.currentTarget.value)}
                placeholder={t('data-contracts:schema.relationships.fromPlaceholder', 'e.g., customer_id')}
                classNames={{ ...FIELD_CLASSES, input: classes.monoInput }}
              />
              <TextInput
                label={t('data-contracts:schema.relationships.to', 'To (target reference)')}
                value={newRelTo}
                onChange={(e) => setNewRelTo(e.currentTarget.value)}
                placeholder={t('data-contracts:schema.relationships.toPlaceholder', 'e.g., schema.table.column')}
                classNames={{ ...FIELD_CLASSES, input: classes.monoInput }}
              />
              <Select
                label={t('common:labels.type', 'Type')}
                data={RELATIONSHIP_TYPES}
                value={newRelType}
                onChange={(value) => value && setNewRelType(value)}
                allowDeselect={false}
                classNames={SELECT_CLASSES}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!newRelFrom.trim() || !newRelTo.trim()}
              onClick={() => {
                setSchemaRelationships([...schemaRelationships, { type: newRelType, from: newRelFrom.trim(), to: newRelTo.trim() }])
                setNewRelFrom('')
                setNewRelTo('')
                setNewRelType('foreignKey')
              }}
            >
              <Plus size={12} aria-hidden />
              {t('data-contracts:schema.relationships.add', 'Add Relationship')}
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  )
}
