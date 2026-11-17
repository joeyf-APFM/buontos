# Phase 0 §0.4: status of every plan item (docs 03 to 06)

Judged against the code on `development` @ `277a5595` (the merge of PR #1, `feat/help-index`), 2026-11-17.
Read-only. Evidence: `[FORK ✔]` = file:line in this repo or a real command result; `[UNVERIFIED]` = inferred.
Live checks were read-only GETs against the dev backend (`docker compose ... exec -T dev curl localhost:8000/...`).

## Summary

30 rows (2.3 split into 3 steps, 2.5 into its 4 sub-items).

| Status | Count | Rows |
|---|---|---|
| Done | 1 | 2.5.4 |
| Partial | 9 | 1.3, 1.5, 2.1, 2.5.2, 2.5.3, 2.6, 3.2, 3.4, 3.5 |
| Todo | 20 | 1.1, 1.2, 1.4, 1.6, 2.2, 2.3 (all 3 steps), 2.4, 2.5.1, 2.7, 3.1, 3.3, 3.6, 3.7, 4.1 to 4.5 |
| Superseded | 0 rows | one sub-part: 3.5's "use `suggestion_routes`" is superseded by the fork's term-mapping heuristics |

The most surprising results:

1. **The sidebar §1.1 tells you to port is dead code in the fork.** The live menu is the Mantine shell
   (`mantine/shell/nav-config.ts`, `visibleNav()` at :353), mounted by `components/layout/layout.tsx:5,106`.
   The old `components/layout/sidebar.tsx` and `navigation.tsx` have no importers. Upstream's
   `navigation.tsx`/`quick-actions.tsx` hiding has to be rewritten into `visibleNav()`, not copied.
2. **Search, My Products and My Requests are probably hidden from every user, admins included.** Their menu
   items gate on permission ids `search`, `my-products`, `my-requests` (`nav-config.ts:163,228,231`), and the
   backend never returns those ids (`common/features.py` has none of them; a live `GET /api/user/permissions`
   as the admin returns `None` for all three). The e2e personas hide this because they inject those ids
   (`tests/e2e/fixtures/personas.ts:5-16`). `[UNVERIFIED]` in a browser.
3. **BRIEF CONTRADICTED (A12): an approval-mode `for_request_access` workflow is already seeded.**
   `default_workflows.yaml:1228` `request-access` asks for a reason (min 10 characters) and an optional
   `expiry_days`. The wizard maps them to `reason` and `requested_duration_days`
   (`request-product-action-dialog.tsx:471-474`). In the dev DB this workflow (and `subscription`) is **inactive**.
4. **The e2e "consumer" baselines are not the Data Consumer role.** The `consumer` persona is Read-only on
   *every* feature (`personas.ts:44-49`), while the real Data Consumer has about 10 features. The restyle baselines
   are the same Mantine pages captured twice. There is no consumer layout yet.
5. **The product page was restyled on Mantine but its S/M/L switch is unchanged.** `computeDefaultViewMode` /
   `shouldShowSectionForViewMode` are now exported pure functions (`data-product-details.tsx:99,122`), which
   makes the §2.3 step 1 extraction easier. There is no registry and no consumer view. `ReadinessChecklist` is still
   imported nowhere.
6. **The fork already has more than the brief assumed in some areas:** a form-based column editor
   (`schema-property-editor.tsx`: businessName, classification, required, unique, examples, concepts),
   heuristic term suggestions that cover contract properties (term-mapping `contract_adapter.py:29`), approvers
   already see the request reason (`handle-access-grant-dialog.tsx:213-219`), and the product is already
   rebranded to Nucleus (`f7cf4e9b`, which bears on O7).

## Status table

| Task | Status | Evidence | What is left |
|---|---|---|---|
| 1.1 Per-role nav hiding | Todo | `[FORK ✔]` `grep -rln "hidden_nav_features\|hiddenNavFeatures\|use-nav-hidden-features\|user/navigation" src` finds nothing (backend, frontend, alembic, locales). No `use-nav-hidden-features` in `hooks/`. `git log -S hidden_nav_features` is empty. A live `GET /api/user/navigation` returns **404**. Live nav = `mantine/shell/nav-config.ts:353 visibleNav()` (filters on permission + maturity only), used by `use-shell-nav.ts:20`. BRIEF CONTRADICTED (frontend file list): `components/layout/navigation.tsx` and `sidebar.tsx` are orphaned (no importers; `layout.tsx:5` mounts `@/mantine/shell/app-shell`). | Port the backend as listed (new migration on the fork head: 93 revision files). The frontend half must be reimplemented as one more predicate in `visibleNav()` plus the Mantine role form (`components/settings/role-form-dialog.tsx`). Home quick actions (`components/home/quick-actions.tsx`) and About also need it. The upstream `*.nav-visibility.test.tsx` tests will not apply as they are. Rewrite them against `nav-config.test.ts`. |
| 1.2 Seed persona nav | Todo | `[FORK ✔]` `settings_manager.py:57-84` `DEFAULT_ROLES` and `:88-160` `DEFAULT_ROLE_PERMISSIONS`. There is no nav field. A consumer's menu today is limited only by permissions (Data Consumer: data-domains, data-products, data-contracts, data-catalog, teams, projects, business-glossary, semantic-models, process-workflows, catalog-commander RO, comments RW, `:132-145`). Live dev DB: the Data Consumer role **lacks `semantic-models`** (the code default has it, the DB is stale), so the glossary is hidden for it there. Search/My Requests/My Products gate on ids the backend never emits (`nav-config.ts:163,228,231`, and see Summary #2). | Needs 1.1. First fix the `search`/`my-requests`/`my-products` gating (give them no permission or a real feature id). Without that fix the consumer's "show" column (marketplace, search, my-requests, glossary) cannot be met. Decide whether `catalog-commander` RO should stay on the consumer. |
| 1.3 Home composition | Partial | `[FORK ✔]` `views/home.tsx:68-83` already has a hero with a large `SearchBar`. `components/ui/search-bar.tsx:60` is a debounced `/api/search?search_term=` typeahead whose results navigate to `result.link` (`:133`). It has **no submit to `/marketplace?q=`**, and `marketplace-view.tsx:113` keeps `searchQuery` in local `useState` (no URL param). Overview tiles (`home.tsx:86-103`) and "My Actions" (approvals + quick actions, `:105-133`) render for every role. `REQUIRED_ACTIONS` is skipped in the role loop (`:137`). Section order is fixed in code (`home.tsx:55`), so order is **not** configurable. Per-role home_sections exist (consumer `[DISCOVERY]`: `settings_manager.py:642-649`, `796-803`; live DB the same). `home.tsx` has had no restyle commits (last: `f39c3a23` i18n). | Add an Enter/submit to `/marketplace?q=` (keep the typeahead or replace it). Marketplace reads `q`. Gate the overview tiles and "My Actions" by role/section. Change the consumer default to `[DISCOVERY, REQUIRED_ACTIONS]` as specified (`REQUIRED_ACTIONS` currently renders unconditionally). |
| 1.4 Vocabulary | Todo | `[FORK ✔]` en values: `features:concepts.name`="Concepts", `shell:items.assets`="Assets", `shell:items.dataContracts`="Data Contracts" (**already matches** the proposed "Data contracts" apart from case), `features:compliance.name`="Compliance", `features:data-asset-reviews.name`="Asset Reviews", `features:data-products.name`="Products". Counts in `locales/en`: "Business glossary" 0, "Terms & structure" 0, "Policy checks" 0, "Tables & files" 0, "Built from" 0. Banned terms: Deliverable 40, Consumable 24, ODCS 36, ODPS 29, FQN 5. Nav labels now come from `shell.json` (the new shell namespace), not only `navigation.json`/`features.json`. | Apply the table (O3). Edit `shell.json` keys as well as those the brief lists. Run the banned-term grep on the consumer-reachable namespaces. The rebrand (O7) is already done in the code (`f7cf4e9b chore(branding): rename the product to Nucleus`). |
| 1.5 Contextual help | Partial | `[FORK ✔]` Help system merged (HEAD `277a5595` = PR #1 feat/help-index). UI: `mantine/help/help-button.tsx` (one button in `top-bar.tsx:117`), `help-drawer.tsx` (topic index, links `/help/<slug>`). `components/help/help-link.tsx` **absent** (`find -name 'help-link*'` empty). Articles in `src/backend/src/help/content/` (11): Getting started; How Nucleus is organised; Data products; Data contracts; Business glossary and semantic links; Requesting access; Roles and permissions; Domains, teams and projects; 3 walkthroughs. Starter list: *Using the glossary*, covered (`glossary-and-semantic-links.md`). *What is a data contract*, covered but feature-oriented (`data-contracts.md`). *Request access*, partly: `requesting-access.md` is mostly about **role** requests, and product access is one section (`:73-82`). *Find data*, partly (`data-products.md` "Finding data products"). *Who owns this data*: none. *What does certified mean*: none (only `walkthrough-publish-a-data-product.md` mentions certification). Articles carry a `route:` front-matter key (`article_loader.py:40,176`), but no UI uses it for page-contextual help. | Build `help-link.tsx` (an anchor-aware link into the drawer, reusing `help-slug.ts`). Place it on the 5 locations. Write 2 new articles (ownership, certification) and rewrite/split product-access out of `requesting-access.md`. |
| 1.6 Tests (Phase 1) | Todo | `[FORK ✔]` No `navigation.*.test.tsx` exists (`find src -name 'navigation*.test.tsx'` is empty). Nav tests live in `mantine/shell/nav-config.test.ts`. There is no `home` vitest. The e2e consumer persona is all-Read-only (`tests/e2e/fixtures/personas.ts:44-49`), not the Data Consumer role. | Retarget to `nav-config.test.ts`. Add home tests. Add a **real Data Consumer persona** (role permissions from `DEFAULT_ROLE_PERMISSIONS`, no frontend-only ids) to the e2e fixtures before regenerating the consumer baselines. |
| 2.1 Marketplace cards | Partial | `[FORK ✔]` Card rendered inline in `components/home/marketplace-view.tsx:479-539` (restyled on Mantine: `1a767a14`). It shows the name, purpose/usage (2-line clamp), domain, raw `status`, publication, certification, rating and quality badges, the subscribed bell (`:502`), and "Owner: first team member username or team name" (`:484`, with no contact action). It has no classification, no updated date, and no separate `components/marketplace/` (the directory does not exist). Rating/Quality badges fetch per card (`:534-535`; `[UNVERIFIED]` N+1). Dev has 0 published products (`GET /api/data-products/published` → 0 rows), so the payload fields could not be inspected live. | Extract `product-card.tsx`. Add classification (server-side), owner contact, updated date. Drop the raw `status` badge for consumers. The payload model is for the §0.5 agent. |
| 2.2 Search | Todo | `[FORK ✔]` Client-side substring filter on name/purpose/usage (`marketplace-view.tsx:386-390`). No `q` URL param (`:113`, `useState('')`). `GET /api/search` takes only `search_term` (`routes/search_routes.py:41-49`) and has **no type filter**. A live `/api/search?search_term=data` returns 789 items of types asset-*, glossary-term, help (9 for "sales"), data-domain, and **no `data-product` items** in dev. Domain filters exist. | Add a `types` filter to the search route (server-side, so `help` stays out). Add debounce and `q` sync. Keep the client fallback. The "Ask a question" hand-off depends on LLM status: a live `GET /api/llm-search/status` returns **Internal Server Error** in dev (for the §0.5/O4 agent). |
| 2.3 step 1: section registry refactor | Todo | `[FORK ✔]` `views/data-product-details.tsx:72` `type ViewMode = 'minimal'\|'medium'\|'large'`, `:99` `export function computeDefaultViewMode`, `:122` `export function shouldShowSectionForViewMode` (hard-coded lists), `:1348` the wrapper. There is no `*.sections.ts` (`ls views` shows none; `data-contract-details.sections.restyle.test.tsx` is a test name, not a registry). The page uses the Mantine kit (`:61` `PageHeader, PageLayout, Pane...`), and it is 2,330 lines. | Move both functions + `VIEW_MODES` (`:75-80`) into `data-product-details.sections.ts`. They are already pure and exported, so this is a small, safe commit. Tests: `data-product-details.test.tsx`, `.restyle.test.tsx`, `.markup.test.tsx` all exist. |
| 2.3 step 2: consumer view | Todo | `[FORK ✔]` No `'consumer'` mode in `ViewMode` (`:72`). Read-only users default to `'minimal'` (`:115`), which shows `deliverables, description, hierarchy` (`:124-125`). | Add the mode and make it the default for read-only. |
| 2.3 step 3: consumer blocks | Todo | `[FORK ✔]` `components/product-consumer/` does not exist. Reusable: `CommentSidebar` (`data-product-details.tsx:35`), certification/quality/rating badges, `ConceptSelectDialog` with concept links (`:2183`). | All 7 blocks. |
| 2.4 Example data panel | Todo | `[FORK ✔]` `grep -rln "example_data\|exampleData\|ExampleData\|sample_rows\|example-data"` over frontend and backend returns nothing. (ODCS property `examples` exist in the column editor, which is per-column sample values, not a sample-rows panel.) | Everything (D13). |
| 2.5.1 `legal_document` `body_source: contract_terms` | Todo | `[FORK ✔]` `grep -rln "body_source\|contract_terms"` in backend + frontend returns nothing. The designer knows `legal_document` (`components/workflows/workflow-designer.tsx:465,478,709`). The `subscription` workflow uses a static `body_markdown` (`default_workflows.yaml:1118`). | Resolver + designer option + i18n. |
| 2.5.2 Seeded `for_request_access` approval workflow | Partial | `[FORK ✔]` BRIEF CONTRADICTED (A12). `default_workflows.yaml:1228-1257` `id: request-access`, `workflow_type: approval`, trigger `for_request_access`, a single `user_action` step: required `reason` ("Why do you need access?", `minimum_input_length: 10`) + optional `expiry_days`, then `pass`. Added upstream-era in `c95cef7d` (2026-02-16). Live `GET /api/workflows`: "Request Access for_request_access approval **is_active=False** ['user_action','pass']". "Subscription Agreement" is also inactive. `access-grant-request` is **process-mode** (`on_request_access`, steps notification/approval/...), which answers that A12 sub-question. | Extend the existing `request-access` (do not add a second one): add `legal_document` (contract terms) → `acknowledgement_checklist` → the existing reason step, relabelled Purpose → `persist_agreement` → `generate_pdf`. Find out why it is inactive in dev (seed `is_active: true` vs DB False: a local toggle or the loader?). Duration is already captured as a text field (`expiry_days`), so no select is needed. |
| 2.5.3 Persist + show Purpose | Partial | `[FORK ✔]` The reason is persisted (`db_models/access_grants.py:77` `reason = Column(Text)`). The wizard maps `reason`→`reason` and `expiry_days`→`requested_duration_days` (`components/data-products/request-product-action-dialog.tsx:471-474`). Approvers see it (`components/access/handle-access-grant-dialog.tsx:213-219`, labelled Reason). My Requests does **not** show it (`views/my-requests.tsx:255-283`: type, name, permission, duration, status, requested, handled). | Relabel Reason→Purpose for this flow (all 8 locales). Show it in My Requests. Find out whether `persist_agreement` output is linked to the access request. |
| 2.5.4 Legacy fallback dialog | Done | `[FORK ✔]` `request-product-action-dialog.tsx:192` `lookupWorkflowId(triggerType)`, opening the wizard (`:448`) when one is configured, else the direct form with reason validation (`:257-261`, `:303`). `components/access/request-access-with-duration-dialog.tsx` is still present. | Nothing. Keep it. |
| 2.6 My Requests timeline | Partial | `[FORK ✔]` `views/my-requests.tsx` (357 lines, restyled `6cf867fc`). It has Requests/Subscriptions tabs (`:223-232`), a table with a status badge, `RelativeDate` requested/handled, a product link (`:264-272`) and cancel. There is no timeline, no expiry ("Expires on"), no reason/purpose, no "access ready". The data comes from `/api/access-grants/my-requests` (`:103`). | A plain-language timeline per row from the existing fields (created, handled, status, duration → expiry). |
| 2.7 Tests/journeys (Phase 2) | Todo | `[FORK ✔]` Infrastructure exists: `tests/e2e/marketplace-search.spec.ts` (restyle layout checks), `approval-wizard.spec.ts`, `requests-owners.spec.ts`. No T1 to T4 journey specs. | Write the journeys once a real consumer persona exists (see 1.6). |
| 3.1 Mount readiness | Todo | `[FORK ✔]` `components/data-products/readiness-checklist.tsx` exists. `grep -rln "readiness-checklist\|ReadinessChecklist" src/frontend/src` gives no importer other than itself. `routes/readiness_routes.py` has **6 checks** (`:64,77,96,108,118,126`) with hard-coded English names. Registered at `app.py:453`. `data-products:readiness.*` keys are present in all 8 locales (1 `"readiness` block each). | Mount it (after 2.3 step 1). Add the header chip. The check **names** come from the backend in English, so i18n needs check ids or keys, not just front-end strings. |
| 3.2 Simple-mode creation | Partial | `[FORK ✔]` `data-product-create-dialog.tsx` (611 lines, partly Mantine) defaults are `version '0.0.1'`, `status DRAFT` (`:89-92`). It shows **13 fields with no Advanced section**: name, version, status, type, owner team, project, domains, tenant, purpose, limitations, usage, tags, consumer groups (`:395-569`). Contract wizard (2,101 lines, 0 Mantine imports): `'1.0.0'` (`:106`), `status: 'draft'` (`:488`), tenant (`:115`), no "Advanced". | Collapse version/status/tenant/type/consumer groups under Advanced. Plain helper text. Decide whether `0.0.1` or `1.0.0` is the product default (the brief says 1.0.0). Detailed field list is for the creation-dialogs agent. |
| 3.3 Start from a table | Todo | `[FORK ✔]` `grep -il "fromTable\|from_table\|createFromAsset\|start-from-table"` returns nothing. Pieces exist: the contract wizard's `InferFromAssetDialog` (`data-contract-wizard-dialog.tsx:9,321`), `schema_import_manager.py` (imports UC assets; 0 references to contracts/products). Note: `POST /api/self-service/create` (`self_service_routes.py:171`) **creates UC catalogs/schemas/tables**, so it is not a reuse candidate (it would write to UC). | New dialog. Back-end "create product + contract in one transaction" endpoint. Reuse the infer-from-asset column read. |
| 3.4 Form-first contract editing | Partial | `[FORK ✔]` `components/data-contracts/schema-property-editor.tsx` (1,223 lines) edits per column businessName (14 refs), classification (17), required (15), unique (14), examples (14), concepts/semantic (13/27), logical/physicalType, primaryKey, partitioned. `schema-form-dialog.tsx` (376). The contract page uses Mantine Tabs per schema (`data-contract-details.tsx:2302-2316`). YAML is export-only (`:886-890`). | Audit the labels for ODCS key names. Put the technical fields (physicalType, partitioned, etc.) under Advanced. Have a non-technical user try it. A whole new `column-editor/` may not be needed: **BRIEF CONTRADICTED** (it assumed no form editor). |
| 3.5 Term suggestions + next step | Partial | `[FORK ✔]` `routes/suggestion_routes.py:35` `/link-candidates` (fuzzy, used by `lineage-editor.tsx:333`). The fork's richer **heuristic term-mapping** covers contract properties: `controller/term_mapping/adapters/contract_adapter.py:29` (`data_contract_schema`, `data_contract_property`), `POST /api/term-mappings/suggestions-for` (`term_mapping_routes.py:294`, "Ad-hoc heuristic suggestions... No persistence"), shown as hints in `ConceptSelectDialog` (`concept-select-dialog.tsx:186-215`). The contract page passes only a **contract-level** `mappingSource` (`data-contract-details.tsx:2816-2822`), not per column. No next-step banner (`grep -rln "NextStep\|nextStep\|next-step"` finds only the approval wizard's step state). | Per-column "Suggested" chips using `suggestions-for` with `data_contract_property` (supersedes `suggestion_routes` for this). Next-step banner (needs 3.1). |
| 3.6 Score/leaderboard/weights | Todo | `[FORK ✔]` `grep -rl "readiness-summary\|readiness_summary\|leaderboard\|Leaderboard\|readiness_weight"` over backend + frontend returns nothing. | All of it, including the migration. |
| 3.7 Tests (Phase 3) | Todo | `[FORK ✔]` `schema-importer.spec.ts` and `data-products.spec.ts` exist. No T5 journey. | T5 e2e. |
| 4.1 UC comment write-back | Todo | `[FORK ✔]` `ls src/backend/src/workflows` has `uc_tag_sync` and no `uc_comment_sync`. `grep "COMMENT ON\|SET COMMENT\|ALTER COLUMN.*COMMENT\|comment_sync"` in the backend finds only `data/demo_uc_setup.sql:492-593` (demo seed DDL). The `comment=` hits in `connectors/` and `data_catalog_manager.py` are reads/models. | Everything (O6). |
| 4.2 Plain-language policies | Todo | `[FORK ✔]` No LLM reference in `routes/compliance_routes.py`, `controller/compliance_manager.py`, `views/compliance*.tsx` (grep `llm\|helix\|ai_query\|serving` is empty). No `describe-rule*`. The assistant tools (`src/backend/src/tools/*.py`) have no compliance tool. The fork has its own assistant stack (`mantine/helix/*`, `mantine/ontos/*`, `mantine/assistant/*`), a possible LLM client to reuse besides `llm_search` `[UNVERIFIED]`. | Everything (O4). Choose which LLM client to reuse (llm_search vs Helix). |
| 4.3 Domain data map | Todo | `[FORK ✔]` No `views/data-map.tsx` (`ls views \| grep -i map` shows only `term-mapping*`). The marketplace already has a **domain graph mode** using `DataDomainMiniGraph` (`marketplace-view.tsx:18,678`), with domains only and no product nodes (`grep product data-domain-mini-graph.tsx` is empty). | New view. It could start from the marketplace graph mode instead of a separate page. |
| 4.4 Out-of-scope list | Todo | Nothing to check (record only). Note that §4.4 item 4 relates to the inactive `"Reference — Grant UC SELECT to requester (on_request_access)"` process workflow seen live (`grant_permissions` step, is_active False). | Record in the final report. |
| 4.5 Final report | Todo | `[FORK ✔]` `docs/notes/ux-adaptation/` holds only `usability-baseline.md` (106 lines, "protocol ready. Sessions not yet run"), **untracked** (`git status`: `?? docs/notes/ux-adaptation/`). No `phase0-report.md` or `final-report.md` yet. | Phase 0 report, then the final report. |

## (a) Items that are Done (skip)

- **2.5.4 Legacy fallback dialog**: `request-product-action-dialog.tsx:192` looks up the `for_request_access` wizard
  and opens it at `:448`, falling back to the direct form with reason validation (`:257-261`, payload `:303`).

Nothing else is fully Done. The parts closest to done, which later phases should not rebuild:
the seeded `request-access` approval workflow (2.5.2), reason persisted and shown to approvers (2.5.3), the form-based
column editor (3.4), heuristic term suggestions for contract properties (3.5), readiness i18n keys in all 8 locales (3.1),
the home hero search (1.3), and the help system with 4 of the 6 starter topics roughly covered (1.5).

## (b) The 5 places where the brief's assumption was wrong or the fork differs most

1. **§1.1 port target.** The brief lists `components/layout/navigation.tsx` and the `*.nav-visibility.test.tsx` files.
   In the fork the sidebar is the Mantine shell (`mantine/shell/nav-config.ts` + `use-shell-nav.ts`), and the old
   sidebar/navigation files are orphaned. The backend can be ported, but the frontend must be rewritten into `visibleNav()`.
   This changes D1's "never reimplement differently" for the frontend half.
2. **A12 / D5 (2.5.2).** An approval-mode `for_request_access` workflow (`request-access`) already exists with a
   required reason (min 10) and duration. It is inactive in dev. The work is to extend it, not to seed a new one.
3. **Consumer persona and nav reality (1.2, 1.6, 2.7).** The e2e "consumer" is all-Read-only plus frontend-only ids,
   so the baselines do not show what a real Data Consumer sees. In the real app, Search/My Products/My Requests are
   gated on ids the backend never returns (probably invisible to everyone). In dev, the Data Consumer DB role also lacks
   `semantic-models` (glossary). The brief's acceptance "consumer sidebar ≤ 5 items" cannot be tested meaningfully
   until this is fixed.
4. **§3.4 form-first editing.** The brief implies the contract columns lack a form editor. `schema-property-editor.tsx`
   already edits businessName, classification, required/unique, examples and concepts. The task is to relabel and add
   an Advanced split, not new `column-editor/` components.
5. **§3.5 suggestions source.** The brief says to use `suggestion_routes.py`. The fork's term-mapping heuristics
   (`/api/term-mappings/suggestions-for`, contract-property adapter) are the better, already-wired source. They are
   wired at the contract level, not the column level.

Smaller differences: the product is already rebranded to Nucleus (`f7cf4e9b`, which bears on O7). `/api/llm-search/status`
returns 500 in dev (O4). The `/api/search` index has no type filter and dev has no `data-product` items in it.
Home section order is hard-coded (`home.tsx:55`), as §1.3 suspected.

## (c) Proposed re-ordering / re-scoping

1. **New Phase 1.0 (a fix, before any feature work):** repair the nav gating for `search`/`my-products`/`my-requests`
   (`nav-config.ts:163,228,231`), and add a real Data Consumer (and Producer) e2e persona built from
   `DEFAULT_ROLE_PERMISSIONS`. Reason: every consumer acceptance test (1.2, 1.3, 2.7) depends on both, and the
   first is probably a live bug.
2. **§1.1 re-scoped:** port the backend (migration, model, `/api/user/navigation`) by file list. Implement the frontend
   as a `hidden` predicate in `visibleNav()` plus the role form. Drop the upstream `navigation.tsx` diff. This is
   likely simpler than the brief's port, because the shell already centralises visibility in one function.
3. **Pull 2.3 step 1 and 3.1 forward into Phase 1.** The S/M/L helpers are already pure and exported, so the registry
   extraction is a small commit. Mounting `ReadinessChecklist` right after it is the cheapest visible win for producers.
4. **Shrink 2.5:** extend the existing `request-access` workflow (contract-terms `legal_document` + acks + Purpose
   relabel + agreement/PDF) and find out why it is inactive in dev. Drop "seed a new workflow". Duration capture is already solved.
5. **Shrink 3.4 and 3.5** to relabel/Advanced-split and per-column wiring of the existing term-mapping suggestions.
   Move 3.5's next-step banner after 3.1.
6. **Move 2.2's backend change (a `types` filter on `/api/search`) early.** It also gates keeping `help` items out of the
   marketplace, and it needs data products to actually be indexed (none in dev). Fix the dev data/index before measuring T1.
7. **4.3:** start from the marketplace's existing domain-graph mode (add product nodes) instead of a separate `views/data-map.tsx`.
