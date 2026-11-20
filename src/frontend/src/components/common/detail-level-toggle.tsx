import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import classes from './detail-level-toggle.module.css';

export type DetailLevel = 'minimal' | 'medium' | 'large';

const LEVELS: DetailLevel[] = ['minimal', 'medium', 'large'];

interface DetailLevelToggleProps {
  value: DetailLevel;
  onChange: (level: DetailLevel) => void;
}

/**
 * How much of a detail page shows: a summary, most sections, or everything.
 * It replaces the bare S / M / L buttons, which named nothing.
 */
export function DetailLevelToggle({ value, onChange }: DetailLevelToggleProps) {
  const { t } = useTranslation('common');
  return (
    <div className={classes.root} role="group" aria-label={t('detailLevel.label')}>
      <span className={classes.label} aria-hidden>{t('detailLevel.label')}</span>
      <div className={classes.levels}>
        {LEVELS.map((level) => (
          <Button
            key={level}
            size="sm"
            variant={value === level ? 'default' : 'outline'}
            aria-pressed={value === level}
            onClick={() => onChange(level)}
            title={t(`detailLevel.${level}Hint`)}
          >
            {t(`detailLevel.${level}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
