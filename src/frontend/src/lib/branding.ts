/**
 * Branding side-effects module (issue #240).
 *
 * Single owner of runtime DOM mutations for product branding:
 *  - document.title
 *  - <link rel="icon"> in <head>
 *
 * Custom CSS injection lives in the UI customization store; both are invoked
 * from the same fetch path so views never duplicate DOM manipulation.
 */

/** Canonical fallback product name. Single source of truth for the client. */
export const DEFAULT_APP_NAME = 'Nucleus';

/** Filesystem path of the shipped favicon, kept in sync with `index.html`. */
const DEFAULT_FAVICON_HREF = '/ontos-logo.svg';

const FAVICON_LINK_ID = 'app-favicon';

let originalFaviconHref: string | null = null;

export interface BrandingInput {
  displayName?: string | null;
  faviconUrl?: string | null;
}

/**
 * Resolve the effective application name with safe fallback.
 * Treats whitespace-only strings as unset.
 */
export function resolveAppName(displayName?: string | null): string {
  if (typeof displayName !== 'string') return DEFAULT_APP_NAME;
  const trimmed = displayName.trim();
  return trimmed || DEFAULT_APP_NAME;
}

/**
 * Resolve the effective short name, falling back to the (full) display name.
 */
export function resolveShortName(
  shortName?: string | null,
  displayName?: string | null,
): string {
  if (typeof shortName === 'string') {
    const trimmed = shortName.trim();
    if (trimmed) return trimmed;
  }
  return resolveAppName(displayName);
}

/**
 * Apply branding side effects to the document. Idempotent.
 * Called from the UI customization store after fetch and after admin save.
 */
export function applyBranding({ displayName, faviconUrl }: BrandingInput): void {
  if (typeof document === 'undefined') return;

  document.title = resolveAppName(displayName);

  const link = ensureFaviconLink();
  if (link) {
    if (originalFaviconHref === null) {
      originalFaviconHref = link.getAttribute('href') || DEFAULT_FAVICON_HREF;
    }
    const cleaned = typeof faviconUrl === 'string' ? faviconUrl.trim() : '';
    link.setAttribute('href', cleaned || originalFaviconHref || DEFAULT_FAVICON_HREF);
  }
}

function ensureFaviconLink(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  let link = document.querySelector<HTMLLinkElement>(`link#${FAVICON_LINK_ID}`);
  if (link) return link;

  link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (link) {
    link.id = FAVICON_LINK_ID;
    return link;
  }

  link = document.createElement('link');
  link.id = FAVICON_LINK_ID;
  link.rel = 'icon';
  document.head.appendChild(link);
  return link;
}
