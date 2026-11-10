import { matchPath } from 'react-router-dom';

/**
 * Routes whose page fills the main area: no padding, no breadcrumbs (the page
 * draws its own, such as with the page kit's PageLayout). React Router path
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
  // Concepts layout, which keeps the shell's padding and breadcrumb
  '/schema-importer',
  // One Settings page: the Settings layout draws no padding or menu of its
  // own, so the page can own the area; the other Settings pages keep the
  // layout's padding and breadcrumb until their wave
  '/settings/asset-types',
];

export const isFullBleed = (pathname: string, routes: readonly string[] = FULL_BLEED_ROUTES) =>
  routes.some((path) => matchPath({ path, caseSensitive: true, end: true }, pathname) !== null);
