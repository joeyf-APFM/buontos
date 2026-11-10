/**
 * The Aura status palette for the domain badges (certification, publication,
 * maturity, quality, rating). Each tone has a mark colour (the palette value,
 * for icons, gauges and borders), a fill, and a text colour that reads at
 * least 4.5:1 on that fill.
 *
 * Warning's mark, #B67F14, is 3.25:1 on its fill: enough for an icon or a
 * border (3:1) but not for text, so warning text is the Aura body colour and
 * the amber goes on the border and the icon.
 */
import type { CSSProperties } from 'react';
import { AURA } from '@/mantine/theme';

export type StatusTone =
  | 'good' | 'warning' | 'critical' | 'info'
  | 'gold' | 'emerald' | 'cyan'
  | 'accent' | 'neutral';

export interface ToneColours {
  /** Text */
  fg: string;
  /** Fill */
  bg: string;
  /** Border */
  bd: string;
  /** Icons, gauges and dots */
  mark: string;
}

export const AURA_STATUS: Record<StatusTone, ToneColours> = {
  good: { fg: AURA.good, bg: AURA.goodBg, bd: AURA.goodBg, mark: AURA.good },
  warning: { fg: AURA.textBody, bg: AURA.warningBg, bd: AURA.warning, mark: AURA.warning },
  critical: { fg: AURA.critical, bg: AURA.criticalBg, bd: AURA.criticalBg, mark: AURA.critical },
  info: { fg: AURA.info, bg: AURA.surface, bd: AURA.info, mark: AURA.info },
  // The level tables use colours the status palette has no tone for (yellow
  // Gold beside amber Bronze; cyan beside blue maturity levels; emerald beside
  // green). These are filled tones on the Aura chart series hues (--chart-4
  // 41°, --chart-3 159°, and 195° between --chart-1 and info), darkened for
  // text: gold 5.82:1, emerald 6.5:1, cyan 7.04:1.
  gold: { fg: '#7A5400', bg: '#FFECC2', bd: '#FFECC2', mark: '#7A5400' },
  emerald: { fg: '#0F6144', bg: '#DBF5EC', bd: '#DBF5EC', mark: '#0F6144' },
  cyan: { fg: '#0C566E', bg: '#DCF2F9', bd: '#DCF2F9', mark: '#0C566E' },
  // Not statuses: purple meant "special" (external scope); slate meant "plain"
  accent: { fg: AURA.accentPressed, bg: AURA.accentSubtle, bd: AURA.accentSubtle, mark: AURA.accent },
  neutral: { fg: AURA.textSecondary, bg: AURA.surfaceStrong, bd: AURA.surfaceStrong, mark: AURA.textSecondary },
};

/**
 * The tone for each colour name the badge settings and level tables use; each
 * colour has its own tone, so neighbouring levels stay apart.
 */
const TONE_FOR_COLOUR: Record<string, StatusTone> = {
  green: 'good',
  emerald: 'emerald',
  amber: 'warning',
  yellow: 'gold',
  red: 'critical',
  blue: 'info',
  cyan: 'cyan',
  purple: 'accent',
  slate: 'neutral',
};

export function toneForColour(colour: string | null | undefined, fallback: StatusTone): StatusTone {
  return (colour && TONE_FOR_COLOUR[colour]) || fallback;
}

/**
 * CSS variables that colour a Badge (components/ui/badge) in a tone; they go
 * in `style`, which Mantine applies after its own variant variables.
 * `--tone-mark` colours the icon (badges.module.css `.mark`).
 */
export function badgeToneStyle(tone: StatusTone): CSSProperties {
  const c = AURA_STATUS[tone];
  return {
    '--badge-color': c.fg,
    '--badge-bg': c.bg,
    '--badge-bd': `1px solid ${c.bd}`,
    '--tone-mark': c.mark,
  } as CSSProperties;
}

const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
/** `a` mixed with `p` (0..1) of `b`, both #RRGGBB. */
function mix(a: string, b: string, p: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => hex(ch(a, i) * (1 - p) + ch(b, i) * p)).join('').toUpperCase()}`;
}

/**
 * The fill of a clickable chip under the pointer: 10% darker toward the mark
 * where the text keeps 4.5:1 on it, otherwise 60% lighter toward white (the
 * good and critical texts are too close to 4.5:1 to darken).
 */
export function hoverFill(tone: StatusTone): string {
  const c = AURA_STATUS[tone];
  const darker = mix(c.bg, c.mark, 0.1);
  return contrastRatio(c.fg, darker) >= 4.5 ? darker : mix(c.bg, '#FFFFFF', 0.6);
}

/** CSS variables for a quality or rating chip (badges.module.css `.chip`). */
export function chipToneStyle(tone: StatusTone): CSSProperties {
  return { '--chip-bg': AURA_STATUS[tone].bg, '--chip-hover': hoverFill(tone) } as CSSProperties;
}

/** WCAG 2 contrast ratio of two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (hi + 0.05) / (lo + 0.05);
}
