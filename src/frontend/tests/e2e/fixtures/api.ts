import type { Page, Route } from '@playwright/test';
import { PERSONAS, type Persona } from './personas';

/** Answers by exact /api path: a JSON body, or a function of the request URL that returns one. */
export type Fixtures = Record<string, unknown>;

// Answers about the signed-in user, by exact path
function personaFixtures(persona: Persona): Record<string, unknown> {
  return {
    '/api/user/permissions': persona.permissions,
    '/api/user/actual-permissions': persona.permissions,
    '/api/user/details': persona.user,
    '/api/user/info': persona.user,
    '/api/user/actual-role': { role: persona.role },
    '/api/user/role-override': { role_id: null },
    '/api/user/pending-approvals': { workflows: [] },
  };
}

// Exact-path answers. Anything else under /api gets an empty list, which every
// list view renders as its empty state.
const FIXTURES: Fixtures = {
  '/api/health': { db_ok: true, ws_ok: true, seed_ok: true, warnings: [], warning_details: [], db_error: null },
  '/api/settings': {
    job_cluster_id: null,
    enabled_jobs: [],
    available_workflows: [],
    current_settings: {},
    llm_enabled: false,
    helix_enabled: false,
  },
  '/api/settings/ui-customization': {},
  '/api/cache-version': { version: 1 },
};

// Endpoints the app treats as switched off when they answer 404
const NOT_FOUND = new Set(['/api/test/personas']);

export const unmockedRequests: string[] = [];

function answerFor(persona: Persona, data: Fixtures) {
  const fixtures: Fixtures = { ...FIXTURES, ...data, ...personaFixtures(persona) };
  return async (route: Route) => {
    const url = new URL(route.request().url());
    if (NOT_FOUND.has(url.pathname)) {
      return route.fulfill({ status: 404, json: { detail: 'Not Found' } });
    }
    if (url.pathname in fixtures) {
      const fixture = fixtures[url.pathname];
      return route.fulfill({ json: typeof fixture === 'function' ? fixture(url) : fixture });
    }
    unmockedRequests.push(`${route.request().method()} ${url.pathname}`);
    return route.fulfill({ json: [] });
  };
}

/**
 * Answers every /api call from fixtures, signed in as `persona` (admin by
 * default). `data` adds records by path (the restyle check passes
 * fixtures/data.ts); without it, lists come back empty.
 */
export async function mockApi(page: Page, persona: Persona = PERSONAS.admin, data: Fixtures = {}) {
  // A predicate, not a glob: '**/api/**' would also catch Vite module URLs
  await page.route((url) => url.pathname.startsWith('/api/'), answerFor(persona, data));
}
