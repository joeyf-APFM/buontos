import { useState, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { GitCommit, AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { Alert, Loader, Radio, TextInput, Textarea } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, Tabs } from '@/mantine/page'
import { FIELD_CLASSES, HINT_BELOW } from '@/components/common/dialog-form'
import form from '@/components/common/dialog-form.module.css'
import changeCss from '@/components/common/change-analysis.module.css'
import classes from './commit-draft-dialog.module.css'
import { useToast } from '@/hooks/use-toast'
import type { DiffFromParentResponse } from '@/types/data-contract'

type CommitDraftDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  contractId: string
  contractName: string
  onSuccess: () => void
}

export default function CommitDraftDialog({
  isOpen,
  onOpenChange,
  contractId,
  contractName: _contractName,
  onSuccess,
}: CommitDraftDialogProps) {
  const { toast } = useToast()
  const { t } = useTranslation(['data-contracts', 'common'])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [diffData, setDiffData] = useState<DiffFromParentResponse | null>(null)
  const [error, setError] = useState('')

  const [versionBumpType, setVersionBumpType] = useState<'major' | 'minor' | 'patch' | 'custom'>('patch')
  const [customVersion, setCustomVersion] = useState('')
  const [changeSummary, setChangeSummary] = useState('')

  // Fetch diff data when dialog opens
  useEffect(() => {
    if (isOpen && contractId) {
      fetchDiffData()
    }
  }, [isOpen, contractId])

  const fetchDiffData = async () => {
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/data-contracts/${contractId}/diff-from-parent`)
      if (response.ok) {
        const data = await response.json()
        setDiffData(data)
        // Set default version bump type based on suggestion
        if (data.suggested_bump) {
          setVersionBumpType(data.suggested_bump)
        }
        // Pre-populate change summary from analysis
        if (data.analysis?.summary) {
          setChangeSummary(data.analysis.summary)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.detail || t('data-contracts:commit.loadDiffError', 'Failed to load diff data'))
      }
    } catch (err) {
      console.error('Error fetching diff:', err)
      setError(t('data-contracts:commit.loadDiffError', 'Failed to load diff data'))
    } finally {
      setIsLoading(false)
    }
  }

  const calculateNewVersion = () => {
    if (versionBumpType === 'custom') {
      return customVersion
    }
    if (!diffData?.parent_version) {
      return '1.0.0'
    }

    const parts = diffData.parent_version.split('.').map(Number)
    if (parts.length !== 3 || parts.some(isNaN)) {
      return '1.0.0'
    }

    const [major, minor, patch] = parts
    switch (versionBumpType) {
      case 'major':
        return `${major + 1}.0.0`
      case 'minor':
        return `${major}.${minor + 1}.0`
      case 'patch':
        return `${major}.${minor}.${patch + 1}`
      default:
        return diffData.parent_version
    }
  }

  const validateVersion = (version: string): boolean => {
    return /^\d+\.\d+\.\d+$/.test(version)
  }

  const handleSubmit = async () => {
    const newVersion = calculateNewVersion()

    if (!validateVersion(newVersion)) {
      setError(t('data-contracts:commit.versionFormatError', 'Version must be in format X.Y.Z (e.g., 1.1.0)'))
      return
    }

    if (!changeSummary.trim()) {
      setError(t('data-contracts:commit.summaryRequired', 'Please provide a change summary'))
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch(`/api/data-contracts/${contractId}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_version: newVersion,
          change_summary: changeSummary.trim(),
        }),
      })

      if (response.ok) {
        toast({
          title: t('data-contracts:commit.committedTitle', 'Draft Committed'),
          description: t('data-contracts:commit.committedDesc', 'Version {{version}} is now visible to your team.', { version: newVersion }),
        })
        onSuccess()
        onOpenChange(false)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setError(errorData.detail || t('data-contracts:commit.commitError', 'Failed to commit draft'))
      }
    } catch (err) {
      console.error('Error committing draft:', err)
      setError(t('data-contracts:commit.commitError', 'Failed to commit draft'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const newVersion = calculateNewVersion()
  const analysis = diffData?.analysis

  const hasBreakingChanges = analysis?.breaking_changes && analysis.breaking_changes.length > 0
  const hasNewFeatures = analysis?.new_features && analysis.new_features.length > 0
  const hasFixes = analysis?.fixes && analysis.fixes.length > 0

  const getVersionBumpBadge = (bump: string) => {
    switch (bump) {
      case 'major':
        return <Badge variant="destructive">{t('data-contracts:commit.bumpMajor', 'MAJOR')}</Badge>
      case 'minor':
        return <Badge variant="info">{t('data-contracts:commit.bumpMinor', 'MINOR')}</Badge>
      case 'patch':
        return <Badge variant="secondary">{t('data-contracts:commit.bumpPatch', 'PATCH')}</Badge>
      default:
        return <Badge variant="outline">{bump.toUpperCase()}</Badge>
    }
  }

  /** A tab's list of changes, under its heading, each item marked in the tab's tone. */
  const changeList = (tone: 'critical' | 'info' | 'muted', heading: ReactNode, items: string[]) => (
    <section className={changeCss.card}>
      <h3 className={changeCss.cardTitle}>{heading}</h3>
      <ul className={changeCss.list} data-tone={tone}>
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </section>
  )

  /** A version bump choice: its radio, label and description in a bordered row. */
  const bumpChoice = (value: 'major' | 'minor' | 'patch', label: string, description: string) => (
    <Radio
      value={value}
      id={value}
      label={label}
      description={description}
      classNames={{ root: classes.choice, label: classes.choiceLabel, description: form.hint }}
    />
  )

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={
        <span className={form.titleLine}>
          <GitCommit size={16} aria-hidden />
          {t('data-contracts:commit.title', 'Commit Personal Draft')}
        </span>
      }
      description={t('data-contracts:commit.description', 'Review your changes and commit to make this version visible to your team.')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || isSubmitting || !diffData}>
            {isSubmitting ? t('data-contracts:commit.committing', 'Committing...') : t('data-contracts:commit.commitVersionButton', 'Commit Version {{version}}', { version: newVersion })}
          </Button>
        </>
      }
    >
      {isLoading ? (
        <div className={classes.loading}>
          <Loader size="md" aria-label={t('common:states.loading')} />
        </div>
      ) : error && !diffData ? (
        <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t('common:states.error')} role="alert">
          {error}
        </Alert>
      ) : diffData ? (
        <div className={form.form}>
          {/* Version Display */}
          <div className={classes.versions}>
            <div className={classes.version}>
              <p className={classes.versionLabel}>{t('data-contracts:commit.parentVersion', 'Parent Version')}</p>
              <p className={classes.versionNumber}>{diffData.parent_version}</p>
              <Badge variant="outline">{diffData.parent_status}</Badge>
            </div>
            <div className={classes.arrow} aria-hidden>→</div>
            <div className={classes.version}>
              <p className={classes.versionLabel}>{t('data-contracts:commit.newVersion', 'New Version')}</p>
              <p className={classes.versionNumber} data-new="">{newVersion}</p>
              <Badge>{t('data-contracts:commit.draftLabel', 'draft')}</Badge>
            </div>
          </div>

          {/* Suggested Version Bump */}
          {diffData.suggested_bump && (
            <Alert
              color="blue"
              variant="light"
              icon={<Info size={16} />}
              title={
                <span className={form.inline}>
                  {t('data-contracts:commit.suggested', 'Suggested:')} {getVersionBumpBadge(diffData.suggested_bump)}
                </span>
              }
            >
              {t('data-contracts:commit.suggestedBumpDesc', 'Based on the changes detected, we recommend a {{bump}} version bump.', { bump: diffData.suggested_bump })}
            </Alert>
          )}

          {/* Breaking Changes Warning */}
          {hasBreakingChanges && (
            <Alert color="red" variant="light" icon={<AlertTriangle size={16} />} title={t('data-contracts:commit.breakingDetected', 'Breaking Changes Detected')} role="alert">
              {t('data-contracts:commit.breakingDesc', 'This version contains changes that may impact existing consumers. Consider a major version bump.')}
            </Alert>
          )}

          {/* Change Analysis Tabs */}
          {analysis && (hasBreakingChanges || hasNewFeatures || hasFixes) && (
            <Tabs defaultValue="summary">
              <Tabs.List>
                <Tabs.Tab value="summary">{t('data-contracts:commit.tabSummary', 'Summary')}</Tabs.Tab>
                {hasBreakingChanges && (
                  <Tabs.Tab value="breaking" className={changeCss.breakingTab}>
                    {t('data-contracts:commit.tabBreaking', 'Breaking ({{count}})', { count: analysis.breaking_changes.length })}
                  </Tabs.Tab>
                )}
                {hasNewFeatures && (
                  <Tabs.Tab value="features" className={changeCss.featuresTab}>
                    {t('data-contracts:commit.tabFeatures', 'Features ({{count}})', { count: analysis.new_features.length })}
                  </Tabs.Tab>
                )}
                {hasFixes && (
                  <Tabs.Tab value="fixes">
                    {t('data-contracts:commit.tabFixes', 'Fixes ({{count}})', { count: analysis.fixes.length })}
                  </Tabs.Tab>
                )}
              </Tabs.List>

              <Tabs.Panel value="summary">
                <section className={changeCss.card}>
                  <p className={changeCss.summary}>{analysis.summary}</p>
                </section>
              </Tabs.Panel>

              {hasBreakingChanges && (
                <Tabs.Panel value="breaking">
                  {changeList('critical', (
                    <>
                      <AlertCircle size={14} className={changeCss.critical} aria-hidden />
                      {t('data-contracts:commit.breakingChanges', 'Breaking Changes')}
                    </>
                  ), analysis.breaking_changes)}
                </Tabs.Panel>
              )}

              {hasNewFeatures && (
                <Tabs.Panel value="features">
                  {changeList('info', (
                    <>
                      <CheckCircle2 size={14} className={changeCss.info} aria-hidden />
                      {t('data-contracts:commit.newFeatures', 'New Features')}
                    </>
                  ), analysis.new_features)}
                </Tabs.Panel>
              )}

              {hasFixes && (
                <Tabs.Panel value="fixes">
                  {changeList('muted', (
                    <>
                      <Info size={14} className={changeCss.mutedIcon} aria-hidden />
                      {t('data-contracts:commit.improvementsFixes', 'Improvements & Fixes')}
                    </>
                  ), analysis.fixes)}
                </Tabs.Panel>
              )}
            </Tabs>
          )}

          {/* Version Bump Selection */}
          <Radio.Group
            label={t('data-contracts:commit.versionBumpType', 'Version Bump Type')}
            value={versionBumpType}
            onChange={(value) => setVersionBumpType(value as 'major' | 'minor' | 'patch' | 'custom')}
            classNames={FIELD_CLASSES}
          >
            <div className={form.choices}>
              {bumpChoice('major', t('data-contracts:commit.majorLabel', 'Major (Breaking Changes)'), t('data-contracts:commit.majorDesc', 'Incompatible changes that break existing integrations'))}
              {bumpChoice('minor', t('data-contracts:commit.minorLabel', 'Minor (New Features)'), t('data-contracts:commit.minorDesc', 'Backward-compatible new features or improvements'))}
              {bumpChoice('patch', t('data-contracts:commit.patchLabel', 'Patch (Bug Fixes)'), t('data-contracts:commit.patchDesc', 'Backward-compatible bug fixes or minor improvements'))}
              <div className={classes.choice}>
                <Radio
                  value="custom"
                  id="custom"
                  label={t('data-contracts:commit.customLabel', 'Custom Version')}
                  classNames={{ label: classes.choiceLabel }}
                />
                <TextInput
                  aria-label={t('data-contracts:commit.customLabel', 'Custom Version')}
                  placeholder={t('data-contracts:commit.customPlaceholder', 'e.g., 2.0.0')}
                  value={customVersion}
                  onChange={(e) => setCustomVersion(e.currentTarget.value)}
                  disabled={versionBumpType !== 'custom'}
                  className={classes.customField}
                />
              </div>
            </div>
          </Radio.Group>

          {/* Change Summary */}
          <Textarea
            id="changeSummary"
            label={t('data-contracts:commit.changeSummary', 'Change Summary')}
            withAsterisk
            placeholder={t('data-contracts:commit.summaryPlaceholder', 'Describe what changed in this version...')}
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.currentTarget.value)}
            rows={4}
            description={t('data-contracts:commit.summaryHint', 'This summary will help your team understand what changed.')}
            inputWrapperOrder={HINT_BELOW}
            classNames={FIELD_CLASSES}
          />

          {/* Error Display */}
          {error && (
            <Alert color="red" variant="light" icon={<AlertCircle size={16} />} title={t('common:states.error')} role="alert">
              {error}
            </Alert>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}
