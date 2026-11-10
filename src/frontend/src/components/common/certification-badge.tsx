import { Shield, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CertificationLevel } from '@/types/lifecycle';
import { badgeToneStyle, toneForColour } from './aura-status';
import classes from './badges.module.css';

interface CertificationBadgeProps {
  certificationLevel: number | null | undefined;
  inheritedCertificationLevel?: number | null;
  certifiedAt?: string | null;
  certifiedBy?: string | null;
  levels: CertificationLevel[];
  size?: 'sm' | 'md';
}

export default function CertificationBadge({
  certificationLevel,
  inheritedCertificationLevel,
  certifiedAt,
  certifiedBy,
  levels,
  size = 'sm',
}: CertificationBadgeProps) {
  const effectiveLevel = Math.max(certificationLevel ?? 0, inheritedCertificationLevel ?? 0);
  if (!effectiveLevel) return null;

  const levelDef = levels.find(l => l.level_order === effectiveLevel);
  if (!levelDef) return null;

  const isInherited = !certificationLevel && !!inheritedCertificationLevel;
  const tone = toneForColour(levelDef.color || 'amber', 'warning');
  const IconComponent = levelDef.icon === 'shield' ? Shield : ShieldCheck;
  const iconSize = size === 'sm' ? 12 : 16;

  const tooltipLines = [
    `Level: ${levelDef.name}`,
    isInherited ? '(Inherited)' : null,
    certifiedBy ? `By: ${certifiedBy}` : null,
    certifiedAt ? `On: ${new Date(certifiedAt).toLocaleDateString()}` : null,
  ].filter(Boolean);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={classes.badge} style={badgeToneStyle(tone)} data-tone={tone}>
            <IconComponent size={iconSize} className={classes.mark} aria-hidden />
            {levelDef.name}
            {isInherited && <span className={classes.inherited}>↓</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className={classes.tooltipLines}>
            {tooltipLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
