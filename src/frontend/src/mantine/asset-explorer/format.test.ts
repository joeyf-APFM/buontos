import { describe, expect, it } from 'vitest';
import { shortLabel } from './format';

describe('shortLabel', () => {
  it.each([
    ['strips the parent’s name', 'main.amplitude', 'main', 'amplitude'],
    ['keeps a label equal to the parent', 'main', 'main', 'main'],
    ['keeps a prefix that isn’t at a dot', 'mainline.x', 'main', 'mainline.x'],
    ['keeps the label without a parent', 'main.amplitude', undefined, 'main.amplitude'],
    ['keeps a label of exactly "parent."', 'main.', 'main', 'main.'],
    ['keeps a short column', 'event_ts', 'insights.referrals.leads', 'event_ts'],
  ])('%s', (_case, label, parent, expected) => {
    expect(shortLabel(label, parent)).toBe(expected);
  });
});
