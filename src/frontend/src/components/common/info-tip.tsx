import { Tooltip } from '@mantine/core';
import { Info } from 'lucide-react';
import classes from './info-tip.module.css';

interface InfoTipProps {
  /** The tooltip's text. */
  text: string;
  /** The button's name. @default the text, as the Radix info dots had */
  label?: string;
}

/**
 * An info mark (wave 2 Task 14, Enrich and the term-mapping run dialog): a small icon button whose
 * tooltip opens on hover and on keyboard focus.
 */
export function InfoTip({ text, label = text }: InfoTipProps) {
  return (
    <Tooltip label={text} multiline w={280} withArrow events={{ hover: true, focus: true, touch: false }}>
      <button type="button" aria-label={label} className={classes.info}>
        <Info size={14} aria-hidden />
      </button>
    </Tooltip>
  );
}
