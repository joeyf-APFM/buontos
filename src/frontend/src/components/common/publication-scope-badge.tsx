import { Badge } from '@/components/ui/badge';
import { Building2, Eye, Globe, Lock } from 'lucide-react';
import {
  PUBLICATION_SCOPE_LABELS,
  type PublicationScope,
} from '@/types/lifecycle';
import classes from './badges.module.css';

interface PublicationScopeBadgeProps {
  scope: PublicationScope | string | null | undefined;
  publishedAt?: string | null;
  publishedBy?: string | null;
  size?: 'sm' | 'md';
}

const SCOPE_ICONS: Record<string, typeof Globe> = {
  none: Lock,
  domain: Building2,
  organization: Eye,
  external: Globe,
};

export default function PublicationScopeBadge({
  scope,
  publishedAt,
  publishedBy,
  size = 'sm',
}: PublicationScopeBadgeProps) {
  const effectiveScope = (scope || 'none') as PublicationScope;
  const label = PUBLICATION_SCOPE_LABELS[effectiveScope] || effectiveScope;
  const Icon = SCOPE_ICONS[effectiveScope] || Lock;
  const iconSize = size === 'sm' ? 12 : 16;

  const titleParts = [
    `Scope: ${label}`,
    publishedBy ? `By: ${publishedBy}` : null,
    publishedAt ? `On: ${new Date(publishedAt).toLocaleDateString()}` : null,
  ].filter(Boolean) as string[];

  return (
    <Badge
      variant={effectiveScope === 'none' ? 'secondary' : 'outline'}
      className={classes.badge}
      title={titleParts.join(' • ')}
    >
      <Icon size={iconSize} aria-hidden />
      {label}
    </Badge>
  );
}
