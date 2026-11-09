/** Routes whose page fills the main area (exact match): no padding, no breadcrumbs. */
export const FULL_BLEED_ROUTES = ['/assets'];

export const isFullBleed = (pathname: string) => FULL_BLEED_ROUTES.includes(pathname);
