import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert } from '@mantine/core'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, Tabs } from '@/mantine/page'
import form from '@/components/common/dialog-form.module.css'
import changeCss from './change-analysis.module.css'
import { ChangeList } from './change-list'
import classes from './versioning-recommendation-dialog.module.css'

interface ChangeAnalysis {
  change_type: string
  version_bump: string
  summary: string
  breaking_changes: string[]
  new_features: string[]
  fixes: string[]
  schema_changes?: Array<{
    change_type: string
    schema_name: string
    field_name?: string
    old_value?: string
    new_value?: string
    severity: string
  }>
  port_changes?: Array<{
    change_type: string
    port_type: string
    port_name: string
    field_name?: string
    old_value?: string
    new_value?: string
    severity: string
  }>
}

interface VersioningRecommendationDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  analysis: ChangeAnalysis | null
  userCanOverride: boolean
  onUpdateInPlace: () => void
  onCreateNewVersion: () => void
  isUpdating?: boolean
}

export default function VersioningRecommendationDialog({
  isOpen,
  onOpenChange,
  analysis,
  userCanOverride,
  onUpdateInPlace,
  onCreateNewVersion,
  isUpdating = false
}: VersioningRecommendationDialogProps) {
  const { t } = useTranslation('common')
  if (!analysis) return null

  const hasBreakingChanges = analysis.breaking_changes && analysis.breaking_changes.length > 0
  const hasNewFeatures = analysis.new_features && analysis.new_features.length > 0
  const hasFixes = analysis.fixes && analysis.fixes.length > 0

  const getVersionBumpBadge = (bump: string) => {
    switch (bump) {
      case 'major':
        return <Badge variant="destructive">{t('common:versioning.bump.major')} {bump.toUpperCase()}</Badge>
      case 'minor':
        return <Badge variant="info">{t('common:versioning.bump.minor')} {bump.toUpperCase()}</Badge>
      case 'patch':
        return <Badge variant="secondary">{t('common:versioning.bump.patch')} {bump.toUpperCase()}</Badge>
      default:
        return <Badge variant="outline">{bump.toUpperCase()}</Badge>
    }
  }

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge variant="destructive">{t('common:versioning.severity.critical')}</Badge>
      case 'moderate':
        return <Badge variant="info">{t('common:versioning.severity.moderate')}</Badge>
      case 'minor':
        return <Badge variant="secondary">{t('common:versioning.severity.minor')}</Badge>
      default:
        return <Badge variant="outline">{severity}</Badge>
    }
  }

  return (
    <Dialog
      opened={isOpen}
      onClose={() => onOpenChange(false)}
      size="lg"
      title={
        <span className={classes.title}>
          <AlertTriangle size={16} className={classes.warning} aria-hidden />
          {t('common:versioning.changesDetectedTitle')}
        </span>
      }
      description={userCanOverride
        ? t('common:versioning.reviewDescription')
        : t('common:versioning.newVersionRequired')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            {t('common:actions.cancel')}
          </Button>
          {userCanOverride && (
            <Button variant="secondary" onClick={onUpdateInPlace} disabled={isUpdating}>
              {t('common:versioning.updateInPlace')}
            </Button>
          )}
          <Button onClick={onCreateNewVersion} disabled={isUpdating}>
            {isUpdating ? t('common:versioning.creating') : t('common:versioning.createNewVersion')}
          </Button>
        </>
      }
    >
      {/* Version Bump Recommendation */}
      <div className={form.inline}>
        <span className={form.strong}>{t('common:versioning.recommendedBump')}</span>
        {getVersionBumpBadge(analysis.version_bump)}
      </div>

      {/* Breaking Changes Alert */}
      {hasBreakingChanges && (
        <Alert color="red" variant="light" icon={<AlertCircle size={16} />} role="alert">
          <strong>{t('common:versioning.breakingChanges')}</strong> {t('common:versioning.breakingChangesImpact')}
        </Alert>
      )}

      {/* Tabbed Change Details */}
      <Tabs defaultValue="summary">
        <Tabs.List>
          <Tabs.Tab value="summary">{t('common:versioning.tabSummary')}</Tabs.Tab>
          {hasBreakingChanges && (
            <Tabs.Tab value="breaking" className={changeCss.breakingTab}>
              {t('common:versioning.tabBreaking', { count: analysis.breaking_changes.length })}
            </Tabs.Tab>
          )}
          {hasNewFeatures && (
            <Tabs.Tab value="features" className={changeCss.featuresTab}>
              {t('common:versioning.tabFeatures', { count: analysis.new_features.length })}
            </Tabs.Tab>
          )}
          {hasFixes && (
            <Tabs.Tab value="fixes">
              {t('common:versioning.tabFixes', { count: analysis.fixes.length })}
            </Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel value="summary">
          <section className={changeCss.card}>
            <h3 className={changeCss.cardTitle}>{t('common:versioning.changeSummary')}</h3>
            <p className={changeCss.summary}>{analysis.summary}</p>
          </section>
        </Tabs.Panel>

        {hasBreakingChanges && (
          <Tabs.Panel value="breaking">
            <ChangeList
              tone="critical"
              heading={(
                <>
                  <AlertCircle size={14} className={changeCss.critical} aria-hidden />
                  {t('common:versioning.breakingChangesHeading')}
                </>
              )}
              items={analysis.breaking_changes}
            />
          </Tabs.Panel>
        )}

        {hasNewFeatures && (
          <Tabs.Panel value="features">
            <ChangeList
              tone="info"
              heading={(
                <>
                  <CheckCircle2 size={14} className={changeCss.info} aria-hidden />
                  {t('common:versioning.newFeatures')}
                </>
              )}
              items={analysis.new_features}
            />
          </Tabs.Panel>
        )}

        {hasFixes && (
          <Tabs.Panel value="fixes">
            <ChangeList
              tone="muted"
              heading={(
                <>
                  <Info size={14} className={changeCss.mutedIcon} aria-hidden />
                  {t('common:versioning.improvementsFixes')}
                </>
              )}
              items={analysis.fixes}
            />
          </Tabs.Panel>
        )}
      </Tabs>

      {/* Detailed Schema/Port Changes */}
      {(analysis.schema_changes?.length || analysis.port_changes?.length) ? (
        <section className={changeCss.card}>
          <h3 className={changeCss.cardTitle}>{t('common:versioning.detailedChanges')}</h3>
          <div className={classes.changes}>
            {analysis.schema_changes?.map((change, idx) => (
              <div key={`schema-${idx}`} className={classes.change}>
                {getSeverityBadge(change.severity)}
                <span className={form.code}>{change.schema_name}</span>
                {change.field_name && <span className={form.muted}>.{change.field_name}</span>}
                <span className={form.muted}>({change.change_type})</span>
              </div>
            ))}
            {analysis.port_changes?.map((change, idx) => (
              <div key={`port-${idx}`} className={classes.change}>
                {getSeverityBadge(change.severity)}
                <span className={form.code}>{change.port_name}</span>
                <Badge variant="outline">{change.port_type}</Badge>
                <span className={form.muted}>({change.change_type})</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </Dialog>
  )
}
