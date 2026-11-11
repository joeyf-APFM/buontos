import { matchPath } from 'react-router-dom';

/**
 * Routes whose page fills the main area under the shell's breadcrumb, with no
 * padding (the page draws its own margins, such as with the page kit's
 * PageLayout). React Router path
 * patterns, matched case-sensitively and whole: '/assets/:assetId' for a
 * detail route, '/data-catalog/*' for a route and everything under it. Each
 * restyle wave adds its pages' routes here.
 */
export const FULL_BLEED_ROUTES: readonly string[] = [
  '/assets',
  '/assets/:assetId',
  '/data-catalog',
  '/data-catalog/*',
  // Its own route only: at /concepts/import the importer sits inside the
  // Concepts layout, which keeps the shell's padding
  '/schema-importer',
  // One Settings page: the Settings layout draws no padding or menu of its
  // own, so the page can own the area; the other Settings pages keep the
  // layout's padding until their wave
  '/settings/asset-types',
  // The review list (full bleed: one pane fills the area) and one review
  // (its panes stacked at their own height, scrolling with the page)
  '/data-asset-reviews',
  '/data-asset-reviews/:requestId',
  // Build: the product list (full bleed: one pane fills the area), the
  // user's subscriptions, and a product from either list (their panes stacked
  // at their own height)
  '/data-products',
  '/data-products/:productId',
  '/my-products',
  '/my-products/:productId',
  // The contract list (full bleed: one pane fills the area)
  '/data-contracts',
  // The user's requests (tabs over a pane), the owners list (full bleed: one
  // pane fills the area) and a product's consumers (two panes side by side)
  '/my-requests',
  '/business-owners',
  '/owner-consumers',
];

export const isFullBleed = (pathname: string, routes: readonly string[] = FULL_BLEED_ROUTES) =>
  routes.some((path) => matchPath({ path, caseSensitive: true, end: true }, pathname) !== null);
