import { describe, expect, it } from 'vitest';
import { FULL_BLEED_ROUTES, isFullBleed } from './full-bleed';

describe('isFullBleed', () => {
  it('matches the explorer route exactly, as before', () => {
    expect(FULL_BLEED_ROUTES).toEqual(['/assets']);
    expect(isFullBleed('/assets')).toBe(true);
    expect(isFullBleed('/assets/a1')).toBe(false);
    expect(isFullBleed('/Assets')).toBe(false);
    expect(isFullBleed('/data-catalog')).toBe(false);
    expect(isFullBleed('/')).toBe(false);
  });

  it('takes route patterns, such as a detail route', () => {
    const routes = ['/assets', '/assets/:assetId', '/data-catalog/*'];
    expect(isFullBleed('/assets/a1', routes)).toBe(true);
    expect(isFullBleed('/assets/a1/lineage', routes)).toBe(false);
    expect(isFullBleed('/data-catalog', routes)).toBe(true);
    expect(isFullBleed('/data-catalog/main/sales', routes)).toBe(true);
    expect(isFullBleed('/data-products', routes)).toBe(false);
  });
});
