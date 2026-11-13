# Mantine restyle, wave 3 (Govern): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the seven Govern screens (Compliance list, policy details and run details, Master Data, Security Features, Entitlements, Entitlements Sync) and the Master Data components to the explorer's page anatomy on Mantine, with no Tailwind or `components/ui` in their own files. Behaviour stays as it is, except the one permission gap in Task 3, which the owner has approved.

**Architecture:**
1. Make the safety net honest first. Today the compliance run baseline captures "Run not found.", and the other Govern baselines may capture empty states. Add fixtures so every baseline shows real content, then re-baseline on the unchanged UI.
2. Restyle the screens smallest to largest, on the existing kit (`PageLayout`, `PageHeader`, `FilterBar`, `Pane`, `PaneStack`, `DetailsGrid`, `Tabs`, `Dialog`). No new kit piece is planned; Task 1 confirms it.
3. Master Data, the largest screen, is three tasks: the page, its dialogs, and the matching-rules editor with the match-review panel.

**Tech Stack:** React 18, Mantine **8.3.18**, TanStack Table (through `DataTable`), react-i18next, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-mantine-restyle-design.md` ("Page waves → Wave 3").

**Prior plans:** waves 0–1 (merged as `9b63ed70`) and wave 2 (merged as `54277c32`, `docs/superpowers/plans/2026-11-10-mantine-restyle-wave-2.md`). Their rulings R1–R35 are in `.superpowers/sdd/*/progress.md`, and the deferred items are in `.superpowers/sdd/follow-ups.md`. Both carry forward.

## Global Constraints

- **Branching:**
  - Work on branch `restyle/wave-3`, off `development` at `c2ee8ce9`, in the worktree `~/Projects/buontos-worktrees/restyle-wave-3`.
  - The wave merges into `development` after the owner reviews it on localhost:3100.
  - Nothing is pushed, merged or deployed without the owner.
- **Never restart the owner's dev servers** (3000/8000). The controller runs the review stack: backend on 8100, Vite on 3100. Screenshot and inventory runs use their own Vite on **3200** with mocked APIs (`tests/e2e/playwright.config.ts`).
- **Mantine** is pinned to `8.3.18` exactly.
- **Visual system:**
  - **Theme:** Aura tokens and the Optima stack `Optima, Candara, 'Segoe UI', sans-serif`, as encoded in `src/frontend/src/mantine/theme.ts`. Monospace only for code, SQL, rule DSL and identifiers, through `--aura-font-mono`.
  - **Sizes:** body text 12px, table rows 28px, controls 26–28px, page title 16px, corners 4–8px.
  - **Surfaces:** panes share 1px borders. Shadows only on floating elements.
- **Page anatomy:**
  - Use the page kit in `src/frontend/src/mantine/page/`. Don't add breadcrumbs: the shell owns them. Pages supply only their entity name, through `usePageBreadcrumb` or the legacy `breadcrumb-store`.
  - Routes that should fill the window go in `FULL_BLEED_ROUTES` (`src/frontend/src/mantine/shell/full-bleed.ts`).
- **Behaviour is unchanged.** Every action, permission gate, keyboard path, route and API call is kept. The menu (`nav-config.ts`) doesn't change. The one exception is Task 3's permission gate, which the owner approved on 2026-11-13.
- **No Tailwind classes and no `components/ui` imports** in a task's own files once it lands.
  - The exception is `components/ui/button` and `components/ui/badge`, which already render Mantine. They may stay; wave 6 removes them app-wide.
  - Radix Dialog, Select, Tabs, Switch, Progress, ScrollArea and Separator move to the kit `Dialog`, Mantine `Select`, kit `Tabs`, `Switch`, `Progress`, `ScrollArea` and `Divider`. Modals always use the kit `Dialog`, never Mantine `Modal` directly.
- **Shared components:**
  - `components/common/list-view-skeleton`, `common/principal-picker` and `common/relative-date` are used by many pages and later waves. Consume them as they are.
  - `components/mdm/mdm-match-review` is also used by the wave-1 `asset-review-editor`. Task 8 restyles it and must keep the editor's tests passing.
  - `EntityMetadataPanel` and the comments panel take `flush` (wave 2, Task 3). Pass it.
- **Existing tests keep passing.** A test may change only where it queried shadcn or Radix markup, and then it queries behaviour instead: role, label or test id.
- **Strings stay in their i18n namespaces** (`compliance`, `mdm`, `entitlements`, `security-features`). New strings go through react-i18next.
- **Product name:** the rename is deferred (see Decisions). Don't hard-code a product name in new code; use the existing instance-name and `t()` paths.
- **No workspace-specific values in code.** Log any you find in the report.
- **Lint:** no new lint errors in touched files.
- **Lessons from waves 0–2, binding on every task:**
  - Show every new test failing first.
  - Check computed styles in Playwright, not jsdom (R10).
  - When a dialog closes, focus goes back to its opener once, and only when `focusIsFree` says it may.
  - Async and debounced effects drop stale responses.
  - Guard arrays that come from the API.
  - A Select needs a sentinel value instead of a duplicate one.
  - Long text wraps, or is truncated with a `title`.
  - Confirm modals use the alertdialog role.
  - Prose isn't set in the mono font.
  - Column definitions passed to `DataTable` are memoised, so cells keep their focus.
  - Existing bugs found during a restyle are fixed in a fix round, each with a test (R30, R31), and listed in the report.

## Review Focus

1. **Long names and identifiers** (policy names and rule text, full object names such as `catalog.schema.table` in run results, persona and security-feature names, sync connection names) wrap or truncate with a `title`. They never widen the page. *Test: each page task's Playwright step checks a 200-character name with no horizontal page scroll (Tasks 2–8).*
2. **Large and failed runs:** a compliance run with thousands of results keeps its table paging and filter. A run with no results or a failed run keeps its message and its way back. *Test: Task 3 `compliance run details: a 5,000-result run pages and filters` and `compliance run details: a failed run keeps its error and back link`.*
3. **Read-only users:** a user without write access sees no Create, Edit, Delete, Run, Sync or Configure control on any Govern page, and can still read everything. *Test: each page task's `<page> keeps every control` runs for both personas, and Task 3 adds `policy details: Edit and Run Now need compliance write access`.*
4. **Escape inside a dialog's own dropdown** closes only the dropdown, never the dialog, and unsaved input survives. *Test: Task 2 `policy dialog: Escape in an open Select closes only the Select`, run in a real browser; Task 6 repeats it for the Master Data config dialog.*
5. **Destructive confirms** (delete policy, persona, privilege, security feature, sync config, Master Data source) open as `alertdialog`, send exactly one request on a double click, and return focus to a sensible element once the row is gone. *Test: each task that has a delete adds `<page> delete confirm is an alertdialog, sends once and returns focus`.*

## How each page task runs (Tasks 2–8)

**Scope:**
- A task owns the view files named in its row, and every component that only those views import. Use `git grep -l` over `src/frontend/src` to check.
- A component shared with an earlier task in this plan is consumed as it is. A component shared with a later task is restyled by the earlier one.
- A component used by a later *wave* keeps its current look. List it in the report.

**Steps:**
- [ ] **Step 1: Write the failing tests** in `<page>.restyle.test.tsx`:
  - `<page> renders with the page kit`: the PageHeader and panes are present, with no `.p-6`, no shadcn Card, and no Tailwind class in the page's own markup.
  - `<page> keeps every control`: the page's controls, by role and name, for both personas.
  - The task's Review Focus tests.
- [ ] **Step 2: Run them, and check they fail.**
- [ ] **Step 3: Restyle** with Mantine, the page kit, the kit `Dialog` and CSS modules.
- [ ] **Step 4: Run** the page's existing tests and the full vitest suite twice.
- [ ] **Step 5: Run the restyle check** (`npx playwright test -c tests/e2e/playwright.config.ts`) for both personas.
  - Control inventories must match the Task 1 baseline exactly.
  - Re-baseline only this task's screenshots. Revert pixel noise on any other page.
  - Put before and after images in `task-N-images/`.
- [ ] **Step 6: Commit** with subject "Restyle <page> on Mantine".

---

### Task 1: Make the Govern baselines real, and confirm the kit is enough

**Files:**
- Modify: `src/frontend/tests/e2e/fixtures/data.ts` and the fixture handlers it feeds, `src/frontend/tests/e2e/restyle-pages.ts` (only if a page needs a `skip` note removed)
- Re-baseline: `src/frontend/tests/e2e/__controls__/{admin,consumer}/{compliance,compliance-policy-details,compliance-run-details,master-data,security-features,entitlements,entitlements-sync}.json` and their screenshots in `__screenshots__/restyle`
- Test: `src/frontend/tests/e2e/govern-fixtures.spec.ts`

**Why:** the wave-2 review found that the `compliance-run-details` baseline captures "Run not found." because the fixtures have no `e2e-run-1`. The other six Govern baselines may capture empty states for the same reason. A restyle checked against an empty page proves nothing.

- [ ] **Step 1: Write the failing test.** `govern-fixtures.spec.ts` opens each of the seven routes as admin and asserts real content, not an empty or error state:
  - `compliance: lists at least two policies, one failing`
  - `compliance run details: shows passed and failed results, not "Run not found."`
  - `policy details: shows its rule, a run history and a metadata panel`
  - `master data: a configuration with two sources, two matching rules, one run and three candidates`
  - `security features: lists at least two features`
  - `entitlements: lists two personas; the first has privileges and group assignments`
  - `entitlements sync: lists one configuration and one with a disabled switch`
- [ ] **Step 2: Run it, and check it fails** (the run and most Master Data, Entitlements and sync fixtures are missing).
- [ ] **Step 3: Add the fixtures** and handlers. Use ids in the style of the existing ones (`e2e-policy-1`, `e2e-run-1`). Include one 200-character policy name and one 120-character object name, which Tasks 2–3 use for Review Focus 1.
- [ ] **Step 4: Confirm the kit is enough.** Read the seven views and the five `components/mdm/*` files, and list every control and layout in them that the kit can't express (for example a split view or a stepper). Write it into the report. If there is any, stop and tell the owner before Task 2, because it needs its own kit task.
- [ ] **Step 5: Re-baseline the seven pages on the unchanged UI**, both personas. `git diff --stat` must touch only these pages' controls and screenshots.
- [ ] **Step 6: Commit** "Give the Govern restyle baselines real content".

### Tasks 2–8: Govern pages

| Task | Pages and routes | Own files (and the components only they import) | Notes |
|---|---|---|---|
| 2 | Compliance `/compliance` | `views/compliance.tsx` (486) | The policies grid is a `DataTable` with memoised columns; row click opens the policy. The create/edit dialog moves to the kit `Dialog`, with its category and severity Selects and the three `Textarea`s (the rule DSL one in mono). Keep `lib/compliance-rule-warnings`. Covers Review Focus 4 and 5. |
| 3 | Policy details `/compliance/policies/:policyId`, run details `/compliance/runs/:runId` | `views/compliance-policy-details.tsx` (545), `views/compliance-run-details.tsx` (164) | Panes: summary (`DetailsGrid`), rule, run history, results (`DataTable` with `searchColumn="object_name"`), metadata and comments panels with `flush`. Keep `lib/compliance-run-error`. **Fix the permission gap:** Edit and Run Now are ungated; gate both on `hasPermission('compliance', READ_WRITE)`. The owner approved this on 2026-11-13: read-only users don't see either control. Covers Review Focus 2 and 3. |
| 4 | Security Features `/security-features` | `views/security-features.tsx` (319) | Small list plus one dialog (kit `Dialog`) and a delete confirm. |
| 5 | Entitlements Sync `/entitlements-sync` | `views/entitlements-sync.tsx` (371) | `DataTable` plus the configuration dialog (connection and catalog Selects, a Switch). Keep the `Select` sentinel for "no catalog". |
| 6 | Entitlements `/entitlements` | `views/entitlements.tsx` (548) | A persona list with a detail area: panes for the list and the selected persona, kit `Tabs` for Access privileges and Group assignments, dialogs for create/edit persona and Add privilege. `PrincipalPicker` is consumed as it is. |
| 7 | Master Data page `/master-data` | `views/master-data-management.tsx` (899) | Kit `Tabs` for Overview, Sources, Matching rules, Runs and Candidates (the last only when it applies, as now). Keep the navigation into `/data-asset-reviews/:id` from candidates and from a created review. Dialogs are opened from here but belong to Task 8. |
| 8 | Master Data dialogs and editors | `components/mdm/create-review-dialog.tsx` (188), `link-source-dialog.tsx` (623), `mdm-config-dialog.tsx` (390), `matching-rules-editor.tsx` (394), `mdm-match-review.tsx` (706) | Dialogs move to the kit `Dialog`. `mdm-match-review` is shared with the wave-1 `asset-review-editor`; its tests (`asset-review-editor.*.test.tsx`) must pass unchanged. About 2,300 lines: split into 8a (the three dialogs) and 8b (the editor and match review) if it passes 3k. Covers Review Focus 4 for the config dialog. |

Each task follows "How each page task runs" above, and Tasks 2, 4, 5, 6 and 7 add their own `<page> delete confirm is an alertdialog, sends once and returns focus` test where the page has a delete.

### Task 9: Review, merge and the next wave

- [ ] **Step 1:** The final whole-branch review, on the most capable model.
- [ ] **Step 2:** The owner reviews it on localhost:3100, covering every Govern page, one dialog from each, and the Master Data match review reached from an asset review.
- [ ] **Step 3:** Fix the owner's findings through the owning task's tests.
- [ ] **Step 4: Run everything:**
  - `npx vitest run` and `npm run type-check`;
  - the full Playwright suite on 3200;
  - a check that `src/backend` is unchanged (`git diff --stat development -- src/backend`).
- [ ] **Step 5:** Merge into `development`, only with the owner's go-ahead.
- [ ] **Step 6:** Ask the owner whether to redeploy the `nucleus` preview app from the merged commit. A redeploy writes to the workspace, so it needs their explicit go-ahead, and the profile is passed with `--profile`, never auto-selected.

Then wave 4 (Settings: the 22 settings pages, Data Domains, Teams, Projects, Business Roles, Delivery Methods, Audit, Workflows) gets its own plan.

## Decisions

1. **Task 3's permission gate (owner, 2026-11-13):** Edit and Run Now are not shown to read-only users. They need `compliance` write access.
2. **Execution (owner, 2026-11-13):** subagent-driven.
3. **Rename (owner, 2026-11-13):** deferred. `chore/rename-product-to-nucleus` is not part of this wave; whichever merges second takes the small locale-file conflicts.
4. **Task 8's split:** one task unless it passes about 3,000 lines (it's about 2,300 now).
