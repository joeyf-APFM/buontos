# Searchable Help Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a searchable, markdown-backed help index to Nucleus, with a dark "?" help icon in the top bar that opens a help drawer and article pages.

**Architecture:** A `HelpManager` (a `SearchableAsset`, like `ProjectsManager`) loads markdown articles from `src/backend/src/help/content/`, splits them by `##` heading into `SearchIndexItem`s (type `help`) and serves them through `/api/help/*`. `SearchManager` exempts the `help` type from feature permission checks so every user finds help. The Mantine shell gets a `HelpButton` + `HelpDrawer` and `/help`, `/help/:slug` pages.

**Tech Stack:** FastAPI, pydantic, PyYAML, pytest (`hatch -e dev run pytest`); React 18, Mantine, react-router, react-markdown + remark-gfm, i18next, Vitest (npm).

**Spec:** `docs/superpowers/specs/2026-11-17-help-index-design.md`

**Where to work:** repo `~/Projects/nucleus`, branch `feat/help-index` (the spec is already committed there). Inside the `nucleus-dev` container the repo is `/workspaces/buontos`. Backend commands run from `src/`, frontend commands from `src/frontend/`. Do not restart the running dev servers (they auto-reload). Do not push.

## Global Constraints

- Articles live in `src/backend/src/help/content/*.md`; resolve the directory relative to the module file (no parent-directory walking).
- Front matter keys: `title`, `summary`, `tags`, `order`, optional `route`, optional `roles`, plus `topic` (plan addition, default `General`, used to group the browse list).
- Sections are split on `##`. Search item id `help::<slug>#<anchor>`, type `help`, feature_id `help`, link `/help/<slug>#<anchor>`.
- API: `GET /api/help/articles`, `GET /api/help/articles/{slug}`, `GET /api/help/search?q=`. Any authenticated user may read them; no feature permission.
- `roles` is a label only; it never filters. No raw HTML, no images in articles or the renderer.
- Reuse `react-markdown` + `remark-gfm`. English only (`en/help.json`; other locales fall back, as `shell.json` already does).
- Icon: solid dark circle with a white "?", inverted in dark mode; placed left of `NotificationBell`; accessible label and tooltip.
- npm only. Python via `hatch -e dev run`. No Alembic/DB changes. Ask Nucleus and `tools/handbook.py` stay untouched. The existing `/user-guide`, `/user-docs` routes stay untouched.
- Permissions statements in articles must be verified against `common/features.py` and `DEFAULT_ROLES` in `controller/settings_manager.py`.

## Review Focus

1. Empty or whitespace `q` on `/api/help/search` returns `[]` with 200, not 422/500. (Task 4)
2. A user whose groups map to no role (all permissions `None`), and a user with no groups at all, still find help articles, and still do not see other types. (Task 3)
3. Headings inside fenced code blocks (the existing `USER-GUIDE.md` has `# Search for data products` in a code block) never become sections. (Task 1)
4. A malformed article (bad YAML front matter, no title, duplicate slug, duplicate headings) never breaks startup or other articles. (Task 1)
5. Raw HTML in markdown (e.g. `<script>`) is not rendered; internal links navigate in-app, external links open safely. (Task 7)

---

### Task 1: Article model and loader

**Files:**
- Create: `src/backend/src/help/__init__.py`, `src/backend/src/help/article_loader.py`, `src/backend/src/help/content/.gitkeep`
- Test: `src/backend/src/tests/unit/test_help_article_loader.py`

**Interfaces:**
- Produces (in `article_loader.py`):
  - `@dataclass HelpSection`: `anchor: str`, `heading: str`, `body: str`
  - `@dataclass HelpArticle`: `slug: str`, `title: str`, `summary: str`, `tags: list[str]`, `roles: list[str]`, `order: int`, `topic: str`, `route: str | None`, `body: str`, `sections: list[HelpSection]`
  - `slugify_heading(text: str) -> str` — lowercase; drop chars outside `[a-z0-9\s-]`; trim; whitespace runs to `-`; collapse `-` runs.
  - `parse_article(slug: str, text: str) -> HelpArticle` — raises `ValueError` on unusable input (bad YAML, no title).
  - `load_articles(content_dir: Path, extra_files: dict[str, Path] | None = None) -> list[HelpArticle]` — never raises; skips bad files with a warning; first file wins on duplicate slug; sorted by `(order, title)`.

- [ ] **Step 1: Write failing tests** in `test_help_article_loader.py`:
  - `test_slugify_heading_vectors`: `"Working with Domains"→"working-with-domains"`, `"What's a data product?"→"whats-a-data-product"`, `"A  --  B"→"a-b"`. (The same vectors are reused by the frontend in Task 7.)
  - `test_parse_splits_on_h2_with_overview_first`: text before the first `##` becomes section `anchor="overview"`, `heading=<title>`.
  - `test_duplicate_headings_get_numeric_suffix`: two `## Setup` → `setup`, `setup-2`.
  - `test_headings_in_fenced_code_blocks_are_ignored`: a ``` block containing `## Not a section` and `# Neither` yields no sections.
  - `test_front_matter_defaults`: only `title` given → `topic=="General"`, `order==100`, `tags==[]`, `roles==[]`, `route is None`; `summary` falls back to the first paragraph, trimmed to 200 chars.
  - `test_missing_title_falls_back_to_first_h1_then_raises`: uses the `# H1` if present; with neither, `parse_article` raises `ValueError`.
  - `test_load_articles_skips_bad_files_and_keeps_good`: dir with one valid file, one with `---\n: : bad\n---`, one with no title → returns only the valid one, no exception.
  - `test_load_articles_duplicate_slug_first_wins` and `test_load_articles_sorted_by_order_then_title`.
  - `test_load_articles_missing_dir_returns_empty`.
- [ ] **Step 2: Run to confirm failure.** Run: `hatch -e dev run pytest backend/src/tests/unit/test_help_article_loader.py -q`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the interface above in `article_loader.py`. Parse front matter with `yaml.safe_load` between leading `---` fences. Walk lines tracking fence state (` ``` ` / `~~~`) so only unfenced `##` lines start sections. Log skips with `get_logger(__name__)`.
- [ ] **Step 4: Run tests; expected PASS.** Same command.
- [ ] **Step 5: Commit.** `git add src/backend/src/help src/backend/src/tests/unit/test_help_article_loader.py && git commit -m "feat(help): article loader with section splitting"`

---

### Task 2: HelpManager (searchable asset)

**Files:**
- Create: `src/backend/src/models/help.py`, `src/backend/src/controller/help_manager.py`
- Test: `src/backend/src/tests/unit/test_help_manager.py`

**Interfaces:**
- Consumes: `load_articles`, `HelpArticle` (Task 1); `SearchableAsset`, `SearchIndexItem` (`common/search_interfaces.py`); `search_scoring.score_and_rank(items, query, config) -> list[ScoredItem]` and `get_search_config_loader().load()` for config.
- Produces:
  - `models/help.py`: `HelpArticleSummary(slug, title, summary, tags, roles, order, topic, route)` and `HelpArticleRead(HelpArticleSummary)` adding `body: str` and `sections: list[HelpSectionRead(anchor, heading)]` (pydantic).
  - `class HelpManager(SearchableAsset)` with `__init__(self, content_dir: Path | None = None, extra_files: dict[str, Path] | None = None)` (default dir `Path(__file__).parent.parent / "help" / "content"`), `list_articles() -> list[HelpArticleSummary]`, `get_article(slug: str) -> HelpArticleRead | None`, `get_search_index_items() -> list[SearchIndexItem]`, `search(query: str, limit: int = 20) -> list[SearchIndexItem]` (empty/whitespace query → `[]`).
  - Index items: `id=f"help::{slug}#{anchor}"`, `type="help"`, `feature_id="help"`, `title` = article title (overview) or `"<article title> — <heading>"`, `description` = ~200-char excerpt of the section body (markdown stripped to plain text), `link=f"/help/{slug}#{anchor}"`, `tags=article.tags`, `extra_data={"article_slug":…, "anchor":…, "topic":…, "roles":…}`.

- [ ] **Step 1: Write failing tests** (use a `tmp_path` content dir with two small articles): `test_index_items_have_section_level_ids_links_and_type`, `test_overview_item_title_is_article_title_other_items_include_heading`, `test_search_finds_section_by_body_word_and_ranks_title_matches_first`, `test_search_empty_and_whitespace_return_empty`, `test_get_article_returns_body_and_section_list_or_none`, `test_list_articles_sorted_and_summary_only`, `test_description_is_plain_text_excerpt_max_200` (markdown `**bold**`, links, code fences stripped).
- [ ] **Step 2: Run; expect FAIL.** `hatch -e dev run pytest backend/src/tests/unit/test_help_manager.py -q`
- [ ] **Step 3: Implement** `models/help.py` and `HelpManager`. Load articles once in `__init__`. `search` builds on `search_scoring.score_and_rank(self.get_search_index_items(), query, config)`; do not write a second scorer.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(help): HelpManager indexes sections as SearchIndexItems"`

---

### Task 3: Search visibility for help and `help` search config

**Files:**
- Modify: `src/backend/src/controller/search_manager.py` (the permission filters in `search()` ~line 224–237 and `_search_postgres()` ~line 269–290, plus the `not user.groups` early returns); `src/backend/src/data/search_config.yaml` (add `help` under `asset_types`, modelled on `project`/`team`, `enabled: true`, `inherit_defaults: true`, `title` boost highest)
- Test: `src/backend/src/tests/unit/test_search_manager.py` (extend)

**Interfaces:**
- Produces: `SearchManager` returns items with `type == "help"` to every caller regardless of groups or permissions; all other types keep today's behaviour. Add constant `HELP_ITEM_TYPE = "help"` in `search_manager.py`.

- [ ] **Step 1: Write failing tests** in `test_search_manager.py` using its existing fixtures: `test_help_items_visible_when_user_has_groups_but_no_permissions` (mock auth_manager whose `has_permission` returns False for everything: result contains the help item and not the data-product), `test_help_items_visible_to_user_with_no_groups` (user.groups empty → help only, not `[]`), `test_help_items_visible_when_permission_lookup_raises` (help only), `test_non_help_items_still_filtered_as_before`, and the same first two for the Postgres path with a stubbed backend returning the candidates.
- [ ] **Step 2: Run; expect FAIL.** `hatch -e dev run pytest backend/src/tests/unit/test_search_manager.py -q -k help`
- [ ] **Step 3: Implement** the exemption in both paths: compute the exempt help matches first; apply the permission filter only to the rest; on "no groups" or lookup errors return the help matches instead of `[]`. Keep logging.
- [ ] **Step 4: Run the whole file; expect PASS** (existing tests included).
- [ ] **Step 5: Commit.** `git commit -m "feat(search): help items visible to every user"`

---

### Task 4: Routes and startup wiring

**Files:**
- Create: `src/backend/src/routes/help_routes.py`
- Modify: `src/backend/src/utils/startup_tasks.py` (next to `app.state.projects_manager = ProjectsManager()`, ~line 534 — it must precede the SearchManager step); `src/backend/src/app.py` (add `help_routes.register_routes(app)` after `search_routes.register_routes(app)`, ~line 476, and import `help_routes` where the other routes are imported)
- Test: `src/backend/src/tests/unit/test_help_routes.py`

**Interfaces:**
- Consumes: `HelpManager` (Task 2); `CurrentUserDep` from `common/dependencies.py`.
- Produces: `GET /api/help/articles -> list[HelpArticleSummary]`; `GET /api/help/articles/{slug} -> HelpArticleRead` (404 `{"detail": "Help article not found"}`); `GET /api/help/search?q=&limit=20 -> list[SearchIndexItem]` (`q` optional, default `""`, empty/whitespace → `[]`; `limit` 1–50). A local `get_help_manager(request)` dependency reads `request.app.state.help_manager` (503 if missing), as `search_routes.get_search_manager` does. No `PermissionChecker`.

- [ ] **Step 1: Write failing tests** following `test_helix_routes.py` (import `app` from `src.app`, set `app.state.help_manager` to a `HelpManager` over a tmp dir, use `TestClient`): `test_list_articles_ok`, `test_get_article_ok_and_404`, `test_search_returns_section_items`, `test_search_empty_and_blank_q_return_empty_list_200`, `test_search_limit_validation`, `test_routes_require_authenticated_user` (use the project's existing pattern for the unauthenticated case; if the app has none for local mode, assert the dependency is present on each route).
- [ ] **Step 2: Run; expect FAIL.** `hatch -e dev run pytest backend/src/tests/unit/test_help_routes.py -q`
- [ ] **Step 3: Implement** routes, startup wiring (`app.state.help_manager = HelpManager()` inside the same try/except style as neighbours), and registration.
- [ ] **Step 4: Run tests; expect PASS.** Then in the running container confirm: `curl -s "localhost:8000/api/help/search?q=role"` returns `[]` until content exists (Task 5), and `curl -s "localhost:8000/api/help/articles"` returns `[]` with 200.
- [ ] **Step 5: Commit.** `git commit -m "feat(help): /api/help routes and startup wiring"`

---

### Task 5: Starter articles and content integrity tests

**Files:**
- Create under `src/backend/src/help/content/`: `getting-started.md`, `how-nucleus-is-organised.md`, `roles-and-permissions.md`, `requesting-access.md`, `data-products.md`, `data-contracts.md`, `domains-teams-and-projects.md`, `glossary-and-semantic-links.md`, `walkthrough-set-up-a-domain-team-and-project.md`, `walkthrough-publish-a-data-product.md`, `walkthrough-create-a-data-contract.md`
- Test: `src/backend/src/tests/unit/test_help_content.py`

**Interfaces:**
- Consumes: `load_articles`, `DEFAULT_ROLES` (`controller/settings_manager.py`), `FEATURES` definitions (`common/features.py`).
- Produces: shipped articles that all parse; `roles-and-permissions` covers every role in `DEFAULT_ROLES`.

- [ ] **Step 1: Write failing tests** in `test_help_content.py`: `test_all_shipped_articles_parse_with_no_skips` (count of `.md` files == count loaded), `test_slugs_unique_and_titles_nonempty`, `test_every_route_front_matter_starts_with_slash`, `test_no_raw_html_or_images` (no `<` HTML tags outside code fences, no `![`), `test_internal_help_links_resolve` (every `](/help/<slug>` or `](/help/<slug>#anchor)` points at a real article/section), `test_roles_article_mentions_every_default_role_name`, `test_requesting_access_article_exists_and_has_steps`.
- [ ] **Step 2: Run; expect FAIL** (no content yet). `hatch -e dev run pytest backend/src/tests/unit/test_help_content.py -q`
- [ ] **Step 3: Write the articles.** Source material, in order of trust: the code (`features.py`, `DEFAULT_ROLES`, routes, UI) → `src/docs/USER-GUIDE.md` → `docs/handbook/`. Write for a first-time user: plain language, task-oriented, each walkthrough with concrete example values. Keep each article under about 150 lines, with `##` sections that read well as search results. Front matter on every file (`title`, `summary`, `tags`, `topic`, `order`, `route` where a screen exists). Roles and permissions: describe what each role can do from the code and name no groups, people or contact details; state that group-to-role mapping is set per deployment by an admin in Settings → Roles. Requesting access: first verify in the running app, as a user with no role (set `MOCK_USER_GROUPS='["nobody"]'` for the dev container, then restore), whether the in-app role-request flow (`/api/user/requestable-roles`, role-request dialog) works. Write the article for what actually works; if a no-role user cannot request access, say "ask a Nucleus admin" and record the gap in the final report.
- [ ] **Step 4: Verify.** Run the test file (PASS). Then read `roles-and-permissions.md` against `common/features.py` and `DEFAULT_ROLES` line by line and fix any mismatch. Confirm `src/databricks.yaml`/`.gitignore` do not exclude `backend/src/help/content/*.md` from the deployed bundle.
- [ ] **Step 5: Commit.** `git commit -m "docs(help): starter help articles"`

---

### Task 6: Index the existing User Guide (separable; drop if you don't want it)

**Files:**
- Modify: `src/backend/src/utils/startup_tasks.py` (pass `extra_files={"user-guide": <path>}` to `HelpManager`; get the path from the same registry `settings_manager.get_available_docs()` serves, or `src/docs/USER-GUIDE.md` resolved the way that registry does), `src/backend/src/help/article_loader.py` (skip a section titled `Table of Contents`; synthesize front matter when a file has none)
- Test: `src/backend/src/tests/unit/test_help_article_loader.py` (extend), `test_help_manager.py` (extend)

**Interfaces:**
- Consumes: `load_articles(..., extra_files=...)` (Task 1), `HelpManager(extra_files=...)` (Task 2).
- Produces: article slug `user-guide`, title `Nucleus User Guide`, `topic="Reference"`, `order=900`; its `##` sections are searchable and link to `/help/user-guide#<anchor>`.

- [ ] **Step 1: Write failing tests:** `test_file_without_front_matter_gets_title_from_h1_and_defaults`, `test_table_of_contents_section_is_not_indexed`, `test_user_guide_fenced_hash_lines_not_sections` (fixture with a fenced `# Search for data products`), `test_manager_indexes_extra_files`.
- [ ] **Step 2: Run; expect FAIL.**
- [ ] **Step 3: Implement** the changes above.
- [ ] **Step 4: Run tests; expect PASS.** Then start check against the real file: `hatch -e dev run python -c "from pathlib import Path; from src.help.article_loader import load_articles; a=load_articles(Path('/nonexistent'), {'user-guide': Path('docs/USER-GUIDE.md')}); print(len(a[0].sections))"` — expect about 20 sections and none called `Search for data products`.
- [ ] **Step 5: Commit.** `git commit -m "feat(help): index the existing user guide"`

---

### Task 7: Frontend API client, slug util and safe help renderer

**Files:**
- Create: `src/frontend/src/mantine/help/help-api.ts`, `help-slug.ts`, `help-markdown.tsx`
- Test: `help-slug.test.ts`, `help-markdown.test.tsx` (same folder)

**Interfaces:**
- Produces:
  - `help-api.ts`: types `HelpArticleSummary {slug,title,summary,tags,roles,order,topic,route}`, `HelpArticle extends HelpArticleSummary {body; sections: {anchor;heading}[]}`, `HelpSearchItem {id,type,title,description,link,tags,feature_id,extra_data}`; functions `fetchHelpArticles(): Promise<HelpArticleSummary[]>`, `fetchHelpArticle(slug: string): Promise<HelpArticle | null>` (null on 404), `searchHelp(q: string, signal?: AbortSignal): Promise<HelpSearchItem[]>`. Non-OK (other than 404) throws.
  - `help-slug.ts`: `slugifyHeading(text: string): string` and `createAnchorGenerator(): (text: string) => string` (adds `-2`, `-3` for repeats). Identical rules to the backend `slugify_heading`.
  - `help-markdown.tsx`: `<HelpMarkdown text={string} />` using `react-markdown` + `remark-gfm`, `skipHtml`, images render as their alt text only, `h1–h4` get `id` from `createAnchorGenerator`, links starting with `/` use react-router `Link`, other links open in a new tab with `rel="noopener noreferrer"`.

- [ ] **Step 1: Write failing tests:** `help-slug.test.ts` with the Task 1 vectors plus `createAnchorGenerator` producing `setup`, `setup-2`; `help-markdown.test.tsx`: `renders_headings_with_matching_ids`, `does_not_render_raw_html` (`<script>`/`<img onerror>` absent from the DOM), `internal_link_navigates_without_new_tab`, `external_link_has_noopener_and_target_blank`, `images_render_alt_text_only`. API tests in `help-api.test.ts` with mocked `fetch`: URL encoding of `q`, 404 → `null`, 500 throws.
- [ ] **Step 2: Run; expect FAIL.** From `src/frontend`: `npx vitest run src/mantine/help`
- [ ] **Step 3: Implement.** Use `renderWithMantine` from `@/test/utils` in component tests.
- [ ] **Step 4: Run; expect PASS.**
- [ ] **Step 5: Commit.** `git commit -m "feat(help): frontend api client, slugger and safe markdown"`

---

### Task 8: Help button, drawer and top-bar placement

**Files:**
- Create: `src/frontend/src/mantine/help/help-button.tsx`, `help-drawer.tsx`, `help.module.css`, `src/frontend/src/i18n/locales/en/help.json`
- Modify: `src/frontend/src/mantine/shell/top-bar.tsx` (render `<HelpButton />` between `<ProjectChooser />` and `<NotificationBell />`), `src/frontend/src/i18n/config.ts` (add the `help` namespace the same way `shellEN` is registered)
- Test: `help-button.test.tsx`, `help-drawer.test.tsx` (same folder); update `src/frontend/src/mantine/shell/app-shell.test.tsx` only if it breaks

**Interfaces:**
- Consumes: `fetchHelpArticles`, `searchHelp`, `HelpArticleSummary`, `HelpSearchItem` (Task 7).
- Produces: `<HelpButton />` (self-contained: owns open state, renders the drawer); `<HelpDrawer opened onClose />`. Strings in namespace `help`: `button.label` ("Help"), `drawer.title`, `drawer.searchPlaceholder`, `drawer.noResults`, `drawer.browse`, `drawer.viewAll`, `drawer.error`.

- [ ] **Step 1: Write failing tests:** `help-button.test.tsx`: `renders_button_with_accessible_label_and_question_mark`, `click_opens_drawer`, `does_not_fetch_until_opened`. `help-drawer.test.tsx`: `lists_articles_grouped_by_topic_when_query_empty`, `typing_searches_after_debounce_and_shows_title_and_snippet` (mock `fetch`, fake timers), `selecting_a_result_navigates_to_its_link_and_closes`, `shows_no_results_message`, `shows_error_message_on_failure`, `view_all_links_to_/help`.
- [ ] **Step 2: Run; expect FAIL.** `npx vitest run src/mantine/help`
- [ ] **Step 3: Implement.** Button: Mantine `ActionIcon` (`radius="xl"`) styled in `help.module.css` as a solid dark circle with a white "?" using `light-dark(...)` so it inverts in dark mode; wrapped in `Tooltip`. Drawer: Mantine `Drawer` (right), `TextInput` with 250 ms debounce and request cancellation via `AbortController`; empty query shows the browse list grouped by `topic` and ordered by `order`; results show title + snippet. All text through `useTranslation('help')`.
- [ ] **Step 4: Run; expect PASS.** Also run `npx vitest run src/mantine/shell` (shell tests) and `npm run type-check`.
- [ ] **Step 5: Commit.** `git commit -m "feat(help): dark ? help button and drawer in the top bar"`

---

### Task 9: Help pages and routes

**Files:**
- Create: `src/frontend/src/views/help.tsx`, `src/frontend/src/views/help.test.tsx`
- Modify: `src/frontend/src/app.tsx` (add `<Route path="/help" element={<HelpView />} />` and `<Route path="/help/:slug" element={<HelpView />} />` beside the `/user-guide` route, ~line 298, plus the import)

**Interfaces:**
- Consumes: `fetchHelpArticles`, `fetchHelpArticle`, `HelpMarkdown` (Task 7); breadcrumb pattern from `views/user-guide.tsx` (`useBreadcrumbStore`).
- Produces: `/help` — article index grouped by topic with a search box that reuses `searchHelp`; `/help/:slug` — article with a table of contents from `sections`, `roles` shown as badges, a "Go to this screen" link when `route` is set, and scroll to `location.hash` after load; unknown slug shows a not-found message with a link to `/help`.

- [ ] **Step 1: Write failing tests** in `help.test.tsx`: `index_lists_articles_by_topic`, `article_renders_body_toc_and_role_badges`, `unknown_slug_shows_not_found_with_link_to_help`, `deep_link_hash_scrolls_to_section` (spy on `Element.prototype.scrollIntoView`), `route_front_matter_renders_go_to_screen_link`.
- [ ] **Step 2: Run; expect FAIL.** `npx vitest run src/views/help.test.tsx`
- [ ] **Step 3: Implement** the view and routes.
- [ ] **Step 4: Run; expect PASS.** Then `npm run type-check`.
- [ ] **Step 5: Commit.** `git commit -m "feat(help): /help and /help/:slug pages"`

---

### Task 10: Whole-feature verification

- [ ] **Step 1: Full suites.** From `src/`: `hatch -e dev run test-unit -q -n 4` (expect all pass). From `src/frontend/`: `npm run type-check`, `npm run test:run`, `npm run lint`, `npm run check:i18n` (expect no new failures versus `development`).
- [ ] **Step 2: Run it.** In the container, with the dev servers already running: `curl -s "localhost:8000/api/help/search?q=role"` returns section items; open http://localhost:3000, click the "?" in the top bar, search "access", open an article, follow a deep link `/help/roles-and-permissions#<anchor>`.
- [ ] **Step 3: Role-less check.** Recreate the dev container with `MOCK_USER_GROUPS='["nobody"]'` (edit `~/Projects/nucleus-dev/compose.yaml`, then `docker compose up -d --force-recreate dev` and restart the servers). Confirm: `/api/user/permissions` is all `None`, yet the top-bar search and the help drawer find "access" articles, and a data-product search returns nothing. Restore the original `MOCK_USER_GROUPS` afterwards and confirm Admin again.
- [ ] **Step 4: Dark mode.** Toggle the theme; confirm the "?" button is legible in both.
- [ ] **Step 5: Report** anything that differs from the spec, including whether a no-role user can really request access. Do not push; leave the branch `feat/help-index` for review.
