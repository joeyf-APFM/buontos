# Phase 0 §0.2 — Relationship with upstream (databrickslabs/ontos)

Method: throwaway clone of `/Users/joey.filichia/Projects/nucleus` at `277a5595` (detached), `upstream` remote added, `git fetch upstream development`, `git merge --no-commit --no-ff upstream/development`, then `git merge --abort`. The clone dir was deleted (`rm -rf` of the literal path; confirmed gone). The user's repos were not touched (HEAD still 277a5595, remotes unchanged: `origin` only). The only untracked item in the nucleus repo, `docs/notes/ux-adaptation/`, predates this task.

Labels: [FORK ✔] / [UPSTREAM ✔] = verified by git commands on those refs; [UNVERIFIED] = not checked.

## Summary

**Recommendation: port by file list for Phase 1 (§1.1), and schedule a separate upstream-sync project later. Do NOT merge upstream on a `sync/` branch as part of the UX plan.** The brief's rule gives this result: 47 > 25 conflicted files. The "effective" conflict count (below) is lower than 47 but still above 25 in real, human-judged work, and the conflicts sit exactly in files the plan edits (data-product-details, data-contract-details, data-products, data-contracts, request-*-action-dialog).

Six key numbers (all [UPSTREAM ✔] / [FORK ✔], reproduced):
1. Common ancestor `ba99c8e4` (exists; no "NO COMMON ANCESTOR"). `rev-list --left-right --count HEAD...upstream/development` = **210 fork-only, 90 upstream-only**.
2. Trial merge: **47 conflicted files**, 619 other files merged cleanly (666 files differ ancestor→upstream). Of the clean files only **94** were edited on both sides (auto-merged with real overlap); 525 were upstream-only changes.
3. **16** conflicted files are locale JSON (`{assets,search}.json` x 8 locales) = mechanical.
4. **3** are docs (`docs/handbook/*`): rebrand Ontos->Nucleus vs upstream content edits = mechanical-ish.
5. Effective conflicts needing judgment: **~28 files** (47 - 16 locale - 3 docs); of those about **9 are trivial** (imports, a test string, version) and about **19 are semantic or "fork replaced upstream's approach"** (list in §1).
6. Alembic: fork 93 revisions / head `d2_backfill_uc_branch`; upstream 100 revisions / head `o2_step_execution_message`; ancestor head `c5_merge_cv2_b8`. A merge yields two heads and needs a new merge revision.

## 1. Trial merge, reproduced

Reproduction commands: `git clone -q <nucleus> trial; git remote add upstream https://github.com/databrickslabs/ontos.git; git fetch -q upstream development; git merge --no-commit --no-ff upstream/development` (47 `CONFLICT` lines; `git diff --name-only --diff-filter=U | wc -l` = 47; all are content conflicts `UU`, no add/add or delete/modify). [UPSTREAM ✔]

Upstream HEAD `30aa76b2` (2026-11-16). Of its 90 commits: 53 `fix`, 15 `chore`, 11 `feat`, 4 `ci`, 3 `test`, 2 `docs`, rest merges/other. Mostly bug fixes.

### 1a. Locale JSON (16 files) — mechanical, trivially unionable
`i18n/locales/{de,en,es,fr,it,ja,nl,pt}/{assets,search}.json`, each with exactly **1 hunk**. Scripted check of every hunk: the only key present on both sides is the one line that differs by a trailing comma (same value).
- `assets.json`: fork adds 3 keys (`tableView`, `graphView`, `relationshipGraph`); upstream adds ~89 keys (`metricView.state.*`, `changeRequests.*`).
- `search.json`: fork adds `states.searchFailed`, `states.loadFailed`; upstream adds `chat_empty_answer`.
- Resolution = keep both sides and fix the comma. No value divergence. Cost is small, but it must be done 16 times (a JSON-aware script is better than hand edits). `[UNVERIFIED]` that the i18n parity test passes afterwards (not run).

### 1b. Docs (3 files) — mechanical (wording)
`docs/handbook/{genie-one-mcp-setup,installation-and-troubleshooting,mcp-and-ask-ontos}.md`: fork rebranded "Ontos"->"Nucleus" in sentences that upstream also rewrote (keyless MCP identity verification via `x-forwarded-access-token`/`current_user.me()`). Take upstream's text and re-apply the brand word.

### 1c. Non-locale conflicts (28 files), classified

Legend: T = trivial/mechanical; S = semantic (both sides changed the same logic); R = fork replaced upstream's approach (restyle: Mantine `Dialog`/`Pane`/`Menu` + CSS modules vs upstream's shadcn `Dialog`/`Card`/`DropdownMenu`).

Backend (7)
| File | Hunks | Class | Notes |
|---|---|---|---|
| `controller/search_manager.py` | 2 | **S** | Fork: `HELP_ITEM_TYPE` ("help") bypasses permission filtering in two places (`search()` and `_search_postgres()`), and no-groups users still get help results. Upstream: refactor to accept a pre-resolved `effective_permissions` (new param, `resolve_effective_permissions` in `routes/search_routes.py`), with an early `return []` when there are no groups and no resolved permissions. Resolution: take upstream's structure, re-add the help split (`help_matches`/`other_matches`; `item.type == HELP_ITEM_TYPE or id(item) in permitted_ids`) and make the no-groups early return keep help items. Both hunks need hand merging; the rest of the file (lines ~249-352) auto-merged and `HELP_ITEM_TYPE` is still defined at line 33. |
| `tests/unit/test_search_manager.py` | 2 | T | Fixture strings only: fork `user="testuser"`/`"nogroups"` vs upstream `"Test User"`/`"No Groups User"`. But the fork's own help-exemption tests must still pass against the merged manager (they are in the auto-merged part). Re-run this file after resolving search_manager. |
| `models/assets.py` | 1 | S (additive) | Fork adds `UC_BRANCH_ASSET_TYPES`; upstream adds `METRIC_VIEW_PROPERTY`, `public_properties()`, `with_internal_properties()` (#1263). Independent blocks that touch at the same spot: keep both. |
| `routes/assets_routes.py` | 1 | T/S | Imports: fork adds `asset_tree` imports, upstream adds `manager_dependencies` and `AssetsManager`. Union, but check the `AssetsManager` DI that upstream introduces vs the fork's `assets_manager` singleton use. |
| `controller/assets_manager.py` | 1 | T | Import line: fork `from sqlalchemy import Select, select` vs upstream `from databricks.sdk import WorkspaceClient`. Keep both. |
| `pyproject.toml` | 1 | T | Identity: fork `name="nucleus" version="1.0.2"` description vs upstream `ontos 1.1.0`. Keep the fork's name/description; version is a decision for Joey (upstream is 1.1.0). |
| (assets metric-view feature: backend) | | | Upstream metric-view work (#1263, #1276: baselines, change requests, Manual/Indirect delivery) arrives with migrations c6, c7 and brings workflow changes. Not a conflict by itself, but it is the bulk of the new code. |

Frontend components (13)
| File | Hunks | Class |
|---|---|---|
| `components/assets/asset-metric-view-card.tsx` | 1 | **R** (fork `Pane`+CSS module vs upstream `Card`; upstream adds drift/baseline/refresh/change-request UI in the same block) |
| `components/data-asset-reviews/asset-review-editor.tsx` | 1 | **R** |
| `components/data-contracts/data-contract-basic-form-dialog.tsx` | 1 | T (upstream removes `console.log('[DEBUG FORM]'...)` block; fork deleted the area; take fork) |
| `components/data-contracts/request-contract-action-dialog.tsx` | 1 | **R + S** (fork Mantine `Dialog`; upstream adds `DeprecationFields` lifecycle: reason, sunset date, replacement #1042) |
| `components/data-contracts/request-contract-action-dialog.certified.test.tsx` | 2 | **R** (test helpers rewritten for Mantine selects vs upstream's `ui/select` mock) |
| `components/data-products/request-product-action-dialog.tsx` | 2 | **R + S** (same as above) |
| `components/data-products/request-product-action-dialog.certified.test.tsx` | 3 | **R** |
| `components/data-products/link-contract-to-port-dialog.tsx` | 1 | T (imports: fork `dialog-form` helpers vs upstream `omitTags`) |
| `components/knowledge/collections-tab.tsx` | 1 | **R** (fork `RowActions` vs upstream `DropdownMenu`) |
| `components/knowledge/concepts-tab.tsx` | 2 | **R + S** (upstream adds per-action `from` states and eligible counts to bulk status actions; fork uses Mantine `Menu.Item`) |
| `components/ui/data-table.tsx` | 1 | **R + S** (fork `classes.pageInfo` pager vs upstream client-side paging: `isClientPaged`, `clientPageCount`) |
| `components/ui/data-table.test.tsx` | 1 | S (fork "explorer grid" tests vs upstream "view state persistence (storageKey)" tests: keep both describe blocks) |
| (data-table `storageKey` persistence feature) | | upstream #966 "keep list search, filters and page across detail navigation" lands in `data-table` and the list views, overlapping the fork's restyle of the same files |

Frontend views (10)
| File | Hunks | Class |
|---|---|---|
| `views/compliance.tsx` | 1 | T (imports only) |
| `views/compliance-policy-details.tsx` | 2 | **R** (fork `Pane`/`DetailsGrid`; upstream adds `complianceRunWarningText`, `complianceSaveErrorText`) |
| `views/compliance-run-details.tsx` | 3 | **R + S** (same plus upstream's `warning_code` UI) |
| `views/concept-detail.tsx` | 1 | **R** |
| `views/concept-detail.layout.test.tsx` | 1 | S (different tests added at the same spot: keep both) |
| `views/data-asset-reviews.tsx` | 1 | **R** (fork `ListViewSkeleton`/`DataTable`; upstream adds an error `Alert`) |
| `views/data-contracts.tsx` | 2 | S (upstream `usePersistentState` for list state; fork `usePermissionsReady`, dismissible action error) |
| `views/data-products.tsx` | 2 | **R** (fork `PageLayout`/`SortButton`; upstream still the old `<div className="py-6">` markup) |
| `views/data-contract-details.tsx` | 2 | **R + S** (fork: `Link`, `useId`, `classes.itemActions`; upstream: `DeprecationNotice`, `buildContractMetadataUpdate`; both change the imports and the header area) |
| `views/data-product-details.tsx` | 1 | **R + S** (fork action buttons vs upstream quality badge and deprecation) |

Totals for the 28: T = 9 (assets_manager, pyproject, test_search_manager, link-contract-to-port, basic-form-dialog, compliance.tsx, assets_routes (mostly), plus 2 docs-like additive cases) — treat as roughly 9; S/additive = ~5; R or R+S = ~14. The R group is the real cost: the fork replaced shadcn with Mantine, so upstream's edits to those components must be re-implemented on Mantine, not merged.

Effective conflict count: **47 raw = 16 locale (mechanical) + 3 docs (mechanical) + ~9 trivial + ~19 judgment-heavy**. Even ignoring the 19, the brief's threshold is on raw count (>25).

## 2. Upstream changes touching files the plan will touch

Command: `git log --oneline ba99c8e4..upstream/development -- <path>` and `git diff --stat ba99c8e4 upstream/development -- <path>`. [UPSTREAM ✔]

Files upstream changed since the fork point:
| Plan file | Upstream commits since ba99c8e4 | Fork also changed? |
|---|---|---|
| `views/data-product-details.tsx` | 30aa76b2 (#1482 clean up entity metadata on delete; last tag removable), 54d608ad (#1042 lifecycle: deprecation reason/sunset/replacement) | yes (7 fork commits) — **conflicts** |
| `views/data-contract-details.tsx` | same two commits | yes (9) — **conflicts** |
| `components/data-products/data-product-create-dialog.tsx` | 30aa76b2 | yes (2); auto-merged |
| `data/default_workflows.yaml` | 7c8571ec (#1276 metric-view change requests), cd206b70 (#1220 publication paths), d7939b04 (#1262 owner deprecation/retirement notice workflows) | yes (1); auto-merged. **Touches D5's seeded `for_request_access` workflow file.** |
| `models/process_workflows.py` | f7872b9b (#1437/#1449 keep earlier step results after approval; aware UTC timestamps), 20a867ee (designer layout, assign-tag), bedec49e (#1417/#1418 end runs at Pass/Fail), 7c8571ec, cc60dc2f (#1311 unknown trigger entity types) | fork 0 — **clean, but upstream changed the step model D5 will extend** |
| `components/workflows/*` | 51 files, +3701/-188: workflow designer overhaul (layout/Rearrange, warnings panel, assign-tag step form, require-all approvals, unknown-entity-types notice) | fork changed `approval-wizard-dialog.tsx` (2), upstream did not touch it |
| `config/features.ts` | 9ecf93a3 (#1326 per-role "show in navigation") | yes (1); auto-merged |
| `controller/settings_manager.py` | 9ecf93a3, f7872b9b | yes (1); auto-merged |
| `routes/search_routes.py` | e9cfac96 (#1245 combine team role overrides with other roles) | fork 0 — this is the caller side of the `search_manager` conflict |
| `routes/llm_search_routes.py` | 2caad00a, 1bb3be34 (#1249/#1250 tool read rules) plus ~8 more llm-search/mcp fixes (#1251, #1273, #1305, #1457, #1465, #1369, #1201) | fork 0 — clean; relevant to D4 "Ask a question" handoff (A23) |
| `routes/suggestion_routes.py`, `workflows/uc_tag_sync/*` | 919b78e8 (#956/#957/#959 relationship targets, type names stored one way) | uc_tag_sync: fork changed 1 |
| home components | `discovery-section.tsx` (+41), `required-actions-section.tsx`, `recent-activity.tsx`, `quick-actions.tsx`; commits f9c3bbe0 (#1344 decided approvals out of My actions), 26abef74 (#1416 home cards show 403 as empty, queue opens to product readers) | `views/home.tsx`: no upstream change; fork 0 |
| locales: home, data-products, settings, common | home +4 lines, data-products +2/-1, settings +9, common +43/-3 (en); fork also edited each | auto-merged in the trial |

Files upstream did NOT change since the fork point (so no overlap to track): `components/home/marketplace-view.tsx`, `approval-wizard-dialog.tsx`, `readiness_routes.py`, `readiness-checklist.tsx`, `data-contract-wizard-dialog.tsx`, `views/home.tsx`, `common/features.py`, `use-approval-wizard-trigger.ts`, `semantic_links_routes.py`, locale `navigation.json` and `features.json`. (Note: the fork modified `marketplace-view.tsx` 3 times, `schema-importer.tsx` 3, `llm-search.tsx` 3.)

Overlap highlights (avoid duplicating):
- **Per-role nav hiding** (#1325/#1326, commit 9ecf93a3, 2026-11-10): the only upstream change that overlaps Phase 1. See §3.
- **Lifecycle deprecation** (#1042, #1262; migration `b9_lifecycle_deprecation_fields`; `DeprecationFields`/`DeprecationNotice` components, owner deprecation/retirement workflows): overlaps Phases 3/4 producer lifecycle UI and `request-*-action-dialog`. Not in the brief; plan should reuse it rather than build its own.
- **Metric-view baselines and change requests** (#1263, #1276; migrations c6, c7): big feature, not in the plan, but it is most of what makes the merge large (assets, workflows yaml, process_workflows.py).
- **Workflow designer overhaul** (51 files): relevant if D5 edits `default_workflows.yaml`/`process_workflows.py`; a port-by-file-list of D5 later should be written against upstream's current model.
- **LLM search/MCP security fixes** (about 10 commits): relevant to D4/D10 and A23.
- No upstream work on: marketplace, readiness scoring/leaderboard, access requests (`for_request_access`), comments/description write-back to UC, example data. `git log --grep` and path logs found none. Upstream has `docs/prds/prd-marketplace-multi-entity.md` and `prd-external-marketplace-providers.md` (PRDs only; not new since ancestor). [UNVERIFIED] whether they predate the ancestor.

## 3. Port-by-file-list feasibility: per-role navigation hiding (§1.1)

Upstream implementation is one commit set: `9ecf93a3` "feat(roles): per-role 'show in navigation' flag (#1326)", 38 files, +1485/-27 (squash of 4 sub-commits). `git log --grep '#1325\|#1326'` also lists `7c8571ec`, which only mentions it. [UPSTREAM ✔]

`[FORK ✔]` = file present in fork @277a5595; "anc->up" = diff stat ancestor->upstream (the nav change is isolated); "anc->fork" = fork changes since ancestor (this is where a port could collide).

| Upstream file | In fork? | Upstream change (anc->up) | Fork change since ancestor |
|---|---|---|---|
| `alembic/versions/r1_role_hidden_nav_features.py` | **no** (path in §1.1 is wrong: real dir is `src/backend/alembic/versions/`, not `src/backend/src/alembic/...`) | new, 46 lines | n/a |
| `alembic/versions/o1_merge_r1_c7.py` | no | new; merges `r1_role_hidden_nav_features` + `c7_metric_view_change_requests` | n/a — **not needed in a port** (c7 is the metric-view branch) |
| `controller/authorization_manager.py` | yes | +81/-30 | none |
| `controller/settings_manager.py` | yes | +45/-2 | +12 (fork) — both sides add lines; small overlap |
| `db_models/settings.py` | yes | +6 | none |
| `file_models/roles.py` | yes | +10/-1 | none |
| `models/settings.py` | yes | +21 | +1/-1 |
| `repositories/settings_repository.py` | yes | +11 | none |
| `routes/settings_routes.py` | yes | +15/-9 | +2 |
| `routes/user_routes.py` | yes | +50/-18 (`GET /api/user/navigation`) | none |
| `models/users.py` | yes | +5 (in the commit; not in §1.1) | not checked |
| `tests/integration/test_role_nav_visibility.py` | no | new, 185 lines | n/a |
| `tests/unit/test_role_hidden_nav_features.py` | no | new, 260 lines | n/a |
| `hooks/use-nav-hidden-features.ts` | no | new, 31 lines | n/a |
| `hooks/use-nav-hidden-features.test.ts`, `use-is-ontos-admin.ts` (new, 30 lines, in commit; not in §1.1) | no | new | n/a |
| `stores/permissions-store.ts` (+ `.test.ts` 55 lines) | yes | +26/-2 | +17/-1 (fork) — hand-port |
| `types/settings.ts` | yes | +2 | none |
| `components/layout/navigation.tsx` | yes | +6/-1 | none (HEAD-vs-upstream difference for this file is also small) |
| `components/home/quick-actions.tsx` | yes | +6/-2 | none |
| `components/settings/role-form-dialog.tsx` | yes | +53/-4 | none — but **check Mantine**: fork restyle may differ [UNVERIFIED] |
| `components/settings/role-nav-visibility.tsx` + test (99 + 105 lines) | no | new — **missing from §1.1's list** | n/a |
| `views/about.tsx` | yes | +3/-1 | +7 (fork) |
| `components/ui/user-info.tsx` | yes (in the commit; not in §1.1) | +18 | not checked |
| `config/features.ts` (+ `features.test.ts` 34 lines) | yes (in the commit; not in §1.1) | +26/-? | fork changed once — **missing from §1.1's list** |
| `*.nav-visibility.test.tsx` (quick-actions, navigation, about) | no | new, 76+97+60 | n/a |
| locale `*/settings.json` x 8 | yes | +9 lines each | fork edited too; auto-merged cleanly in trial |

Feasibility: **High.** All backend files exist in the fork and are mostly untouched by the fork; the nav change is ~1,485 lines, of which ~950 are new test/new files. Direct file-level overlap with fork edits is in 5 files (`settings_manager.py`, `models/settings.py`, `routes/settings_routes.py`, `permissions-store.ts`, `about.tsx`), each a handful of lines. The cleanest approach is to cherry-pick the diff of commit `9ecf93a3` onto a branch in the fork (`git cherry-pick -n 9ecf93a3` from a clone that has the upstream remote) and fix up the five overlap files and the Mantine role-form dialog; it applies as a patch instead of requiring a merge.

**BRIEF CONTRADICTED / additions to §1.1's list:** (1) migration path is `src/backend/alembic/versions/`; (2) add `config/features.ts` (+test), `models/users.py`, `components/ui/user-info.tsx`, `hooks/use-is-ontos-admin.ts`, `components/settings/role-nav-visibility.tsx` (+test), the 8 `settings.json` locales; (3) `o1_merge_r1_c7` must **not** be ported (it merges the metric-view branch).

### Alembic portability
- Fork: 93 revisions, single head **`d2_backfill_uc_branch`** (file `d2_backfill_uc_data_branch.py`; fork-added since ancestor: `d1_add_data_branch`, `d2_backfill_uc_data_branch`). [FORK ✔, parsed with `ast`]
- Upstream: 100 revisions, single head `o2_step_execution_message`. New since ancestor (9 files): `b9_lifecycle_deprecation_fields`, `b10_compliance_run_warning_code`, `c6_metric_view_baselines`, `c7_metric_view_change_requests`, `o1_merge_r1_c7`, `o2_step_execution_message`, `r1_role_hidden_nav_features`, `r2_canonical_relationship_types`, `s1_workflow_is_customized`. [UPSTREAM ✔]
- `r1_role_hidden_nav_features` has `down_revision = "b10_compliance_run_warning_code"`, which does **not exist in the fork**, so the file cannot be copied verbatim; its content is portable: it adds `app_roles.hidden_nav_features TEXT NOT NULL DEFAULT '[]'` and is already idempotent (checks `_column_exists`). Create a new revision (short id, per `.cursor/rules/11-database-migrations.mdc`) with `down_revision = "d2_backfill_uc_branch"` and the same body. If the fork later merges upstream, the later merge must reconcile this new revision with upstream's `r1` (same column; the idempotent guard makes the second one a no-op, but it must still be one linear chain: add a merge revision).
- Same-column risk: ids differ (`r1_...` upstream, a new id in the fork) so a later upstream merge would see two heads and need a merge migration. Cheap if recorded now.

## 4. Recommendation

Brief's table: no common ancestor -> port by file list; <= 25 conflicts -> merge on `sync/upstream-<date>`; > 25 -> port by file list + separate sync project. Measured: ancestor exists, 47 conflicts -> **port by file list; separate sync project.**

### Option A: Merge upstream on `sync/upstream-2026-11-17` now
- Benefit: one-shot catch-up (90 commits: 53 fixes incl. security-relevant llm-search/MCP/read-rule fixes, lifecycle deprecation, metric views, workflow designer); gets nav hiding for free with the right migration chain; future syncs get cheaper.
- Cost: 47 raw conflicts; ~19 need real judgment, mostly re-implementing upstream UI edits on the fork's Mantine components (data-products/-contracts list and detail pages, request dialogs, data-table, compliance, metric-view card); help-exemption merge in `search_manager.py`; 94 auto-merged both-sides files and 525 upstream-only files (619 total) land untested: full backend + frontend test and e2e screenshot (restyle baselines) runs needed; Alembic 2 heads -> a merge revision; i18n parity; version/branding decisions. It would also change the same views Phases 2-4 plan to edit, so doing it first delays Phase 1+, and doing it in the middle creates conflicts with the plan's own edits.
- Estimate [UNVERIFIED, judgment]: several days with a full test run; high risk for the restyle e2e baselines.

### Option B (recommended): port nav hiding by file list (cherry-pick of 9ecf93a3 with fix-ups), defer the merge
- Benefit: Phase 1 can start at once; ~38 files, mostly new files and 5 small overlaps; one new Alembic revision on `d2`; stays inside D1 ("port, don't reinvent"): same mechanism, same API (`GET /api/user/navigation`, `hidden_nav_features`), same tests.
- Cost: the fork carries a small divergence from upstream that a later sync must reconcile (the migration id; see §3); upstream bug fixes remain unmerged until the sync project.
- Plan for the sync project afterwards: start it as its own phase (not blocking the UX work), scripted JSON-aware locale union (16 files), then the 3 docs, then the ~19 semantic files one view at a time with the restyle baselines as the check. Re-measure the conflict count at that point (it grows with every fork and upstream commit).

Why B: the decision table says so (47 > 25); even after discounting 19 mechanical files, the remaining conflicts sit in files Phases 2-4 will edit, so a merge now would mean resolving the same files twice; and nav hiding is isolated enough to port as a patch.

### Risks
1. Merge touches 619 files (94 both-edited, auto-merged): needs the full test suite; auto-merge can be silently wrong in semantic overlaps (e.g. search permission path, `settings_manager.py`).
2. Locale JSON: the 16 conflicts are mechanical, but the 88 other upstream-modified locale files auto-merged; run the i18n parity test and a key-diff script (parity covers only 6 namespaces per A20).
3. Alembic: any merge yields two heads (`d2_backfill_uc_branch` and `o2_step_execution_message`); CI enforces one head (`scripts/check-alembic-heads.py`); needs a merge revision plus the `alembic-branch` label.
4. Restyle: upstream still edits shadcn components that the fork replaced; each upstream UI fix there (e.g. #966 list state persistence, #1042 deprecation fields) must be re-done on Mantine; the e2e baselines in `tests/e2e/__screenshots__/restyle` are the only guard.
5. `search_manager.py`: if the help exemption is lost in a merge, help items silently disappear for users without groups or become permission-filtered; keep the fork's help tests and add one for the new `effective_permissions` path.
6. Upstream is still moving (90 commits since 2026-11-04, ~10/day); the conflict count drifts up the longer the sync waits.
7. Port risk (Option B): `role-form-dialog.tsx` in the fork may be restyled; the "Show in navigation" column UI must be built with the fork's components. [UNVERIFIED]

## Surprises / contradictions

- **BRIEF CONTRADICTED (01 §A, D1): copilot panel.** The brief says the fork "lacks" `copilot-panel.tsx` and treats it as an upstream feature to port. It is not new upstream work: `copilot-panel.tsx` was added 2026-03-04 (`07118842`) and exists in the ancestor; upstream has **no changes** to it since ancestor. The fork **deliberately replaced it** with a floating window (`src/frontend/src/mantine/ontos/ontos-window.tsx`, commit `1639bc40` "Show Ask Ontos as a floating window like Helix"), while keeping `copilot-store.ts`, `use-copilot-context.ts`, `use-copilot-questions.ts` and `copilot-questions.json`. Do not port the panel. [FORK ✔ UPSTREAM ✔]
- **BRIEF CONTRADICTED: "141 auto-merged".** 141 is the number of files edited on both sides since the ancestor; 47 of those conflict, so 94 were auto-merged with both sides touched. 619 files in total merge cleanly (525 upstream-only).
- **BRIEF CONTRADICTED (03 §1.1)**: migration path (`src/backend/alembic/versions/`), `o1_merge_r1_c7` is a merge with the metric-view branch and must not be ported; the file list omits `config/features.ts`, `models/users.py`, `user-info.tsx`, `use-is-ontos-admin.ts`, `role-nav-visibility.tsx`, 8 settings locales.
- Brief says "12 components, 10 views": measured 13 component/test files and 10 view files (counting test files under components/views); minor.
- Upstream's 90-commit window is mostly fixes; the single feature that overlaps Phase 1 is #1326. Upstream also has lifecycle deprecation (#1042) and metric views (#1263/#1276) that the plan does not mention but that touch `data-product-details.tsx`, `data-contract-details.tsx` and the request dialogs the plan edits.
- `[UNVERIFIED]`: no tests, type-check or build were run (the throwaway clone had no dependencies installed), so "clean auto-merge" means git-clean, not green. Conflict classification is from reading hunk heads (first lines of each side), not full semantic analysis of every file; the `R`/`S` labels on the views and dialogs are likely but should be re-checked when the sync project starts.
