import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/use-api';
import type { RatingAggregation } from '@/types/comments';
import { AURA_STATUS } from '@/components/common/aura-status';
import classes from '@/components/common/badges.module.css';

export interface RatingBadgeProps {
  /** Entity type (data_product, dataset, etc.) */
  entityType: string;
  /** Entity ID */
  entityId: string;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class names */
  className?: string;
  /** Click handler (optional) */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * RatingBadge - Compact inline rating display for cards
 * 
 * Fetches and displays rating data for an entity in a minimal badge format.
 * Shows nothing if no ratings exist.
 */
export function RatingBadge({
  entityType,
  entityId,
  size = 'sm',
  className,
  onClick,
}: RatingBadgeProps) {
  const { get } = useApi();
  const [rating, setRating] = useState<RatingAggregation | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!entityType || !entityId) return;

    const fetchRating = async () => {
      try {
        const response = await get<RatingAggregation>(
          `/api/entities/${entityType}/${entityId}/ratings`
        );
        if (!response.error && response.data) {
          setRating(response.data);
        }
      } catch (error) {
        // Silent fail - ratings are not critical
      } finally {
        setLoaded(true);
      }
    };

    fetchRating();
  }, [entityType, entityId, get]);

  // Don't show anything until loaded or if no ratings
  if (!loaded || !rating || rating.total_ratings === 0) {
    return null;
  }

  // Ratings were amber: the warning tone, with the star in its mark colour
  const colours = AURA_STATUS.warning;
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <div
      className={cn(classes.chip, size === 'md' && classes.chipMd, onClick && classes.clickable, className)}
      style={{ background: colours.bg }}
      onClick={onClick}
      title={`${rating.average_rating.toFixed(1)} out of 5 stars (${rating.total_ratings} ratings)`}
    >
      <Star size={iconSize} className={classes.star} style={{ color: colours.mark, fill: colours.mark }} aria-hidden />
      <span className={classes.value} style={{ color: colours.fg }}>
        {rating.average_rating.toFixed(1)}
      </span>
      <span className={classes.total}>
        ({rating.total_ratings})
      </span>
    </div>
  );
}

export default RatingBadge;

