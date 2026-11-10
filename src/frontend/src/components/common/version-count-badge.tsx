/**
 * Tiny pill rendered next to a version cell that surfaces how many other
 * versions live in the same family. Click bubbles via `onClick` so the
 * parent can scope an "include_history" expansion to this single family
 * (or, more commonly, navigate into the details view where the
 * VersionNavigator already provides full prev/next + dropdown navigation).
 *
 * Renders nothing for single-version families — there's nothing useful
 * to surface, and the badge would just add visual noise.
 *
 * See PRD docs/prds/prd-version-family-and-unified-selector.md.
 */
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'
import { cn } from '@/lib/utils'
import classes from './badges.module.css'

interface VersionCountBadgeProps {
  count?: number
  className?: string
  onClick?: (e: React.MouseEvent) => void
}

export function VersionCountBadge({ count, className, onClick }: VersionCountBadgeProps) {
  const { t } = useTranslation('common')

  if (!count || count <= 1) return null

  const label = t('common:versionFamily.countBadge', { count })

  return (
    <button
      type="button"
      onClick={(e) => {
        // Stop the row-click handler from also firing. The badge owns this
        // click; the row navigates separately.
        e.stopPropagation()
        onClick?.(e)
      }}
      className={cn(classes.versionCount, className)}
      title={label}
      aria-label={label}
    >
      <History size={12} aria-hidden />
      {count}
    </button>
  )
}

export default VersionCountBadge
