# Phase 0 report: UX adaptation baseline and verification

**Date:** 2026-11-17 · **Repo:** `~/Projects/nucleus` · **Branch:** `development` @ `277a5595` (PR #1 merge) · **Status: awaiting Joey's approval.**
**Updated 2026-11-17 15:03** after the revised brief (`instructions/`, files 09 and 10): see **§11** at the end. Open requests for Joey: `instructions/requests-from-claude.md`. Test checklist for the browser agent: `instructions/test-checklist-browser-agent.md`.
No product code was written. The only changes are documents under `docs/notes/ux-adaptation/` (uncommitted) and one local
git exclude (§1). Evidence for every row is in `phase0-evidence/` (file:line citations); section references below point there.

How the work was done: five read-only research agents each took part of Phase 0 (inventory, search/access/LLM, creation
dialogs/roles/i18n, upstream sync, status of every plan item). The integrator (Claude) re-checked the highest-impact claims
itself; those are marked **[verified by me]**. Everything else is as reported by an agent with a citation and is labelled
`[agent]`. Nothing was confirmed in a browser (no browser was available), so UI-level conclusions say so.

---

## 0. What you need to decide (read this first)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| 1 | **Upstream strategy** (D1): merge vs port | **DECIDED (Joey, 2026-11-17: "D1 defaults"): port by file list now; schedule upstream sync as a separate project.** | 47 conflicting files (> the brief's 25 limit). 16 are mechanical locale files, ~9 trivial, ~19 need judgment, mostly because the fork moved shadcn → Mantine. See §3. |
| 2 | **Add a "Phase 1.0" fix before any feature work** | **Yes**: fix the nav permission ids and add a real Data Consumer/Producer test persona. | Search, My Products and My Requests are gated on ids the backend never returns (very likely hidden for everyone, admins included). Every consumer acceptance test depends on this. §5.1 |
| 3 | **Search exposure of draft products** | **Fix as its own small bug fix before building marketplace search on the index.** | The search index is built over *all* products (`is_admin=True`) and carries no publication scope. Likely lets anyone with data-products READ search draft names and descriptions. `[verified by me]` at index build; query-time filtering not found. §5.2 |
| 4 | **Vocabulary table (O3)**: the "Subscribe → Request access" row | **Do not rename.** Keep "Subscribe" for notification subscriptions; add a real "Request access" action. | In this app "Subscribe" is a *notification* subscription, and "My Products" lists a consumer's subscriptions. §5.6 |
| 5 | **LLM in the deployed app (O4)** | **ANSWERED (Joey, 2026-11-17): enabled in the deployed app; its auth needs a refresh. Clarified: Helix is the conversational interface over Genie One.** So the "Ask a question" hand-off (D4) targets **Helix**. Plain-language policies (D10) must NOT depend on Helix (it answers data questions with the user's own Databricks access; it does not draft rules): D10 stays gated on the backend LLM client's status endpoint (R9 asks whether that endpoint is available). See §11. | The local `/api/llm-search/status` 500 is consistent with the stale auth (no usable OBO token locally), not with the feature being off. The plan should still treat an error from the status endpoint as "disabled". |
| 6 | **Pilot users (O5)** and test sessions | **BYPASSED (Joey, 2026-11-17): local run, no users; the goal is that the app is usable and makes sense.** Replaced by an agent-run task walkthrough through the UI with a "does it make sense" rubric (checklist section 3.10); an expert review, not user research. | Stated limits in `usability-baseline.md`. The approval gate for Phase 0 no longer waits for people |
| 7 | **Unity Catalog writes (O6)** | Define the approval path before Phase 4 starts. | Phase 4 writes comments to UC. No code is needed yet. |
| 8 | **Rebrand (O7)** | Copy is already "Nucleus". Decide whether `DATABRICKS_APP_NAME` (default `ontos`) should change too. | `f7cf4e9b`/`dc792451` renamed the product; the config default was not touched. |
| 9 | **Product version default** | Decide `0.0.1` (today) vs `1.0.0` (brief). | The create dialog defaults to `0.0.1` (`data-product-create-dialog.tsx:91`). |
| 10 | **Request-access wizards are seeded inactive** | Decide whether to activate `request-access` / `subscription` in dev and prod. | `is_active=False` in the dev DB, so "Request access" uses the legacy form today. §5.5 |

Smaller follow-ups for Joey: how to commit these documents (branch `ux/p0-baseline` + PR?); and whether to add an `upstream`
remote to this clone (not needed now; needed when the sync project starts).

---

## 1. Hygiene (§0.1)

- Branch `development`, HEAD `277a5595` = merge of PR #1 (`feat/help-index`). `git branch -a` shows only `development` and `origin/*`. The
  brief's hard rule 11 ("`feat/help-index` is in flight") is **obsolete**. Base branch for new work: `development` (O2, answered).
- Commit count is 1,814, not 1,802. Authors are mostly upstream's (about 1,032 by one upstream author, 209 by Joey), because the fork contains
  upstream's history. The brief's "all by Joey" is wrong. `[agent]` §01.
- `verify-fork.sh` is ignored via a committed `.gitignore` entry (`1c9ae35d`), not `.git/info/exclude` as the brief says; the effect is the same.
- **One local change was made outside the working tree:** `.superpowers/` (scratch and review ledgers) had stopped being ignored, so
  I appended `.superpowers/` to `.git/info/exclude`. It is local-only and untracked; remove that line to undo.
- Files read: `CLAUDE.md`, `.cursor/rules/*` (summarised in §01), `docs/notes/database-migrations.md`. `.planning/` and `docs/superpowers/`
  are fork-only; everything else under `docs/{notes,decisions,prds,user-journeys}` is inherited from upstream. `docs/user-journeys/01-*.md:43`'s "no wizard"
  sentence is present and stale, as the brief said.
- **Alembic:** single head `d2_backfill_uc_branch`, 93 revisions (upstream: 100, head `o2_step_execution_message`). The wave-letter list in the migrations
  rule is stale (the fork already uses `k1`..`z8`, `aa1`); pick ids by checking `alembic heads`, not by that list.

## 2. Corrections to the brief (assumptions that were wrong)

| Brief says | Reality | Evidence |
|---|---|---|
| Fork has 1,802 commits, all by Joey | 1,814; mostly upstream authors; Joey 209 | §01 |
| No common ancestor with upstream measured | Common ancestor `ba99c8e4` (2026-11-04); 210 fork-only, 90 upstream-only | §02 |
| `components/semantic`, `knowledge`, `enrich` may be fork-only | All three exist upstream; fork-only parts are restyle CSS and a few files. The only fork-only top-level frontend dir is `mantine/` (104 files) | §01 |
| Copilot panel is an upstream feature to port (D1) | The fork replaced it on purpose (`mantine/ontos/ontos-window.tsx`, `1639bc40`). Do not port | §02 |
| §1.1 file list for nav hiding (`navigation.tsx`, `quick-actions.tsx`, `*.nav-visibility.test.tsx`) | `components/layout/navigation.tsx` and `sidebar.tsx` have **no importers**; the live menu is `mantine/shell/nav-config.ts` `visibleNav()`. Frontend must be rewritten there. The brief's migration path and file list also miss several files | §02, §03 |
| A12: a seeded approval workflow for `for_request_access` does not exist | `request-access` (`default_workflows.yaml:1228`) exists, approval mode, with `reason` (min 10) and `expiry_days`. It is **inactive** | §03, §04 |
| A13: 5-step contract wizard is the contract creation flow | The wizard is imported only by its own test (dead code). Real creation is the single-form `DataContractBasicFormDialog` (`views/data-contracts.tsx:802`) | §05 |
| §3.2: defaults `version=1.0.0`; hide status/tenant | Product dialog already defaults `0.0.1`, status draft, tenant optional. Only `name` is required; domain/owner team required would be *new* validation | §05 |
| §3.4: contract columns lack a form editor | `schema-property-editor.tsx` (1,223 lines) already edits business name, classification, required, unique, examples, concepts | §03 |
| §3.5: use `suggestion_routes.py` | Fork's term-mapping heuristics (`/api/term-mappings/suggestions-for`) already cover contract properties; better source | §03 |
| §1.3: home is shadcn but restyled search-first needs `?q=` | Home has a hero search, but it is a global typeahead that never navigates to `/marketplace?q=`; marketplace keeps its query in local state | §03 |
| Restyle "consumer"/"admin" are persona UIs | They are permission-gate test fixtures (consumer = Read-only on everything). No consumer layout exists; a real Data Consumer sees a *smaller* nav than the fixture | §01 |
| §1.4 rename "Subscribe" → "Request access" | "Subscribe" is a notification subscription, not access. Rename is invalid | §05 |

Confirmed as the brief said (A2): per-role nav hiding is absent in the fork **[verified by me]**: no file mentions `hidden_nav_features`, there is no such migration, and
`GET /api/user/navigation` returns 404.

## 3. Upstream relationship and strategy (§0.2)

- Common ancestor `ba99c8e4`; **210 fork-only / 90 upstream-only** commits. Trial merge in a throwaway clone (since deleted; your repos untouched):
  **47 conflicted files**, 94 more edited on both sides but merged cleanly, 525 upstream-only changes.
- The 47: **16** locale JSON (`assets.json`, `search.json` × 8 locales; one hunk each, key additions on both sides, unionable by script),
  **3** `docs/handbook/*` (rebrand wording), **28** other: about 9 trivial; about 19 need judgment, mostly "fork replaced upstream's approach"
  (Mantine vs shadcn). The one true logic conflict is `controller/search_manager.py` (upstream's pre-resolved `effective_permissions` refactor vs the fork's
  `HELP_ITEM_TYPE` exemption, in two places) and its test.
- Per the brief's rule (> 25 conflicts → port by file list), **port**. Nav hiding is one upstream commit (`9ecf93a3`, 38 files); only 5 files overlap
  with fork edits. Its migration descends from a revision the fork lacks (`b10_compliance_run_warning_code`), so create a **new** revision on `d2_backfill_uc_branch` with the same idempotent body; do not port `o1_merge_r1_c7`.
- Upstream added **lifecycle deprecation** (#1042) and **metric views** (#1263, #1276) that the plan does not mention; they touch the product/contract
  views and request dialogs the plan edits. Upstream has no work on marketplace, readiness, access requests or UC description write-back.
- Risk if merged later: a merge would leave two Alembic heads (needs a merge revision); "clean" means git-clean only; no tests or build were run on the trial merge.

**Recommended:** port nav hiding by file list in Phase 1; run a separate upstream-sync project after Phases 1 to 3 (budget ~19 judgment conflicts plus a full test run).

## 4. Inventory of fork-only work (§0.3, condensed; detail in §01)

| Area | State | Overlap with plan |
|---|---|---|
| Restyle (Mantine) waves 0-1, 2, 3 | Merged (`9b63ed70`, `54277c32`, `564e4307`). Waves 4 (Settings), 5 (**Home**, About, docs pages), 6 (remove Tailwind/shadcn): no plan, no code | Marketplace, Search, My Products, My Requests, product/contract pages are Mantine. **Home is still shadcn/Tailwind**, so Phase 1's home work builds on an un-restyled page. The restyle spec explicitly excludes navigation/IA, i.e. Phase 1 is its "separate later project" |
| Consumer vs admin layout | **None** (see §2) | Phase 1 is a new build |
| Help system | Complete (PR #1). Items are `type="help"`, `feature_id="help"`, id `help::<slug>#<anchor>`; visible to everyone | Phase 2 must exclude `type=="help"` from marketplace results. `GET /api/search` has no type filter |
| Role switcher | Exists: user-menu "Apply role override" (`POST /api/user/role-override`; admins and local dev). The test-persona picker is off in dev (`TEST_USER_TOKEN` unset). `MOCK_USER_GROUPS` needs a backend restart | Answers "how do we view the consumer experience": use role override |
| Shell | `mantine/shell/` side strip + panel nav; `nav-config.ts` filters on permission + maturity only | The place per-role hiding must go |
| Product rename | Copy is "Nucleus"; `DATABRICKS_APP_NAME` still `ontos` | O7 |

## 5. Verification answers (§0.5)

### 5.1 Navigation and home: a probable live bug
- `nav-config.ts` gates Search (`:163`), My Products (`:228`) and My Requests (`:231`) on permission ids `search`, `my-products`, `my-requests`.
  **[verified by me]** none of these exist in `backend/src/common/features.py`. That the permission lookup skips unknown ids (`authorization_manager.py:104-107`) and treats them as
  no access is `[agent]` (I did not read how the frontend store handles a missing id). A live `GET /api/user/permissions` returns `None` for all three (`[agent]`). Result: very likely hidden for every role, admins included. The e2e fixtures inject these
  ids, which hides the bug. **Not confirmed in a browser.**
- Real default Data Consumer (code, `settings_manager.py:132-145`): READ_ONLY on 10 features plus comments RW; no `settings`; sidebar is about **4 top-level items** (Marketplace,
  Data Catalog, Data Contracts, Products) by code reading; the live dev role also lacks `semantic-models`, so no glossary. The plan's "≤ 5 items" acceptance cannot be tested meaningfully until the gating is fixed.
- Home: `home_sections` order is hard-coded; `REQUIRED_ACTIONS` is skipped in the role loop; overview tiles and "My Actions" render for every role.
- **My Products** lists the consumer's **subscriptions** (`/my-subscriptions`), not a producer's own products; My Requests also has a duplicate Subscriptions tab.

### 5.2 Search as the marketplace retrieval layer (A22, D4)
- `GET /api/search` takes only `search_term`: no type filter, no limit, no pagination. A type-filtered `query_index` exists but only for MCP.
- The data-product index items carry no certification, quality, classification, `updated_at`, owner contact or publication scope; cards must load details from `/api/data-products/published`.
- **Exposure:** the index is built with `list_products(limit=10000, is_admin=True)` **[verified by me]**, i.e. all products including drafts; the agent found no query-time publication filter. Draft names/descriptions are therefore likely
  searchable by anyone with `data-products` READ. Confirm with a draft product in dev, then fix before marketplace search relies on the index.
- Ranking (title boost 3.0, priority 1; description boost 1.0; tags 0.5) would find "marketing cost" by description, but unfiltered, glossary terms outrank products.
- `/api/data-products/published` has owner team name, certification, `updated_at`, `team.members`, support. Missing: classification (only per contract column), quality, rating, subscription state, clean owner contact.
- Dev has **0 published products** and no data-product items in the index, so the T1 baseline needs seed data first.

### 5.3 Access requests (A12, A10, D5, A11)
- Entry point is `RequestProductActionDialog`; `request-access-with-duration-dialog.tsx` is dead code; the marketplace has only "Subscribe". `access-grant-request` is process-mode; `request-access` (approval mode) is seeded but inactive.
- Where data goes: access `reason` → `access_grant_requests.reason`, shown to approvers as "Reason" (`handle-access-grant-dialog.tsx:213`). My Requests does not show it. In the subscription wizard, `reason` → `subscription_reason`; `use_case` only in `agreements.step_results` and the PDF.
- **Two wizard bugs `[agent]`:** (1) the wizard's duration is ignored (payload always carries 30; `request-product-action-dialog.tsx:516-524`); (2) a field not named `reason` (e.g. `purpose`) fails the backend's `reason` min-length with HTTP 422. The plan's required "Purpose" field must account for both.
- `user_action` supports `required_fields`; `minimum_input_length` applies to one primary field only; the designer schema allows only text/checkbox (frontend renders `select`).
- Terms (A11): `legal_document` reads only its own `body_markdown`. Contract purpose/usage/limitations are `data_contracts.description_*`; a product's are in `data_product_descriptions`. There is no "primary output port" concept; define one. `[agent]` the wizard's markdown renderer permits `javascript:` links (pre-existing; worth a small hardening ticket).
- Open: whether the Consumer role has `access-grants` READ_ONLY (the wizard needs it); whether `checkbox` fields render; whether a wizard session links to an `access_grant_requests` row.

### 5.4 Creation flows (A13)
- Product dialog: 13 fields, no "Advanced" section; defaults version `0.0.1`, status draft. Contract creation is a single form; the 5-step wizard is dead code. "Infer schema" reads `/api/assets/{id}/infer-schema` or `/api/schema-import/metadata`, mounted only on the contract details view (after a contract exists).
- Both live dialogs use Mantine + react-hook-form + zod, which is why the brief's form-field grep found nothing.

### 5.5 LLM (A23)
- On when `LLM_ENABLED=True` and `LLM_ENDPOINT` set; `src/app.yaml` and the wave-2 plan say True. Locally `/api/llm-search/status` returns 500 (no OBO token), not `enabled:false`; the plan must treat an error as disabled. **Joey confirmed it is on in the deployed app and that its auth needs a refresh (O4 answered); nobody has re-checked the deployed status endpoint after the refresh.**

### 5.6 Vocabulary and i18n
- Only "Data Contracts" already matches the proposed labels. Banned consumer terms in English values: about 232 occurrences (Deliverable 40, Consumable 24, ODCS 36, ODPS 29, FQN 5; biggest files `data-products` 101, `data-contracts` 52). Nav labels now live in `shell.json`.
- `workflowDefaults.json` is applied by a reverse lookup on exact English text; the YAML comment is only partly true (Terms of Service step, acknowledgement labels and body markdown stay English).
- Locales: de, en, es, fr, it, ja, nl, pt. Parity test covers `data-contracts`, `data-products`, `workflows`, `data-domains`, `database-schema`, `workflowDefaults` only. Seed-data edits (`settings.yaml`) appear to apply only to an empty DB `[agent]`.

## 6. Status of every plan item (§0.4)

30 rows: **Done 1 · Partial 9 · Todo 20 · Superseded 0** (one sub-part of 3.5 is superseded). Full table with evidence: `phase0-evidence/03-status-table.md`.

| Task | Status | Headline |
|---|---|---|
| 1.1 per-role nav hiding | Todo | Backend portable; frontend must be rewritten into `visibleNav()`; new migration revision |
| 1.2 persona nav seed | Todo | Needs 1.1 and the gating fix |
| 1.3 home | Partial | Hero search exists but does not submit to `/marketplace?q=`; tiles/My Actions not role-gated |
| 1.4 vocabulary | Todo | Apply table with the "Subscribe" correction |
| 1.5 contextual help | Partial | Help system done; no `help-link.tsx`; missing articles: *Who owns this data*, *What does certified mean*; `requesting-access.md` is mostly about roles |
| 1.6 tests | Todo | Need a real Data Consumer persona first |
| 2.1 marketplace cards | Partial | Inline card, no classification/updated/owner contact; per-card badge fetches (N+1 unverified) |
| 2.2 search | Todo | Needs server-side type filter, published-only; `q` URL sync |
| 2.3 step 1 registry | Todo | Cheap: `computeDefaultViewMode` / `shouldShowSectionForViewMode` already pure and exported |
| 2.3 steps 2, 3 | Todo | No consumer view; `components/product-consumer/` absent |
| 2.4 example data | Todo | Nothing exists |
| 2.5.1 `body_source` | Todo | Nothing exists |
| 2.5.2 seeded workflow | Partial | `request-access` exists (inactive); extend it |
| 2.5.3 persist/show Purpose | Partial | Persisted and shown to approvers as "Reason"; not in My Requests |
| 2.5.4 legacy fallback | **Done** | Keep |
| 2.6 My Requests timeline | Partial | Table only; no timeline/expiry/purpose |
| 2.7 / 3.7 journeys | Todo | Needs persona fix |
| 3.1 mount readiness | Todo | `ReadinessChecklist` imported nowhere; 6 checks, English names hard-coded in the backend |
| 3.2 simple mode | Partial | Defaults mostly there; 13 fields; no Advanced |
| 3.3 start from a table | Todo | Do **not** reuse `self_service_routes` (it creates UC objects) |
| 3.4 form-first contracts | Partial | Form editor exists; relabel and Advanced split |
| 3.5 suggestions | Partial | Heuristics exist at contract level, not per column; no next-step banner |
| 3.6 score/leaderboard | Todo | Nothing exists, incl. migration |
| 4.1 UC comment sync | Todo | Only tag sync exists (`uc_tag_sync`) |
| 4.2 plain-language policies | Todo | No LLM in compliance code |
| 4.3 data map | Todo | Marketplace has a domain-graph mode (domains only); extend instead of a new page |
| 4.4 / 4.5 | Todo | Record only / final report |

## 7. Baseline measurement and usability test (§0.6)

**Not run.** Prepared: `usability-baseline.md` (script, five tasks T1-T5 with success criteria, observer sheet, metrics, and the list of 14 screenshots: 7 screens × Consumer/Producer).
- Existing restyle baselines (77 pages × `consumer`/`admin`) cover Home, Marketplace, Product detail, My Requests and Glossary, but they are fixture screenshots of the main area only, pinned to macOS Chrome 156.0.8078.81 (your Chrome is 157), with no Producer set and no dialogs. Capture the 14 fresh against the real app.
- Prerequisites before T1 can be measured: published products with owners and certification, glossary terms, a consumer you can sign in as (role override), and the nav gating fix (§5.1).
- Needs from you: pilot users (O5) and someone to run sessions and take screenshots.

## 8. Proposed changes to the plan (with reasons)

1. **Add Phase 1.0:** fix nav gating for `search`/`my-products`/`my-requests`; add real Data Consumer and Data Producer e2e personas built from `DEFAULT_ROLE_PERMISSIONS`. *Every consumer acceptance test depends on both; the first is probably a live bug.*
2. **Re-scope §1.1:** port the backend (migration as a new revision, model, `/api/user/navigation`); implement the frontend as a predicate in `visibleNav()` plus the Mantine role form. Drop the upstream `navigation.tsx` diff and the copilot panel.
3. **Add a small security fix first (draft products in search)** if confirmed (§5.2), and make marketplace search published-only.
4. **Pull 2.3 step 1 (section registry) and 3.1 (mount readiness) forward** into Phase 1. *Already pure functions; cheapest visible win for producers.*
5. **Re-scope 2.5:** extend the existing `request-access` workflow (contract-terms `legal_document` + acknowledgements + Purpose relabel + agreement/PDF); fix the two wizard bugs; find out why the workflows are inactive. Drop "seed a new workflow" and the select-for-duration work.
6. **Shrink 3.4 and 3.5** to relabel/Advanced split and per-column wiring of the existing term-mapping suggestions; move the next-step banner after 3.1.
7. **Move 2.2's backend filter early** (`types` on `/api/search`, published-only); seed dev with published products before measuring T1.
8. **4.3:** extend the marketplace's domain-graph mode with product nodes instead of a separate `views/data-map.tsx`.
9. **Vocabulary:** keep "Subscribe"; add a real "Request access"; add `shell.json` to the files the table edits; run the banned-term grep on consumer-reachable namespaces.
10. **Home is wave-5 restyle (shadcn):** decide whether Phase 1's home work includes restyling it or waits for wave 5.
11. **Upstream sync** becomes its own project after Phase 3 (§3). Phases 1-4 will keep editing files upstream also edits, so conflicts grow with time; budget accordingly.

## 9. Risks the brief's own material warns about (for the record)

Catalog over-indexation; data mesh being organisational, not a product; needs several independent domain teams. Not plan items.

## 10. Gate

**Stop for approval.** Please answer §0 (items 1-10) and say whether to commit these documents on a branch (`ux/p0-baseline`) and open a PR. After approval I will write the Phase 1 plan (Phase 1.0 + 1.1-1.5 as re-scoped) and
implement it in small branches per `07-cross-cutting-standards.md`. Nothing in Phases 1-4 will start before then.

---

## 11. Update after the revised brief (2026-11-17 15:03)

**What arrived:** `instructions/` (the unpacked zip): files 00 to 07 revised, 08 unchanged, new `09-nucleus-glossary.md` and
`10-baseline-observations.md` (a manual walkthrough as Data Consumer via role override), plus 12 screenshots in `instructions/screenshots/`
(viewed 06, 07, 10; they match the notes). New decisions D14 to D17 and open questions O8 to O11. Hard rule 12: seed dev data before consumer testing.

**Method:** one more read-only agent for the frontend questions, plus checks run by the integrator on temporary backends (never on the main one). Tags: **[verified by me]**
= I ran it; `[agent]` = reported with citations (`.superpowers/phase0/override-ui-gaps.md`, not copied here).

### 11.1 Confirmed (independent of the first pass)
The walkthrough saw what Phase 0 derived from code: the consumer rail (Discover [Marketplace, Data Catalog], Build [Contracts, Products], plus Govern only with Alpha on), no My Requests and no glossary,
0 published products, a hero search that does not submit to the marketplace, a role override switcher, the Help drawer. The prediction of "about 4 top-level consumer items" matched.

### 11.2 New findings and answers
| Item | Finding | Status |
|---|---|---|
| **O8: why the workspace connection fails locally** | The backend log shows `403 Forbidden: Invalid Token`: the container backend reads `DATABRICKS_TOKEN` only at start and the token had expired. **Corrected 15:42:** my first refresh (15:06) did *not* give an hour: `databricks auth token` returned a cached token issued at 14:15 that expired at 15:15, so Helix returned HTTP 500 at 15:40. Fixed: `refresh-token.sh` now uses `--force-refresh` and prints the real expiry; new 60-minute token (expires 16:42) and a second backend restart (the operation Joey approved, repeating it to repair my error). Longer term: a service principal or a token the backend re-reads | **[verified by me]** log, token timestamps (read from the token itself, never printed) |
| **D15: edit and delete icons for a consumer** | Backend is correct: a genuine consumer (group `data-consumers`) and the override user both get **403** on `PUT`/`DELETE` of contracts and products (permission check runs before the handler; non-existent ids used, nothing modified). The gap is in the frontend: in `views/data-contracts.tsx` the Pencil (`:587`), Trash (`:597`) and bulk "Delete Selected" (`:697-716`) have **no gate**, while New Contract/Upload are gated by `canWrite`; `data-products.tsx:778,792` gates its row actions. Ungated for every role. Trust/clarity issue, not a security hole | backend **[verified by me]**; frontend `[agent]`, matches screenshot 06 |
| **Role override is not a faithful consumer preview** | A genuine consumer gets **0 of the 9 contracts** (only active/deprecated are shown to non-admins; all 9 are draft/personal); the override user gets 9, because the admin check by group membership runs before the override. **Joey accepted overrides as the persona method** (screenshots must show the override), with this recorded as a known limitation | **[verified by me]** both counts |
| **Override is stored server-side** | `GET /api/user/role-override` returns a role id for the dev user; every API call as that user behaves as Data Consumer until it is cleared (request R6) | **[verified by me]** |
| **"Personal" badge / "Owner N/A"** | `Personal` = `draftOwnerId` is set (a personal draft). `Owner N/A` = `owner_team_name` empty for all 9. All 9: draft, 0.1.0 (one 0.3.0), no tags, no project, `publication_scope` none | `[agent]`; counts **[verified by me]** (R5 asks whether intended) |
| **Preview toggles (D17)** | The Beta toggle shows to every user; the **Alpha toggle only to real admin-role members** (the walkthrough saw it because the signed-in user is an admin). Defaults: Beta on, Alpha off, saved in browser localStorage. So D17 is partly satisfied already; hiding Beta from consumers is the remaining work | `[agent]` |
| **My Requests / Search / My Products** | Missing for **every role, admins included** (their permission ids are not in the backend registry; the frontend treats a missing id as no access); confirmed by a live GET of Admin's permissions | `[agent]`; ids absent from registry **[verified by me]** (§5.1) |
| **Glossary** | Build → Concepts, gated on `semantic-models`. The dev-DB Data Consumer role has it **None**, the code default gives Read-only; the database is a copy of the Lakebase `nucleus` branch, so this may be intentional there, not stale (question for Joey) | `[agent]` + **[verified by me]** role listing |
| **Reaching full pages** | Contract row click and the version badge open `/data-contracts/:id` (the eye dialog has no link); product row click opens `/data-products/:id`; a marketplace card's "Open in details" / dialog "Go to details" opens `/my-products/:id` | `[agent]` |
| **Greeting "Hello, Local"** | First word of the display name (`Local Developer`); a real "First Last" name works; unknown for SSO users | `[agent]` |
| **Help button shape** (not a brief item) | Visible in the screenshots: dark with a white "?", left of the bell, but a **rounded square**, not the circle the spec asked for | screenshot 06; minor follow-up to the help-index work |
| **Search description pollution (D16, O11)** | Search rows show full domain descriptions including "PROPOSED PLACEHOLDER", source file paths and internal repository names and commit ids, readable by consumers | screenshot 10; data issue (R7) |

### 11.3 Effect on the plan
- **D14 seed data (hard rule 12) becomes part of Phase 0.** Proposal drafted in `seed-data.md` (8 products); needs approval (R2). Seeded products likely need their contracts **activated** and an owner team, because non-admins never see draft contracts.
- **D15** narrows to: gate the Contracts explorer's Pencil/Trash/bulk delete the way the Products list does, plus tests that run as the Consumer persona. The backend needs no change.
- **D17** narrows to: hide the Beta toggle from non-admin roles and default both off for consumer sessions (Alpha is already admin-only).
- **D4 / Phase 2.2:** the "Ask a question" hand-off goes to Helix. **D10** needs a drafting LLM that is not Helix (R9).
- **§1.2 target:** a Data Consumer should see Discover and Helix only (Discover ≤ 2 items). Today a consumer sees Build, and Govern when Alpha is on. The Data Catalog is technical and erroring; hide it from consumers.
- **Phase 1.0** (fix nav gating + personas) is still first; with overrides accepted, the "real consumer persona" in e2e fixtures remains a code task, not a browser one.
- **Stale items in the revised documents** (README rule 11 and header; glossary stack line and the 5-step wizard; O1): listed in request R10. I have not edited the instruction files.

### 11.4 Not rerun (unchanged by the revision)
Upstream sync (§3), search and access-request analysis (§5.2 and §5.3), creation dialogs (§5.4), the status table (§6). Their conclusions stand; the only edits are the corrections above.

### 11.5 Still open
Pilot users and test sessions (decision 6): the first manual capture is a reference, not the baseline. R2 (seed list) and the defaults in decisions 2, 3, 4, 7 to 10. (R1, the token and backend restart, is done.)

### 11.6 Seeding (2026-11-17): DONE
Joey chose option B, then option 1 of R12 (act as the draft owner's identity in the local dev app) and asked for synthetic business roles. Done in the **dev database only** through the API (script `seed.py`: idempotent, with dry-run and a write log): **8 data products** active, published to the organization, certified (Gold 2, Silver 3, Bronze 2, none 1) and tagged `seed/ux-baseline`; **8 contracts** committed out of personal draft, owner team set, active; **8 synthetic business roles**. Verified through the API as an admin and as a **genuine consumer** (a temporary backend in group `data-consumers`): the consumer sees all 8 published products and all 8 active contracts, and search finds them. Full record and undo: `seed-data.md` section 5.
Findings: (1) `from-contract` does not set the product's owner team although its description says it inherits it (set afterwards with a full-document `PUT`, possible only while the product is a draft); (2) the personal-draft commit compares the caller's **username** with the stored draft owner **email** (`routes/data_contracts_routes.py:4216`, `controller/data_contracts_manager.py:5014`); (3) the contract list reports `draftOwnerId` but the single GET returns `draft_owner_id: null` for the same contract; (4) writes through one backend process leave another process's search index stale until `POST /api/search/rebuild-index` (called once on the main backend); (5) the Web Analytics contract contains injection-style column names (`<b>EVT</b>`, `<%=7*7%>`, `#{7*7}`), now covered by checklist item WEB-1; (6) hard rule 12 (seed before testing) is met, so consumer testing is unblocked except for pilot users (R4).

---

## 12. Update 2 (2026-11-17, after the browser agent's first run and the R4 bypass)

### 12.1 Corrections to my own earlier statements
- **Token lifetime:** I said the token refreshed at 15:06 lasts an hour (to 16:06). It did not: `databricks auth token` returned a cached token issued at 14:15, so it had **8 minutes** left and expired at 15:15. The Helix HTTP 500 at 15:40 was that expired token, not a separate bug. Fixed: `refresh-token.sh` now forces a fresh token and prints its real expiry; new token (15:43) expires 16:42; the backend was restarted again at 15:43 (the operation Joey approved earlier, repeated to repair my error). Records corrected in the requests file, checklist and usability baseline.
- The first run's PRE-1 (checked about 15:35, no banner) does not contradict this: the banner can lag behind real failures; Helix and the Data Catalog fail first.

### 12.2 Decision
Pilot-user sessions are **bypassed** (decision 6). The remaining gate before Phase 1.0 is Joey's approval of this report and a completed agent walkthrough (checklist 3.10).

### 12.3 Browser run 1 (`instructions/test-results/2026-11-17-run1-browser-pane.md`): what it established
Run in the Claude desktop browser pane, through role overrides. It could not save screenshots (request R15); evidence is page text, DOM and read-only GETs. Nothing was submitted or changed.

| Area | Result |
|---|---|
| Passed as expected | Seed present (8 products, certification Gold ×2 / Silver ×3 / Bronze ×2 / none ×1); consumer rail = Discover [Marketplace, Data Catalog], Build [Contracts → Explorer, Products → All products], Helix (3 groups, 5 items; no Govern with Alpha off); marketplace search is a plain substring filter ("marketing cost" finds **nothing**, so task T1 fails today; "customer" finds 1); product-create dialog has 13 fields and no Advanced section; contract-create is a single dialog; no readiness UI on the product page |
| **WEB-1 (security)** | **PASS, no finding:** `#{7*7}`, `<%=7*7%>` and `<b>EVT</b>` render as literal text; no bold element, no "49" |
| Direct URLs are not blocked | `/my-requests` loads for the consumer (it is only missing from the rail); `/search` redirects to `/search/llm`; `/concepts/browser` opens for a consumer although `semantic-models` is None. Confirms that navigation hiding is not protection (the backend still refuses writes) |
| Request dialog (REQ-1) | "Request Access to Product": Request Type (default "Request Access"), **"Reason for Access \*"**, **Access Duration** (default 1 month), Cancel / Send Request. A plain form (the wizards are inactive); no terms text |
| Gating gaps (D15) | Consumer override: Preview Metadata, Edit and **Delete** icons on every contract row; on the product page a plain **Delete** button under a "Read-Only" banner. The backend refuses both (verified earlier: 403). A Producer sees "Delete (Permission Denied)" |
| Product page | Jargon on screen: API Ver, Deliverables, ODPS, Genie Space, Tenant; Created/Updated show an em dash |
| **Owner shown three ways** | Card: "Team from contract X (as-is)" (a placeholder I left in the seeded products, **fixed**: `team.name` now holds the owner team); Products list: Owner `N/A` (reads business owners, none assigned: R13); product page: Team "Home Care". A single source of truth is a Phase 2.1 requirement |
| Home | Consumer Overview shows only Data Products (8) and Data Contracts (9); an admin also sees Concepts (1180) and Compliance (0%). Under the override the home listed 3 pending role-request approvals with emails; **for a genuine consumer the approvals endpoints return nothing**, and the source of those rows is unverified, so I do not call it a leak |
| Alpha toggle | Visible but greyed for the consumer override (the earlier code read said admin-only) |
| Helix | HTTP 500: expired token (12.1); retest listed (HELX-1) |

Permissions recorded for the other roles (non-"None"; R = read-only, RW = read/write): **Data Producer:** data-catalog R, data-products RW, data-contracts RW, process-workflows R, access-grants RW, catalog-commander R, data-domains R, teams RW, projects RW, comments RW. **Data Steward:** data-catalog RW, data-products RW, data-contracts RW, compliance R, data-asset-reviews RW, process-workflows R, access-grants RW, catalog-commander R, data-domains RW, teams R, projects R, comments RW. **Data Governance Officer:** Admin on data-catalog, data-products, data-contracts, compliance, master-data, data-asset-reviews, security-features, entitlements, entitlements-sync, access-grants, estate-manager, data-domains; catalog-commander Full; process-workflows R, teams R, projects R, comments RW. **Security Officer:** compliance RW, data-asset-reviews R, security-features Admin, entitlements Admin, entitlements-sync Admin, process-workflows R, access-grants Admin, comments RW; the rail shows only Helix and `/data-products` says "You do not have permission to view data products."

### 12.4 Effect on the plan
- **Phase 2.1:** one owner source for cards, list and page (today three disagree); consumers should not see Delete or Edit anywhere (extends D15 to the product page).
- **Phase 1.2:** the Security Officer persona sees only Helix; decide what a governance-only role should see.
- **T1 needs a better search:** "marketing cost" finds nothing today; the marketplace filter must use the search index (Phase 2.2).
- **Still open:** all picture evidence (R15), the remaining checklist items (3.10 walkthrough, GATE-3 to 6, HELP, WORD-1, I18N-1, SRCH-2 to 4, BIZ-1, TAG-1, NAV-4/5, GOV-2, SEED-4), and approval of this report.


## 13. Browser run 2 (`instructions/test-results/2026-11-17-run2-walkthrough.md`)

Screenshots now saved (14 JPEGs, about 800x600, in `instructions/screenshots/run2/`). I viewed the cards, request dialog and Helix retest and they match the agent's descriptions.

### 13.1 Task results
| Task | Result | Note |
|---|---|---|
| T1 find data | Partial | "marketing cost" finds nothing; the marketplace filter is name/description substring only (Phase 2.2) |
| T2 owner and trust | Pass | Cards show owner team and Gold/Silver badges; Products list Owner column still says N/A (business owners unassigned, R13) |
| T3 request access | Partial | Dialog works but asks for "Reason", not "Purpose"; shows no approver, timing or terms; "Request..." vs "Subscribe" is confusing |
| T4 glossary term | Fail | Chosen term "Customer Lifetime Value" does not exist in the dev glossary (checked as admin: "Customer" exists, nothing for "lifetime"). The glossary is also unreachable from a consumer's rail. Retest with "Customer" |
| T5 producer publish | Partial | The guided "create product from contract" path sits below a 41-row table and shows a raw UUID; there is no start-from-table path |

### 13.2 Other findings
- HELX-1 retest passes (Helix answers, token fresh). Its suggestion chip "What's in this?" has no context, so Helix replies "I can't find anything attached to this message".
- Rail now shows a **Nucleus** group. It is the in-app assistant "Ask Nucleus" (`OntosWindow`), a second assistant next to Helix. Two assistants are confusing for a consumer. Added as NUC-1.
- Home "My Actions > Approvals" rows for the consumer override are **role-request notifications** (type `action_required`, action `handle_role_request`, read from the notifications store, not `/api/approvals/queue`). They come from the Lakebase copy, not my seed. HOME-3 is explained; the question left is whether a consumer should see them.
- Jargon on the product page: API Ver, Tenant, Deliverables, ODPS, Genie Space, Maturity. Created/Updated show a dash. Delete button is shown but disabled.
- **Not explained:** the agent saw the comment count rise 8 to 9 during the run. My write log contains no comment writes and my API check was inconclusive. It could be another editor on the shared copy or an agent action; I cannot say which.

### 13.3 Effect on the plan
Phase 2.2 (search over description), 2.5 (Purpose, approver and terms in the request dialog), 2.3 (plain product page), 1.4 (jargon list above), 1.2 (consumer glossary reach, one assistant), D15 (hide Delete/Edit).

## 14. Browser run 3 (`instructions/test-results/2026-11-17-run3-nuc1-t4.md`)
- **NUC-1 (pass with difficulty):** the "Nucleus" rail item opens a floating "Ask Nucleus" panel over the page (it does not navigate). It offers modeling, mapping, product creation and health prompts. Clicking a prompt opens an "AI-Powered Analysis" consent modal. It overlaps Helix, and a consumer cannot tell from the labels which assistant to use. Answers are untested because the agent did not accept the AI terms (it asked first).
- **T4 retest (fail, confirmed):** searching "Customer" as a consumer returns a product, two domains showing placeholder text, and help rows, but no glossary term. Enter does nothing. The consumer rail has no glossary. The term exists for admins.
- The "Nucleus" rail item is not a Beta item (it stays with Beta off).
- Effect on the plan: Phase 1.2 should hide or merge one of the two assistants for consumers and give the glossary a consumer path. Phase 2.2 should make search return glossary terms and show short summaries (D16) in place of the placeholder text.

## 15. Browser run 4 (`instructions/test-results/2026-11-17-run4-nuc1-answer.md`)
Joey accepted the AI terms and asked the suggested question by hand (the browser operator's permission check blocked the Accept click). Ask Nucleus returned "I encountered an error" with error id `0159c732abaf`.
- **Cause (from the dev backend log, read-only):** `llm_search_manager.py` line 754 calls the Databricks serving endpoint named by `LLM_ENDPOINT`, and the endpoint answered **404 "The given endpoint does not exist"**. `LLM_ENDPOINT` is not set in the dev container's environment, so this is a local configuration gap, not a role or permission problem and not the token (Helix works with the same token).
- **Meaning for the plan:** Ask Nucleus cannot work in local dev until `LLM_ENDPOINT` names a real serving endpoint. The deployed app is said to have it enabled (decision 5). Adding the variable to `compose.yaml` needs the endpoint name from you.
- Not checked: whether the consent prompt reappears, and Admin behaviour (it would hit the same 404).
