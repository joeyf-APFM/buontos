import { Globe, Lock, Eye, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@mantine/core';
import { PUBLICATION_SCOPE_LABELS, type PublicationScope } from '@/types/lifecycle';
import { badgeToneStyle, type StatusTone } from './aura-status';
import classes from './badges.module.css';

interface PublicationBadgeProps {
  publicationScope: string | null | undefined;
  publishedAt?: string | null;
  publishedBy?: string | null;
}

const SCOPE_ICONS: Record<string, typeof Globe> = {
  none: Lock,
  domain: Building2,
  organization: Eye,
  external: Globe,
};

// Domain was blue, organization green and external purple
const SCOPE_TONES: Record<string, StatusTone> = {
  domain: 'info',
  organization: 'good',
  external: 'accent',
};

export default function PublicationBadge({
  publicationScope,
  publishedAt,
  publishedBy,
}: PublicationBadgeProps) {
  const scope = (publicationScope || 'none') as PublicationScope;
  if (scope === 'none') return null;

  const label = PUBLICATION_SCOPE_LABELS[scope] || scope;
  const IconComponent = SCOPE_ICONS[scope] || Globe;
  const tone = SCOPE_TONES[scope];

  const tooltipLines = [
    `Published: ${label}`,
    publishedBy ? `By: ${publishedBy}` : null,
    publishedAt ? `On: ${new Date(publishedAt).toLocaleDateString()}` : null,
  ].filter(Boolean);

  return (
    <Tooltip
      withinPortal
      classNames={{ tooltip: classes.tooltip }}
      label={
        <div className={classes.tooltipLines}>
          {tooltipLines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      }
    >
      <Badge
        variant="outline"
        className={classes.badge}
        style={tone ? badgeToneStyle(tone) : undefined}
        data-tone={tone}
      >
        <IconComponent size={12} className={classes.mark} aria-hidden />
        {label}
      </Badge>
    </Tooltip>
  );
}
