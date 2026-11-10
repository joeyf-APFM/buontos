import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';
import themeSource from './theme.ts?raw';
import { AURA_HSL } from './aura-tokens';

const rootBlock = (): string => {
  const start = css.indexOf(':root {');
  return css.slice(start, css.indexOf('}', start));
};

const hexToHsl = (hex: string): number[] => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, s * 100, l * 100];
};

describe('Aura shadcn tokens', () => {
  it.each(Object.entries(AURA_HSL))('index.css :root %s matches AURA_HSL', (name, value) => {
    const match = rootBlock().match(new RegExp(`${name}:\\s*([^;]+);`));
    expect(match?.[1].trim()).toBe(value);
  });

  it('primary agrees with the accent hex in theme.ts', () => {
    const hex = themeSource.match(/accent:\s*'(#[0-9A-Fa-f]{6})'/)?.[1];
    expect(hex).toBe('#4F6AC5');
    const expected = hexToHsl(hex!);
    const actual = AURA_HSL['--primary'].replace(/%/g, '').split(' ').map(Number);
    actual.forEach((v, i) => expect(Math.abs(v - expected[i])).toBeLessThanOrEqual(1));
  });
});
