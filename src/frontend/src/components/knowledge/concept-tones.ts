/**
 * The Aura tones of a concept's status and type badges (wave 2 Task 13a), for
 * Explore's list and tree (concepts-tab) and the concept editor. They replace
 * the Tailwind colour classes both used before.
 */
import type { StatusTone } from '@/components/common/aura-status';

const STATUS_TONES: Record<string, StatusTone> = {
  draft: 'neutral',
  pending: 'warning',
  in_review: 'warning',
  under_review: 'warning',
  approved: 'info',
  active: 'good',
  published: 'good',
  certified: 'good',
  deprecated: 'gold',
  superseded: 'gold',
  archived: 'critical',
  retired: 'critical',
};

const TYPE_TONES: Record<string, StatusTone> = {
  concept: 'emerald',
  term: 'emerald',
  class: 'info',
  property: 'accent',
  individual: 'cyan',
};

/** The tone of a concept status; an unknown status is neutral. */
export const statusTone = (status: string): StatusTone => STATUS_TONES[status] ?? 'neutral';

/** The tone of a concept type; an unknown type is neutral. */
export const typeTone = (type: string): StatusTone => TYPE_TONES[type] ?? 'neutral';
