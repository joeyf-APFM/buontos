import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { badgeToneStyle, toneForColour } from './aura-status';
import classes from './badges.module.css';
import {
  type LucideIcon,
  LockKeyhole, FileText, BookOpen, Activity, ShieldCheck,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'lock-keyhole': LockKeyhole,
  'file-text': FileText,
  'book-open': BookOpen,
  'activity': Activity,
  'shield-check': ShieldCheck,
};

interface MaturityBadgeProps {
  levelName: string | null;
  levelIcon?: string | null;
  levelColor?: string | null;
  levelOrder?: number | null;
  totalLevels?: number;
  className?: string;
}

export function MaturityBadge({
  levelName,
  levelIcon,
  levelColor,
  levelOrder,
  totalLevels,
  className,
}: MaturityBadgeProps) {
  if (!levelName) {
    return (
      <Badge variant="outline" className={cn(classes.badge, classes.unset, className)}>
        Not assessed
      </Badge>
    );
  }

  const Icon = ICON_MAP[levelIcon || 'shield-check'] || ShieldCheck;
  const tone = toneForColour(levelColor || 'blue', 'info');

  return (
    <Badge variant="outline" className={cn(classes.badge, className)} style={badgeToneStyle(tone)} data-tone={tone}>
      <Icon size={12} className={classes.mark} aria-hidden />
      {levelName}
      {levelOrder != null && totalLevels ? (
        <span className={classes.count}>({levelOrder}/{totalLevels})</span>
      ) : null}
    </Badge>
  );
}
