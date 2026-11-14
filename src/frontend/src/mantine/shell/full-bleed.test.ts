import { describe, expect, it } from 'vitest';
import { FULL_BLEED_ROUTES, isFullBleed } from './full-bleed';

describe('isFullBleed', () => {
  it('matches the explorer, asset detail and Data Catalog routes exactly', () => {
    expect(FULL_BLEED_ROUTES).toEqual(['/assets', '/assets/:assetId', '/data-catalog', '/data-catalog/*', '/schema-importer', '/settings/asset-types', '/data-asset-reviews', '/data-asset-reviews/:requestId', '/data-products', '/data-products/:productId', '/my-products', '/my-products/:productId', '/data-contracts', '/data-contracts/:contractId', '/my-requests', '/business-owners', '/owner-consumers', '/marketplace', '/search', '/search/llm', '/search/index', '/compliance', '/compliance/policies/:policyId', '/compliance/runs/:runId']);
    // The policy list (wave 3 Task 2), a policy and a run (Task 3)
    expect(isFullBleed('/compliance')).toBe(true);
    expect(isFullBleed('/compliance/policies/p1')).toBe(true);
    expect(isFullBleed('/compliance/runs/r1')).toBe(true);
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
    // The contract list (wave 2 Task 6) and a contract (Task 9)
    expect(isFullBleed('/data-contracts')).toBe(true);
    expect(isFullBleed('/data-contracts/c1')).toBe(true);
  });

  it('matches the Schema Importer route, but not the importer inside the Concepts layout', () => {
    // Task 13
    expect(isFullBleed('/schema-importer')).toBe(true);
    expect(isFullBleed('/schema-importer/')).toBe(true);
    expect(isFullBleed('/schema-importer/x')).toBe(false);
    expect(isFullBleed('/Schema-Importer')).toBe(false);
    expect(isFullBleed('/schema-imports')).toBe(false);
    expect(isFullBleed('/concepts/import')).toBe(false);
    expect(isFullBleed('/concepts')).toBe(false);
  });

  it('matches Settings → Asset Types, but no other Settings page', () => {
    // Task 14; the rest of Settings is wave 4
    expect(isFullBleed('/settings/asset-types')).toBe(true);
    expect(isFullBleed('/settings/asset-types/')).toBe(true);
    expect(isFullBleed('/settings/asset-types/x')).toBe(false);
    expect(isFullBleed('/settings')).toBe(false);
    expect(isFullBleed('/settings/teams')).toBe(false);
    expect(isFullBleed('/settings/tags')).toBe(false);
    // The old route only redirects
    expect(isFullBleed('/asset-types')).toBe(false);
  });

  it('matches the Data Asset Reviews list and one review, nothing under it', () => {
    // Task 15
    expect(isFullBleed('/data-asset-reviews')).toBe(true);
    expect(isFullBleed('/data-asset-reviews/')).toBe(true);
    expect(isFullBleed('/data-asset-reviews/r-1')).toBe(true);
    expect(isFullBleed('/data-asset-reviews/r-1/assets')).toBe(false);
    expect(isFullBleed('/Data-Asset-Reviews')).toBe(false);
    expect(isFullBleed('/data-asset-review')).toBe(false);
  });

  it('matches the Data Products and My Products lists and a product under them, nothing deeper', () => {
    // Wave 2 Task 4 (the lists) and Task 7 (a product)
    expect(isFullBleed('/data-products')).toBe(true);
    expect(isFullBleed('/data-products/')).toBe(true);
    expect(isFullBleed('/data-products/p-1')).toBe(true);
    expect(isFullBleed('/data-products/p-1/x')).toBe(false);
    expect(isFullBleed('/my-products')).toBe(true);
    expect(isFullBleed('/my-products/p-1')).toBe(true);
    expect(isFullBleed('/my-products/p-1/x')).toBe(false);
    expect(isFullBleed('/Data-Products')).toBe(false);
  });

  it('matches My Requests, Business Owners and Owner Consumers, nothing under them', () => {
    // Wave 2 Task 5
    for (const route of ['/my-requests', '/business-owners', '/owner-consumers']) {
      expect(isFullBleed(route)).toBe(true);
      expect(isFullBleed(`${route}/`)).toBe(true);
      expect(isFullBleed(`${route}/x`)).toBe(false);
    }
    expect(isFullBleed('/My-Requests')).toBe(false);
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
