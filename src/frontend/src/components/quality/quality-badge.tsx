import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/use-api';
import { type EntityKind, type QualitySummary } from '@/types/quality';
import { AURA_STATUS, type StatusTone } from '@/components/common/aura-status';
import classes from '@/components/common/badges.module.css';

export interface QualityBadgeProps {
  /** Entity type (data_product, data_contract, asset, ...) */
  entityType: EntityKind;
  /** Entity ID */
  entityId: string;
  /** When true, uses the product aggregation endpoint (rolls up child contracts). */
  productAggregation?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class names */
  className?: string;
  /** Click handler (optional) */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * QualityBadge - Compact inline data-quality indicator for cards.
 *
 * Fetches the quality summary for the given entity and renders a small
 * color-coded percentage chip. Returns null when there are no measurements,
 * so cards stay clean for entities without quality data.
 */
export function QualityBadge({
  entityType,
  entityId,
  productAggregation,
  size = 'sm',
  className,
  onClick,
}: QualityBadgeProps) {
  const { get } = useApi();
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!entityType || !entityId) return;
    let cancelled = false;

    const url = productAggregation
      ? `/api/data-products/${entityId}/quality-summary`
      : `/api/entities/${entityType}/${entityId}/quality-items/summary`;

    const fetchSummary = async () => {
      try {
        const response = await get<QualitySummary>(url);
        if (cancelled) return;
        if (!response.error && response.data) {
          setSummary(response.data);
        }
      } catch {
        // Silent fail - quality info is not critical for card render.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchSummary();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, productAggregation, get]);

  if (!loaded || !summary || summary.items_count === 0) {
    return null;
  }

  const pct = summary.overall_score_percent;
  // The score band's tone, so the chip reads at a glance
  const tone: StatusTone = pct >= 90 ? 'good' : pct >= 70 ? 'warning' : 'critical';
  const colours = AURA_STATUS[tone];

  const gaugePx = size === 'sm' ? 14 : 16;
  const innerPx = gaugePx - 4;

  const measuredAtLabel = summary.measured_at
    ? `\nLast measured ${new Date(summary.measured_at).toLocaleString()}`
    : '';

  // Mini conic-gradient gauge — mirrors the large gauge in EntityQualityPanel.
  const gaugeStyle: React.CSSProperties = {
    width: gaugePx,
    height: gaugePx,
    background: `conic-gradient(${colours.mark} 0% ${pct}%, var(--aura-border) ${pct}% 100%)`,
  };
  const gaugeInnerStyle: React.CSSProperties = {
    width: innerPx,
    height: innerPx,
    background: colours.bg,
  };

  return (
    <div
      className={cn(classes.chip, size === 'md' && classes.chipMd, onClick && classes.clickable, className)}
      style={{ background: colours.bg }}
      data-tone={tone}
      onClick={onClick}
      title={`Data Quality: ${pct.toFixed(1)}% (${summary.items_count} measurement${summary.items_count === 1 ? '' : 's'})${measuredAtLabel}`}
    >
      <span className={classes.gauge} style={gaugeStyle} aria-hidden>
        <span className={classes.gaugeInner} style={gaugeInnerStyle} />
      </span>
      <span className={classes.value} style={{ color: colours.fg }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export default QualityBadge;
