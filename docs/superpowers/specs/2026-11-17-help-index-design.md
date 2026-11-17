# Searchable Help Index — Design

Status: awaiting approval. Date: 2026-11-17.

## Intent and why

Nucleus has no user-facing guidance. Nothing explains what its concepts mean, how to
do common tasks, how to set things up (with examples), or what each role is allowed to do.
It is not obvious to anyone how to work with the app. Ask Nucleus is the only help today,
and it is grounded in `docs/handbook/`, a corpus written for the LLM, not for a first-time user.

We will add a searchable help index, with a help icon in the top bar, backed by
user-facing articles that ship in the repo. The work has two halves, and the content
is as important as the mechanism:

1. **Content**: user-facing articles (concepts, how-tos, worked examples, permissions).
2. **Mechanism**: a `HelpManager` that indexes the articles using the existing
   searchable-manager pattern, API routes, and a help drawer and article pages in the UI.

## Goals

- A new user can find answers to "what is X", "how do I do Y" and "what can my role do" in one or two searches.
- Help is searchable from the existing top-bar search *and* from a dedicated help drawer.
- Help is reachable by **every** signed-in user, including one who has no role yet. "How do I get access" must work for them.
- Articles are markdown in the repo, reviewed through PRs, shipped with the app.
- Each article can link to the screen it describes, and results deep-link to the right section.

## Non-goals

- In-app editing, or storing articles in the database.
- Translating help content. English only for now, even though a language selector exists.
- Per-page contextual "?" buttons. Possible later; not in this change.
- Semantic or embedding search, or any LLM in the help path.
- Changing or replacing Ask Nucleus or its handbook tool. They stay as they are.

## Anti-goals (a failure even if it technically works)

- Permissions guidance that does not match what the code does. Wrong guidance is worse than none, so
  every permissions statement is verified against `common/features.py` and the role/group setup.
- Help results leaking into search for a user in a way that bypasses the app's permission model
  for *other* content. Only help content gets the "visible to everyone" treatment.
- Content that duplicates the handbook word for word. The handbook is LLM grounding; help is for people.

## Constraints

- Follow the existing controller pattern: a manager implements `SearchableAsset.get_search_index_items()`
  returning `SearchIndexItem`s. `SearchManager` collects any `SearchableAsset` found on `app.state`
  at startup, so the manager is created in `utils/startup_tasks.py` alongside the others (before the
  SearchManager is built, around the `app.state.projects_manager = ProjectsManager()` line).
- `SearchManager` filters results by `feature_id` at READ_ONLY. Help items need a `feature_id` (or an
  explicit exemption for the `help` type) that every user passes, including a user whose effective
  permissions are all `None`. Choosing how is left to the builder; the requirement is not.
- Search behaviour is configured per asset type in `src/backend/src/data/search_config.yaml`; add a `help` type.
- Content must ship in the deployed Databricks App. Put articles inside the Python package
  (`src/backend/src/help/content/*.md`) and resolve the path relative to the module, so there is no
  walking of parent directories (the handbook tool does that today and is fragile).
- Frontend is Mantine (new shell). The help icon goes in `mantine/shell/top-bar.tsx`.
  The older `components/layout/header.tsx` appears unused; the builder should confirm and ignore it if so.
- npm, not yarn/pnpm. Python via `hatch -e dev run ...`. Alembic is not needed (no DB changes).

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | `HelpManager` (SearchableAsset) + `/api/help` routes + drawer and article pages, content in a new folder in `src/` | Most work, but matches how every other feature is built; help shows up in global search |
| B | Index the existing `docs/handbook/` files | Cheapest, but the content is written for the LLM, mixes audiences, and lives outside `src/` where it may not ship |
| C | Bundle markdown into the frontend and search in the browser | No backend, but ignores the controller pattern, cannot feed global search, and cannot filter by role |

The user chose A.

## Design

### Content
- One markdown file per topic in `src/backend/src/help/content/`, with YAML front matter:
  `title`, `summary`, `tags`, `order`, optional `route` (the screen it describes), optional `roles` (who it is for).
- Articles are split by `##` heading into sections; each section becomes one search item with a stable id
  `help::<slug>#<anchor>`, type `help`, a link of `/help/<slug>#<anchor>`, and the section text as description/snippet.
- Initial set (my proposal; the user reviews it): Getting started; How Nucleus is organised (concepts/glossary of entities);
  Roles and permissions (what each role can do, how access is granted, how to request it); Data products; Data contracts;
  Domains, teams and projects; Business glossary and semantic links; and 2–3 worked walkthroughs
  (set up a domain, team and project; publish a data product; create a data contract).
- I will draft these from the handbook and the code, and verify permissions statements against the code.

### Backend
- `controller/help_manager.py`: loads and parses articles at startup, builds `SearchIndexItem`s, exposes
  `list_articles()`, `get_article(slug)`, and `search(query)` for the drawer (reusing `search_scoring`).
- `routes/help_routes.py`: `GET /api/help/articles`, `GET /api/help/articles/{slug}`, `GET /api/help/search?q=`,
  registered in `app.py` next to the other `register_routes` calls. Readable by any authenticated user.
- Articles are read once at startup and held in memory; changing a file needs a backend reload (auto-reload covers dev).

### Frontend
- A help icon in the top bar, first in the right-hand group (left of the notification bell, then language, then user).
  It is a solid dark circle with a white "?" (theme-aware: inverts in dark mode), with an accessible label and tooltip.
- Clicking opens a Mantine drawer: a search box, a browse list grouped by topic, and result snippets.
  Selecting a result opens the article page.
- Routes `/help` (index) and `/help/:slug` (article, with in-page anchors). Help results from the global search link to these.
- All UI strings go through the existing i18n setup.

### Testing
- Backend unit tests: front matter parsing, section splitting and ids, search ranking, and the "visible with no role" rule.
- Frontend tests: the icon renders in the top bar, the drawer searches and navigates.
- Verify by running the app and searching for the permission and "how do I get access" topics as a user with no roles.

## Clarifications from the builder check

- **Where the roles come from.** Role definitions are code: `DEFAULT_ROLES` in `controller/settings_manager.py`
  (optionally overridden from YAML), with feature levels from `common/features.py`. Which *groups* map to which role
  (`assigned_groups`) is deployment data, set by admins in Settings → Roles. So the permissions article documents what each
  role can do (generic, verified against code) and says that group-to-role assignment is configured per deployment by an admin.
  It names no groups, people or contact details.
- **How a user gets access.** There is an in-app flow: users can request roles (`/api/user/requestable-roles`, the role-request
  dialog) and admins approve or reject (`HandleRoleRequest`). The access article describes that flow *after the builder verifies
  it works for a user who has no role yet*. If it doesn't, the article says to ask a Nucleus admin, and that gap is raised as a follow-up bug, not papered over.
- **`roles` in front matter is a label only.** It is shown as a badge and used for grouping the browse list. It never filters
  results; every signed-in user can read every help article.
- **Drawer search shape.** Section-level results, same as global search, grouped by article in the drawer. The snippet is an excerpt
  of the matching section (about 200 characters around the first match). `HelpManager.search` returns these items; the API returns the same shape.
- **Visibility mechanism: prefer a type-level exemption.** Roles are already persisted in deployed databases and would not contain a new
  `help` feature key, so adding a feature would silently hide help from existing roles. Exempting the `help` type from the feature check in
  `SearchManager` (and not requiring a feature on `/api/help/*`) avoids that. The builder may revisit if the code says otherwise.
- **Markdown rendering.** Use `react-markdown` + `remark-gfm`, already in the frontend. No raw HTML and no images or screenshots in the first version.

## Calls I made (not agreed by the user)
- "Dark ?" is read as a solid dark circle with a white question mark; inverted in dark mode.
- Placement: left of the notification bell.
- Content folder inside the Python package; English only; articles drafted by me for review.
- Sections (not whole articles) are the search unit, so results land on the right heading.

## Left to the builder
- How help becomes visible to every user (new `help` feature granted to all vs. a type-level exemption).
- Markdown parsing and rendering libraries (prefer what the project already uses).
- Exact `search_config.yaml` weights for the `help` type.
- Article wording, within the topic list above.
