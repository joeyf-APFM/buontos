# Mantine restyle, wave 2 (Build): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every Build screen (Data Products, Data Contracts, the Concepts area, the owner lists, Marketplace and Search) to the explorer's page anatomy on Mantine, with no Tailwind or `components/ui` in their own files. Behaviour stays exactly as it is.

**Architecture:**
1. Add the one missing kit piece, a `Dialog` that owns the Modal look, layering, Escape and focus. Move wave 1's five Modals onto it.
2. Make the two pages that never settle (My Requests, Owner Consumers) settle, so they get a safety-net baseline before they're restyled.
3. Make the shared detail panels dense inside panes.
4. Restyle the pages area by area. Each task owns the view files and the components that only its pages import. The three largest detail pages are split into frame, sections and dialogs.

**Tech Stack:** React 18, Mantine **8.3.18**, TanStack Table, react-hook-form + zod, react-i18next, vitest, Playwright. reactflow and cytoscape stay; only their chrome changes.

**Spec:** `docs/superpowers/specs/2026-11-09-mantine-restyle-design.md` ("Page waves → Wave 2").

**Prior plan:** `docs/superpowers/plans/2026-11-09-mantine-restyle-waves-0-1.md`, merged into `development` as `9b63ed70`. Its ledger and rulings R1–R23 are in `.superpowers/sdd/2026-11-09-mantine-restyle-waves-0-1/progress.md`, and its deferred items are in `.superpowers/sdd/follow-ups.md`. Both carry forward.

## Global Constraints

- **Branching:**
  - Work on branch `restyle/wave-2`, off `development` at `9b63ed70`, in the worktree `~/Projects/buontos-worktrees/mantine-helix`.
  - The wave merges into `development` after the owner reviews it on localhost:3100.
  - Nothing is pushed or merged without the owner.
- **Never restart the owner's dev servers** (3000/8000). The controller runs the review stack: backend on 8100, Vite on 3100. Screenshot and inventory runs use their own Vite on **3200** with mocked APIs (`tests/e2e/playwright.config.ts`).
- **Mantine** is pinned to `8.3.18` exactly.
- **Visual system:**
  - **Theme:** Aura tokens and the Optima stack `Optima, Candara, 'Segoe UI', sans-serif`, as encoded in `src/frontend/src/mantine/theme.ts`. Monospace only for code, SQL and identifiers, through `--aura-font-mono`.
  - **Sizes:** body text 12px, table rows 28px, controls 26–28px, page title 16px, corners 4–8px.
  - **Surfaces:** panes share 1px borders. Shadows only on floating elements.
- **Page anatomy:**
  - Use the page kit in `src/frontend/src/mantine/page/`: `PageLayout`, `PageHeader`, `FilterBar`, `Pane`, `PaneStack`, `DetailsGrid` and `Tabs`.
  - Don't add breadcrumbs. The shell owns them. Pages supply only their entity name, through `usePageBreadcrumb` or the legacy `breadcrumb-store`.
  - Routes that should fill the window go in `FULL_BLEED_ROUTES` (`src/frontend/src/mantine/shell/full-bleed.ts`).
- **Behaviour is unchanged.** Every action, permission gate, keyboard path, route and API call is kept. The menu (`nav-config.ts`) doesn't change in this wave.
- **No Tailwind classes and no `components/ui` imports** in a task's own files once it lands.
  - The exception is `components/ui/button` and `components/ui/badge`, which already render Mantine. They may stay; wave 6 removes them app-wide.
  - Compound Radix pieces (Select, DropdownMenu, Dialog, AlertDialog, Popover, Tabs, Accordion, Collapsible) move to Mantine `Select`, `Menu`, the kit `Dialog`, `Popover`, kit `Tabs` and `Accordion`.
- **Existing tests keep passing.** A test may change only where it queried shadcn or Radix markup, and then it queries behaviour instead: role, label or test id.
- **Strings stay in their i18n namespaces.** New strings go through react-i18next.
- **No workspace-specific values in code.** Log any you find in the report.
- **Lint:** no new lint errors in touched files.
- **Lessons from waves 0–1, binding on every task:**
  - Show every new test failing first.
  - Check computed styles in Playwright, not jsdom (R10).
  - When a modal closes, focus goes back to its opener once, and only when `focusIsFree` says it may.
  - Async and debounced effects drop stale responses.
  - Guard arrays that come from the API.
  - A Select needs a sentinel value instead of a duplicate one.
  - Long text wraps, or is truncated with a `title`.
  - Confirm modals use the alertdialog role.
  - Prose isn't set in the mono font.
  - Column definitions passed to `DataTable` are memoised, so cells keep their focus.

## Review Focus

1. **Long names and descriptions** (product, contract, concept, owner) inside the new panes and grid cells wrap or truncate with a `title`. They never widen the page. *Test: each page task's Playwright step checks a 200-character name with no horizontal page scroll (Tasks 4–16).*
2. **Empty, loading and error states** keep their message and their call to action (Create, Retry) when the list is empty or the request fails. *Test: each list task's `<page> empty and error states keep their actions` (Tasks 4–6, 12, 16).*
3. **Escape inside a dialog's own dropdown** closes only the dropdown, never the dialog, and unsaved input survives. *Test: Task 1 `Dialog: Escape in an open Select closes only the Select`, run in a real browser.*
4. **Card and table views** (`ViewModeToggle`) keep their actions in both modes, and the chosen mode persists. *Test: Task 4 `data products: both view modes keep row actions and the mode persists`.*
5. **Wide tables** (contract schemas with many columns, concept property lists) scroll inside their pane, and the page header stays in place. *Test: Task 10 `contract schemas: a 60-column schema scrolls inside its pane` and Task 15 `concept detail: long property list scrolls in its pane`.*

## How each page task runs (Tasks 4–16)

**Scope:**
- A task owns the view files named in its row, and every component that only those views import. Use `grep -rl` over `src/views` and `src/components` to check.
- A component shared with an earlier task in this plan is consumed as it is.
- A component shared with a later task is restyled by the earlier task, and the later task consumes it.
- A component used by a later *wave* keeps its current look. List it in the report.

**Steps:**
- [ ] **Step 1: Write the failing tests** in `<page>.restyle.test.tsx`:
  - `<page> renders with the page kit`: the PageHeader and panes are present, with no `.p-6`, no shadcn Card, and no Tailwind class in the page's own markup.
  - `<page> keeps every control`: the page's controls, by role and name, for both personas.
  - The task's Review Focus tests.
- [ ] **Step 2: Run them, and check they fail.**
- [ ] **Step 3: Restyle** with Mantine, the page kit, the kit `Dialog` (Task 1) and CSS modules.
- [ ] **Step 4: Run** the page's existing tests and the full vitest suite twice.
- [ ] **Step 5: Run the restyle check** (`npx playwright test -c tests/e2e/playwright.config.ts`) for both personas.
  - Control inventories must match the baseline exactly.
  - Re-baseline only this task's screenshots. Revert pixel noise on any other page.
  - Put before and after images in `task-N-images/`.
- [ ] **Step 6: Commit** with subject "Restyle <page> on Mantine".

---

### Task 1: The kit Dialog

**Files:**
- Create: `src/frontend/src/mantine/page/dialog.tsx`, `dialog.module.css`, `dialog.test.tsx`
- Modify: `src/frontend/src/mantine/page/index.ts`, `src/frontend/tests/e2e/page-kit.spec.ts`
- Move onto it:
  - `views/asset-types.tsx`
  - `views/data-asset-review-details.tsx`
  - `components/schema-importer/import-preview-dialog.tsx`
  - `components/data-asset-reviews/create-review-request-dialog.tsx`
  - `components/asset-types/asset-type-form-dialog.tsx`

**Interfaces:**
- Consumes: `useLayeredEscape(opened, onClose)` from `mantine/use-layered-escape.ts`, `focusIsFree(closed)` from `mantine/focus-free.ts`, `alertDialogRole(node)` from `mantine/alert-dialog-role.ts`, and `Z_INDEX` from `mantine/z-index.ts`.
- Produces: `Dialog(props: DialogProps)` and `type DialogProps`, exported from `@/mantine/page`.

  ```ts
  interface DialogProps {
    opened: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;          // rendered as the accessible description
    size?: 'sm' | 'md' | 'lg' | 'xl'; // 420 / 560 / 720 / 960 px
    role?: 'dialog' | 'alertdialog';  // alertdialog for confirms
    returnFocusTo?: RefObject<HTMLElement>; // focus target on close, gated by focusIsFree
    footer?: ReactNode;               // right-aligned action row
    closeOnClickOutside?: boolean;    // default false (matches waves 0–1)
    children: ReactNode;
  }
  ```

  Every later task uses `Dialog` for modals. No task calls Mantine `Modal` directly.

- [ ] **Step 1: Write the failing tests.**
  - `dialog.test.tsx`:
    - `Dialog has role dialog, a labelled title and description`
    - `Dialog role alertdialog sets the role`
    - `Dialog returns focus to returnFocusTo once, only when focus is free`
    - `Dialog closes on Escape`
  - `page-kit.spec.ts` (real browser):
    - `Dialog: Escape in an open Select closes only the Select`
    - `Dialog: Escape in an open Radix popover closes only the popover`
    - `Dialog sits above the shell and below toasts`, checked through computed `z-index`
- [ ] **Step 2: Run them, and check they fail** (the module is missing).
- [ ] **Step 3: Implement `Dialog`.**
  - It wraps Mantine `Modal`, with `closeOnEscape={false}`.
  - Escape goes through `useLayeredEscape`.
  - Its z-index comes from `Z_INDEX`.
  - Its look (header, body, footer, 1px border, 8px corners) lives in `dialog.module.css`. Move the shared rules out of `import-preview-dialog.module.css`, and update the four feature modules that borrowed them to use the kit instead.
- [ ] **Step 4: Move the five wave-1 Modals onto `Dialog`.**
  - Their existing tests and specs must pass unchanged, apart from queries that relied on Mantine Modal internals.
  - Replace `views/asset-types.tsx:174-175`'s local focus rule with `focusIsFree`.
- [ ] **Step 5: Run the full vitest suite twice, then the restyle check.** Expect no inventory change, and screenshots changed only where the dialog look is intentionally unified.
- [ ] **Step 6: Commit** "Add the kit Dialog and move the wave 1 dialogs onto it".

### Task 2: Settle My Requests and Owner Consumers, and baseline them

**Files:**
- Modify: `views/my-requests.tsx`, `views/owner-consumers.tsx`, `tests/e2e/restyle-pages.ts` (remove their `skip`)
- Test: `views/my-requests.settle.test.tsx`, `views/owner-consumers.settle.test.tsx`

**Why:** both pages' effects depend on the object `useApi()` returns. It's new on every render, so they refetch forever and the safety net skipped them.

- [ ] **Step 1: Write the failing tests.** `my requests fetches once on mount` and `owner consumers fetches once on mount`: count the `fetch` calls after the page settles. Expect exactly the number of endpoints the page loads.
- [ ] **Step 2: Run them, and check they fail.**
- [ ] **Step 3: Fix the effects** to depend on the stable `get`/`post` functions, not on the `useApi()` object. Don't change `hooks/use-api.ts`.
- [ ] **Step 4:** Record both pages' screenshots and control inventories for both personas on the otherwise unchanged UI. Commit them as the baseline.
- [ ] **Step 5: Commit** "Stop My Requests and Owner Consumers refetching forever".

### Task 3: Shared detail panels, dense inside panes

**Files:**
- Modify:
  - `components/common/ownership-panel.tsx`, `components/common/panel.module.css`
  - `components/metadata/entity-metadata-panel.tsx`, `components/metadata/entity-tags-panel.tsx`
  - `components/comments/*`, `components/ratings/*`, `components/quality/*`
- Test: `components/metadata/shared-panels.density.test.tsx`, `tests/e2e/shared-panels.spec.ts`

**Interfaces:**
- Produces: each panel accepts `flush?: boolean`. With it set, the panel renders without its own card chrome or padding, ready to sit in a `Pane`. Tasks 7–15 pass it.

- [ ] **Step 1: Write the failing tests:**
  - `shared panels with flush render no card chrome`;
  - in Playwright, `entity metadata panel rows are 28px inside a Pane`.
- [ ] **Step 2: Run them, and check they fail.**
- [ ] **Step 3: Implement `flush`.** Move these panels off shadcn density: no `p-6` and no Card, labels at 12px, and the DetailsGrid rhythm. Without `flush`, the current look is unchanged for wave 3–5 callers.
- [ ] **Step 4: Run the full vitest suite twice and the restyle check.** Inventories must not change.
- [ ] **Step 5: Commit** "Let the shared detail panels sit flush in panes".

### Tasks 4–16: Build pages

| Task | Pages and routes | Own files (and the components only they import) | Notes |
|---|---|---|---|
| 4 | Data Products `/data-products`, My Products `/my-products` | `views/data-products.tsx` (1026), `views/my-products.tsx` (401), `components/data-products/data-product-create-dialog.tsx` and other list-only components | The grid uses `DataTable` with memoised columns. Covers Review Focus 4. |
| 5 | My Requests `/my-requests`, Business Owners `/business-owners`, Owner Consumers `/owner-consumers` | `views/my-requests.tsx` (401), `views/business-owners.tsx` (152), `views/owner-consumers.tsx` (299) | Needs Task 2's baselines. |
| 6 | Data Contracts `/data-contracts` | `views/data-contracts.tsx` (835), its create and upload dialogs | Keep `?new=1` (opens create, waits for `usePermissionsReady`). Keep the import toggles. |
| 7 | Data Product details, frame and sections: `/data-products/:id`, `/my-products/:id` | `views/data-product-details.tsx` (2560): header, actions, and every section | Panels come from Task 3 with `flush`. Dialogs stay as they are until Task 8. |
| 8 | Data Product details dialogs | the `components/data-products/*` dialogs opened from the detail page | All of them go on the kit `Dialog`. |
| 9 | Data Contract details, frame and top sections: `/data-contracts/:id` | `views/data-contract-details.tsx`, from the start to the Schemas card (about line 2100): header, actions, overview | Same pattern as Task 7. |
| 10 | Data Contract details, Schemas to Authoritative Definitions | the same file from about line 2100: Schemas, Linked Products, Quality Rules, Team Metadata, SLA & Infrastructure, Access Control, Custom Properties, Support, Authoritative Definitions | Covers Review Focus 5 (wide schemas). |
| 11 | Data Contract dialogs | the `components/data-contracts/*` dialogs opened from the contract pages | All go on the kit `Dialog`. Split into two commits if over about 3k lines. |
| 12 | Concepts layout, Define `/concepts/define`, Collections `/concepts/collections`, Generator `/concepts/generator` | `components/concepts/concepts-layout.tsx`, `views/define.tsx` (610), `views/collections.tsx` (227), `views/ontology-generator.tsx` (936), the `components/knowledge/*` dialogs they open (ImportConceptsDialog, CollectionEditorDialog), `components/concepts/guided-generate-dialog.tsx` | Keep Define's `?open=` behaviour from 16e. |
| 13 | Explore `/concepts/browser`, Search `/concepts/search`, Hierarchy Browser `/concepts/hierarchy` | `views/explore.tsx` (644), `views/ontology-search.tsx` (118), `views/hierarchy-browser.tsx` (577), `components/semantic-models/*` chrome | The cytoscape and reactflow canvases stay. Only toolbars, legends and side panes change. |
| 14 | Enrich `/concepts/enrich`, Term Mapping `/concepts/mapping` | `views/enrich.tsx` (748), `views/term-mapping.tsx` (463), `components/enrich/*`, `components/term-mapping/*` | |
| 15 | Concept detail `/concepts/browser/*` | `views/concept-detail.tsx` (1420) and the concept panels only it uses | Covers Review Focus 5 (property lists). |
| 16 | Marketplace `/marketplace`, Search `/search`, `/search/llm`, `/search/index` | `components/home/marketplace-view.tsx` (780) and the `components/home/*` it uses, `views/search.tsx` (83), `components/search/*` | Home (`/`) is wave 5. Keep any `components/home/*` that Home also uses as consumed only. |

Each task follows "How each page task runs" above.

### Task 17: Review, merge and the next wave

- [ ] **Step 1:** The final whole-branch review, on the most capable model.
- [ ] **Step 2:** The owner reviews it on localhost:3100, covering every Build page plus one dialog from each area.
- [ ] **Step 3:** Fix the owner's findings through the owning task's tests.
- [ ] **Step 4: Run everything:**
  - `npx vitest run` and `npm run type-check`;
  - the full Playwright suite on 3200;
  - a check that `src/backend` is unchanged (`git diff --stat development -- src/backend`).
- [ ] **Step 5:** Merge into `development`, only with the owner's go-ahead.

Then wave 3 (Govern) gets its own plan.
