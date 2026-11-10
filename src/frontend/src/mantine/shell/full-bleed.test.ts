import { describe, expect, it } from 'vitest';
import { FULL_BLEED_ROUTES, isFullBleed } from './full-bleed';

describe('isFullBleed', () => {
  it('matches the explorer and asset detail routes exactly', () => {
    expect(FULL_BLEED_ROUTES).toEqual(['/assets', '/assets/:assetId']);
    expect(isFullBleed('/assets')).toBe(true);
    // React Router's trailing slash: the explorer at /assets/ is full bleed too
    expect(isFullBleed('/assets/')).toBe(true);
    // Asset detail (Task 11), but nothing under it
    expect(isFullBleed('/assets/a1')).toBe(true);
    expect(isFullBleed('/assets/a1/lineage')).toBe(false);
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
