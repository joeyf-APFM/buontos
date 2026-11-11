import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select, TextInput, Textarea } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { Dialog } from '@/mantine/page'
import { FIELD_CLASSES, SELECT_CLASSES } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'
import classes from './contract-form-dialogs.module.css'
import type { ServerConfig } from '@/types/data-contract'

type ServerConfigFormProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (server: ServerConfig) => Promise<void>
  initial?: ServerConfig
}

const SERVER_TYPES = [
  'api', 'athena', 'azure', 'bigquery', 'clickhouse', 'databricks', 'denodo', 'dremio',
  'duckdb', 'glue', 'cloudsql', 'db2', 'informix', 'kafka', 'kinesis', 'local',
  'mysql', 'oracle', 'postgresql', 'postgres', 'presto', 'pubsub',
  'redshift', 's3', 'sftp', 'snowflake', 'sqlserver', 'synapse', 'trino', 'vertica', 'custom'
]

const ENVIRONMENTS = ['production', 'staging', 'development', 'test']

/** Adds the typed key as a property with no value, unless it's empty or already there; then clears the field. */
const addKey = (input: HTMLInputElement | null, properties: Record<string, string>, setProperties: (next: Record<string, string>) => void) => {
  const key = input?.value.trim()
  if (input && key && !properties[key]) {
    setProperties({ ...properties, [key]: '' })
    input.value = ''
  }
}

export default function ServerConfigFormDialog({ isOpen, onOpenChange, onSubmit, initial }: ServerConfigFormProps) {
  const { t } = useTranslation(['data-contracts', 'common'])
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const propertiesLabelId = useId()

  const [server, setServer] = useState('')
  const [type, setType] = useState('databricks')
  const [description, setDescription] = useState('')
  const [environment, setEnvironment] = useState('production')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('')
  const [database, setDatabase] = useState('')
  const [schema, setSchema] = useState('')
  const [location, setLocation] = useState('')
  const [properties, setProperties] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen && initial) {
      setServer(initial.server || '')
      setType(initial.type || 'databricks')
      setDescription(initial.description || '')
      setEnvironment(initial.environment || 'production')
      setHost(initial.host || '')
      setPort(initial.port?.toString() || '')
      setDatabase(initial.database || '')
      setSchema(initial.schema || '')
      setLocation(initial.location || '')
      setProperties(initial.properties || {})
    } else if (isOpen && !initial) {
      setServer('')
      setType('databricks')
      setDescription('')
      setEnvironment('production')
      setHost('')
      setPort('')
      setDatabase('')
      setSchema('')
      setLocation('')
      setProperties({})
    }
  }, [isOpen, initial])

  const handleSubmit = async () => {
    if (!server.trim()) {
      toast({ title: t('data-contracts:serverConfig.validationError', 'Validation Error'), description: t('data-contracts:serverConfig.nameRequired', 'Server name is required'), variant: 'destructive' })
      return
    }

    setIsSubmitting(true)
    try {
      const serverConfig: ServerConfig = {
        // Keep the ODCS id of an edited server, so the export still carries it
        id: initial?.id || undefined,
        server: server.trim(),
        type: type || undefined,
        description: description.trim() || undefined,
        environment: environment || undefined,
        host: host.trim() || undefined,
        port: port ? parseInt(port, 10) : undefined,
        database: database.trim() || undefined,
        schema: schema.trim() || undefined,
        location: location.trim() || undefined,
        properties: Object.keys(properties).length > 0 ? properties : undefined,
      }

      await onSubmit(serverConfig)
      onOpenChange(false)
    } catch (error: any) {
      toast({
        title: t('common:toast.error'),
        description: error?.message || t('data-contracts:serverConfig.saveError', 'Failed to save server configuration'),
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
      size="lg"
      title={initial ? t('data-contracts:serverConfig.editTitle', 'Edit Server Configuration') : t('data-contracts:serverConfig.addTitle', 'Add Server Configuration')}
      description={t('data-contracts:serverConfig.description', 'Define server/connection details for this data contract.')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? t('common:actions.saving') : initial ? t('common:actions.saveChanges') : t('data-contracts:serverConfig.addButton', 'Add Server')}
          </Button>
        </>
      }
    >
      <div className={form.form}>
        <TextInput
          id="server"
          label={t('data-contracts:serverConfig.nameLabel', 'Server Name')}
          required
          value={server}
          onChange={(e) => setServer(e.currentTarget.value)}
          placeholder={t('data-contracts:serverConfig.namePlaceholder', 'e.g., prod-databricks')}
          classNames={FIELD_CLASSES}
        />

        <div className={form.row}>
          <Select
            id="type"
            label={t('common:labels.type')}
            data={SERVER_TYPES}
            value={type}
            onChange={(value) => value && setType(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />
          <Select
            id="environment"
            label={t('data-contracts:serverConfig.environmentLabel', 'Environment')}
            data={ENVIRONMENTS}
            value={environment}
            onChange={(value) => value && setEnvironment(value)}
            allowDeselect={false}
            classNames={SELECT_CLASSES}
          />
        </div>

        <Textarea
          id="description"
          label={t('common:labels.description')}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          placeholder={t('data-contracts:serverConfig.descriptionPlaceholder', 'Describe this server configuration')}
          autosize
          minRows={2}
          maxRows={8}
          classNames={FIELD_CLASSES}
        />

        <div className={classes.wideNarrow}>
          <TextInput
            id="host"
            label={t('data-contracts:serverConfig.hostLabel', 'Host')}
            value={host}
            onChange={(e) => setHost(e.currentTarget.value)}
            placeholder={t('data-contracts:serverConfig.hostPlaceholder', 'e.g., hostname.cloud.databricks.com')}
            classNames={FIELD_CLASSES}
          />
          <TextInput
            id="port"
            type="number"
            label={t('data-contracts:serverConfig.portLabel', 'Port')}
            value={port}
            onChange={(e) => setPort(e.currentTarget.value)}
            placeholder={t('data-contracts:serverConfig.portPlaceholder', 'e.g., 443')}
            classNames={FIELD_CLASSES}
          />
        </div>

        <div className={form.row}>
          <TextInput
            id="database"
            label={t('data-contracts:serverConfig.databaseLabel', 'Database/Catalog')}
            value={database}
            onChange={(e) => setDatabase(e.currentTarget.value)}
            placeholder={t('data-contracts:serverConfig.databasePlaceholder', 'e.g., main')}
            classNames={FIELD_CLASSES}
          />
          <TextInput
            id="schema"
            label={t('common:labels.schema')}
            value={schema}
            onChange={(e) => setSchema(e.currentTarget.value)}
            placeholder={t('data-contracts:serverConfig.schemaPlaceholder', 'e.g., default')}
            classNames={FIELD_CLASSES}
          />
        </div>

        <TextInput
          id="location"
          label={t('data-contracts:serverConfig.locationLabel', 'Location / URI')}
          value={location}
          onChange={(e) => setLocation(e.currentTarget.value)}
          placeholder={t('data-contracts:serverConfig.locationPlaceholder', 'e.g., s3://bucket/path, abfss://container@storage/path')}
          classNames={FIELD_CLASSES}
        />

        <div role="group" aria-labelledby={propertiesLabelId}>
          <div id={propertiesLabelId} className={form.label}>{t('data-contracts:serverConfig.customProperties', 'Custom Properties')}</div>
          <div className={form.form}>
            {Object.entries(properties).map(([key, value]) => (
              <div key={key} className={classes.keyValue}>
                <TextInput
                  value={key}
                  disabled
                  aria-label={t('data-contracts:serverConfig.keyPlaceholder', 'Key')}
                  placeholder={t('data-contracts:serverConfig.keyPlaceholder', 'Key')}
                />
                <TextInput
                  value={value}
                  onChange={(e) => {
                    const newProps = { ...properties }
                    newProps[key] = e.currentTarget.value
                    setProperties(newProps)
                  }}
                  aria-label={t('data-contracts:serverConfig.propertyValue', 'Value of {{key}}', { key })}
                  placeholder={t('data-contracts:serverConfig.valuePlaceholder', 'Value')}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('data-contracts:serverConfig.removeProperty', 'Remove {{key}}', { key })}
                  onClick={() => {
                    const newProps = { ...properties }
                    delete newProps[key]
                    setProperties(newProps)
                  }}
                >
                  <span aria-hidden>×</span>
                </Button>
              </div>
            ))}
            <div className={classes.keyValue}>
              <TextInput
                id="new-prop-key"
                aria-label={t('data-contracts:serverConfig.newPropertyPlaceholder', 'New property key')}
                placeholder={t('data-contracts:serverConfig.newPropertyPlaceholder', 'New property key')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addKey(e.currentTarget, properties, setProperties)
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => addKey(document.getElementById('new-prop-key') as HTMLInputElement | null, properties, setProperties)}
              >
                {t('data-contracts:serverConfig.addProperty', 'Add Property')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
