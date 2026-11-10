import { describe, expect, it } from 'vitest';
import { FULL_BLEED_ROUTES, isFullBleed } from './full-bleed';

describe('isFullBleed', () => {
  it('matches the explorer, asset detail and Data Catalog routes exactly', () => {
    expect(FULL_BLEED_ROUTES).toEqual(['/assets', '/assets/:assetId', '/data-catalog', '/data-catalog/*']);
    expect(isFullBleed('/assets')).toBe(true);
    // React Router's trailing slash: the explorer at /assets/ is full bleed too
    expect(isFullBleed('/assets/')).toBe(true);
    // Asset detail (Task 11), but nothing under it
    expect(isFullBleed('/assets/a1')).toBe(true);
    expect(isFullBleed('/assets/a1/lineage')).toBe(false);
    expect(isFullBleed('/Assets')).toBe(false);
    expect(isFullBleed('/')).toBe(false);
    // The Data Catalog and every table under it (Task 12), but not lookalikes
    expect(isFullBleed('/data-catalog')).toBe(true);
    expect(isFullBleed('/data-catalog/')).toBe(true);
    expect(isFullBleed('/data-catalog/main.sales.orders')).toBe(true);
    expect(isFullBleed('/data-catalog/main/sales/orders')).toBe(true);
    expect(isFullBleed('/data-catalogue')).toBe(false);
    expect(isFullBleed('/Data-Catalog')).toBe(false);
    expect(isFullBleed('/data-contracts')).toBe(false);
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
