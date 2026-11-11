import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Tooltip } from '@mantine/core'
import { Button } from '@/components/ui/button'
import VersionSelector, {
  EntityKind,
  EntityVersionRow,
  fetchEntityVersions,
} from './version-selector'
import classes from './version-navigator.module.css'

/**
 * Combines a previous / next chevron pair with the shared `VersionSelector`
 * dropdown so the detail views for both contracts and products get a
 * single, consistent navigation control across the family.
 *
 * Versions are returned newest-first by the API. "Newer" therefore moves
 * up the list (lower index) and "Older" moves down (higher index).
 */

type VersionNavigatorProps = {
  entityKind: EntityKind
  currentEntityId: string
  currentVersion?: string
  onVersionChange: (entityId: string) => void
}

export default function VersionNavigator({
  entityKind,
  currentEntityId,
  currentVersion,
  onVersionChange,
}: VersionNavigatorProps) {
  const { t } = useTranslation('common')
  const [versions, setVersions] = useState<EntityVersionRow[]>([])

  useEffect(() => {
    let cancelled = false
    fetchEntityVersions(entityKind, currentEntityId).then((rows) => {
      if (!cancelled) setVersions(rows)
    })
    return () => {
      cancelled = true
    }
  }, [entityKind, currentEntityId])

  // Family-of-one: hide the whole nav block.
  if (versions.length <= 1) return null

  const currentIndex = versions.findIndex((v) => v.id === currentEntityId)
  const newerVersion = currentIndex > 0 ? versions[currentIndex - 1] : null
  const olderVersion =
    currentIndex >= 0 && currentIndex < versions.length - 1
      ? versions[currentIndex + 1]
      : null

  return (
    <div className={classes.nav}>
      <Tooltip
        withinPortal
        label={
          newerVersion
            ? t('common:versionNavigator.newerTooltip', { version: newerVersion.version })
            : t('common:versionNavigator.alreadyNewest')
        }
      >
        <Button
          variant="outline"
          size="sm"
          className={classes.step}
          disabled={!newerVersion}
          onClick={() => newerVersion && onVersionChange(newerVersion.id)}
          aria-label={t('common:versionNavigator.newerVersion')}
        >
          <ChevronLeft />
        </Button>
      </Tooltip>

      <VersionSelector
        entityKind={entityKind}
        currentEntityId={currentEntityId}
        currentVersion={currentVersion}
        onVersionChange={onVersionChange}
      />

      <Tooltip
        withinPortal
        label={
          olderVersion
            ? t('common:versionNavigator.olderTooltip', { version: olderVersion.version })
            : t('common:versionNavigator.alreadyOldest')
        }
      >
        <Button
          variant="outline"
          size="sm"
          className={classes.step}
          disabled={!olderVersion}
          onClick={() => olderVersion && onVersionChange(olderVersion.id)}
          aria-label={t('common:versionNavigator.olderVersion')}
        >
          <ChevronRight />
        </Button>
      </Tooltip>
    </div>
  )
}
