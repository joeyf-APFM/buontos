# Mantine restyle, waves 0 and 1: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every unmigrated page the Aura look through tokens and Mantine-backed shared building blocks (wave 0), and fully restyle the five data asset pages to the explorer's page anatomy (wave 1). The two waves merge into `development` together.

**Architecture:**
1. Lay a safety net first: per-page screenshots and a list of controls seen by two personas, both recorded on the unchanged UI.
2. Point the shadcn CSS variables at Aura, which recolours all 67 screens.
3. Rebuild the simple `components/ui` primitives on Mantine behind their existing exports, and restyle the compound Radix primitives through tokens and density classes.
4. Extract the explorer's page anatomy into a small page kit, and rebuild the wave-1 pages on it with Mantine and CSS modules, removing their Tailwind.

**Tech Stack:** React 18, Mantine **8.3.18** (+ `@mantine/notifications@8.3.18`), TanStack Table, react-hook-form + zod, react-i18next, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-mantine-restyle-design.md` (approved 2026-11-09). Reference implementations: `src/frontend/src/mantine/` (theme, shell, asset-explorer, assistant windows).

**Later waves:** waves 2–6 each get their own plan when they start, written against the code as it is then (see "Roadmap" at the end).

## Global Constraints

- **Branching:**
  - Start only after `feature/mantine-explorer-helix` is merged into `development` (an owner action). Then branch `restyle/waves-0-1` off `development`, in a worktree.
  - Waves 0 and 1 merge together into `development`, after the owner's review on localhost:3100.
  - Nothing is pushed or merged without the owner.
- **Never restart the owner's dev servers** (3000/8000). The review stack is the worktree backend on 8100 against `app_ontos_mantine` plus Vite on 3100 (both run by the controller). Screenshot runs use their own Vite on **3200** with mocked APIs.
- **Mantine:** pinned to `8.3.18` exactly (Mantine 9 needs React 19). `@mantine/notifications` is pinned to `8.3.18` too.
- **Visual system:** Aura tokens and density exactly as in `docs/superpowers/plans/2026-11-09-mantine-asset-explorer-helix.md` § Global Constraints, which is already encoded in `src/frontend/src/mantine/theme.ts`. Body text 12px, table rows 28px, tree rows 24px, controls 26–28px, page title 16px, corners 4–8px, 1px shared pane borders, shadows only on floating elements.
- **Behaviour:** behaviour is unchanged. Every action, permission gate, keyboard path, route and API call is kept.
- **Existing tests:** they keep passing. A test may change only where it queried shadcn markup, and then it must query behaviour instead: role, label or test id.
- **Strings:** they stay in their current i18n namespaces. New strings go through react-i18next.
- **No workspace-specific values in code.** Any you find get logged in the report for the later portability project, not fixed here.
- **Lint:** the gate is no new lint errors in touched files. About 487 errors already exist at base.

## Review Focus

1. **Permission-gated controls must not vanish.** A read-only consumer must keep every control they had, and must gain none. *Test: Task 1's control inventory under the `consumer` persona, re-run in Tasks 3, 4 and 8–14.*
2. **Button `asChild` stays an anchor.** A button rendering a `<Link>` (`asChild`, 105 files) must still navigate, stay a real anchor and keep keyboard focus. *Test: Task 3 `button asChild renders the child element with button styling`.*
3. **Destructive toasts and toasts with actions.** They still show, read out and offer their action. *Test: Task 5 `destructive toast renders with the critical colour and an action`.*
4. **DataTable keyboard and selection.** Sorting, filtering, paging and row-selection checkboxes behave as before from the keyboard. *Test: Task 6 `keyboard sort and select-all still work`.*
5. **Form validation messages stay visible.** react-hook-form `FormMessage` errors under restyled inputs stay visible and associated with them (`aria-describedby`). *Test: Task 3 `input with a form error keeps aria-describedby and the message`.*

---

### Task 1: Safety net (screenshots and control inventory, on the unchanged UI)

**Files:**
- Modify: `src/frontend/tests/e2e/playwright.config.ts` (port 3100 → **3200**)
- Create:
  - `src/frontend/tests/e2e/restyle-check.spec.ts`
  - `src/frontend/tests/e2e/fixtures/personas.ts`
  - `src/frontend/tests/e2e/restyle-pages.ts`
- Snapshots: `src/frontend/tests/e2e/__screenshots__/restyle/`, `src/frontend/tests/e2e/__controls__/`

**Interfaces:**
- Produces:
  - `RESTYLE_PAGES: { id: string; route: string; wave: number }[]`. List every routed screen from the inventory (`.superpowers/sdd/screen-inventory.md`), with ids such as `asset-detail` and `data-catalog`. Detail routes use fixture ids.
  - `PERSONAS = { admin, consumer }`. `consumer` has READ_ONLY on its features and no `assets:READ_WRITE`. Personas are served by the fixture's `/api/user/permissions` response.
  - `controlInventory(page): Promise<string[]>`: the sorted accessible names, with their roles, of every button, link, menuitem, tab, checkbox, switch and combobox in `main`, after opening nothing.

- [ ] **Step 1: Write the spec.**
  - For each page × persona, it takes a screenshot of `main` at 1280×800 (`maxDiffPixelRatio: 0.01`).
  - It also writes `controlInventory` to `__controls__/<persona>/<id>.json`, or compares against that file once it exists.
  - Comparisons are exact list equality.
- [ ] **Step 2: Record baselines on the unchanged UI.** Run `npx playwright test -c tests/e2e/playwright.config.ts restyle-check --update-snapshots`. Expected: every page records. If a page needs fixtures it doesn't have, add them to the fixture router (mocked `/api`). Never use a real backend.
- [ ] **Step 3: Re-run without the flag.** Expected: all pass, which shows the check is stable.
- [ ] **Step 4: Commit** with subject "Record restyle baselines for every page".

### Task 2: Point the shadcn tokens at Aura

**Files:**
- Modify: `src/frontend/src/index.css` (`:root` block, lines ~40–80)
- Create: `src/frontend/src/mantine/aura-tokens.ts`
- Test: `src/frontend/src/mantine/aura-tokens.test.ts`

**Interfaces:**
- Produces `AURA_HSL: Record<string, string>`, the shadcn variable name → its HSL triplet. `theme.ts` and `index.css` must agree with it.

Mapping. Copy these values exactly; they are converted from the Aura hex values.

| shadcn variable | Aura | HSL |
|---|---|---|
| `--background` | canvas #FFFDF7 | `45 100% 98%` |
| `--foreground` | body #2C2F34 | `218 8% 19%` |
| `--card`, `--popover` | surface #FFFFFF | `0 0% 100%` |
| `--card-foreground`, `--popover-foreground` | body | `218 8% 19%` |
| `--primary` | accent #4F6AC5 | `226 50% 54%` |
| `--primary-foreground` | white | `0 0% 100%` |
| `--secondary`, `--muted` | surface-strong #F3EFE4 | `44 38% 92%` |
| `--secondary-foreground` | navy #1F3066 | `226 53% 26%` |
| `--muted-foreground` | secondary text #565D65 | `212 8% 37%` |
| `--accent` | accent-subtle #F1F5FF | `223 100% 97%` |
| `--accent-foreground` | accent-hover #334FA9 | `226 54% 43%` |
| `--destructive` | critical #D41C16 | `2 81% 46%` |
| `--destructive-foreground` | white | `0 0% 100%` |
| `--border`, `--input` | border #E2DDCD | `46 27% 85%` |
| `--ring` | accent | `226 50% 54%` |
| `--radius` | 4px | `0.25rem` |
| `--chart-1..5` | series-1..5 | `213 68% 50%`, `17 82% 56%`, `159 73% 40%`, `41 100% 46%`, `337 70% 70%` |

- [ ] **Step 1: Write the failing test.** `aura-tokens.test.ts` reads `index.css` with `?raw` and asserts that every `:root` variable in the table equals `AURA_HSL`. It also asserts that `AURA_HSL['--primary']` matches the hex `#4F6AC5` in `theme.ts`, using a small hex-to-HSL helper in the test and allowing ±1 per component.
- [ ] **Step 2: Run it to verify it fails.** Run `npx vitest run src/mantine/aura-tokens.test.ts`. Expected: FAIL, because the values are still neutral grey.
- [ ] **Step 3: Implement** `aura-tokens.ts` and the `:root` values. Leave the `.dark` block alone; light is forced.
- [ ] **Step 4: Run the test and the full vitest suite.** Expected: PASS.
- [ ] **Step 5: Re-baseline on purpose.** Run the Task 1 check. Every screenshot is expected to differ (colours), while every control inventory must still match. Record the new screenshots with `--update-snapshots` only after confirming that the inventories passed, and attach 4 sample before/after images to the report.
- [ ] **Step 6: Commit** with subject "Point the shadcn tokens at the Aura palette".

### Task 3: Form-control primitives on Mantine

**Files:**
- Modify: `src/frontend/src/components/ui/{button,input,textarea,label,checkbox,switch,radio-group}.tsx`
- Test: `src/frontend/src/components/ui/primitives.contract.test.tsx` (new)

**Interfaces:**
- Consumes: `renderWithMantine` (`src/test/utils.tsx`).
- Produces: the same exported names, props and refs as today. Mantine internals behind them.
  - `button.tsx` keeps `Button`, `ButtonProps` (`variant`: default | destructive | outline | secondary | ghost | link; `size`: default | sm | lg | icon; `asChild`) and **`buttonVariants`**. `buttonVariants` is used for links styled as buttons; it stays a className builder until wave 6, updated to the same density.
  - Button variant map:
    - default → Mantine `filled` (accent)
    - destructive → `filled` with color `red` (#D41C16)
    - outline → `default`
    - secondary → `light`
    - ghost → `subtle`
    - link → `transparent`, underlined on hover
  - Button sizes: default → 28px; sm → 26px; lg → 32px; icon → a 28px square.
  - `asChild` → Mantine `renderRoot`, cloning the single child element with the computed props.
  - Inputs forward `aria-invalid`, `aria-describedby`, `id` and `name` unchanged, so react-hook-form's `FormControl`/`FormMessage` keep working.

- [ ] **Step 1: Write the failing contract tests:**
  - `button renders each variant and size with the documented height`: assert `data-variant` and the computed `--button-height`;
  - `button asChild renders the child element with button styling` (a `<Link>` inside a MemoryRouter; it stays an `<a>` with `href`, is focusable, and navigates on Enter);
  - `button disabled and loading keep the native disabled attribute`;
  - `input with a form error keeps aria-describedby and the message` (inside the existing `Form`/`FormField` from `ui/form.tsx`);
  - `checkbox and switch toggle and call onCheckedChange` (the Radix prop name is kept);
  - `radio-group selects by value and fires onValueChange`.
- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/components/ui/primitives.contract.test.tsx`. Expected: FAIL on Mantine-specific assertions such as `data-variant`.
- [ ] **Step 3: Implement the wrappers.** Keep `forwardRef` and the prop names. Map `className` through, so existing Tailwind layout classes on callers still apply until each page's wave.
- [ ] **Step 4: Run the contract tests, then the full vitest suite.** Fix callers' tests only where they queried shadcn classes, and switch them to role or label queries. Expected: all pass.
- [ ] **Step 5: Run the Task 1 check.** Inventories must match for both personas. Re-baseline the screenshots after reviewing 4 samples.
- [ ] **Step 6: Commit** with subject "Rebuild the form-control primitives on Mantine".

### Task 4: Display primitives on Mantine

**Files:**
- Modify: `src/frontend/src/components/ui/{badge,card,alert,separator,skeleton,progress,avatar,scroll-area,table}.tsx`
- Test: extend `primitives.contract.test.tsx`

**Interfaces:**
- **Same exports.** Compound-looking but purely presentational parts stay as named exports over Mantine or plain styled elements: `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`, `Alert`/`AlertTitle`/`AlertDescription`, and `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`/`TableCaption`/`TableFooter`.
- **Card** becomes a pane: 1px `--aura-border`, 6px radius, no shadow, 12px padding, title 13px semibold navy. That's the first step away from floating cards. Pages make it fully flat in their wave.
- **Badge variant map:** default → `filled` accent; secondary → `light` gray; destructive → `filled` red; outline → `outline`. Height 18px, 10.5px text.
- **Table:** the cell heights match the explorer grid (28px rows, 28px header on `surface-strong`).

- [ ] **Step 1: Write the failing tests:**
  - `badge variants`;
  - `card renders as a bordered pane without shadow`;
  - `alert destructive uses role alert and the critical colour`;
  - `table parts render a table with 28px rows`;
  - `skeleton and progress render with aria attributes`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full vitest suite.** Then run the Task 1 check: inventories must match, then re-baseline the screenshots.
- [ ] **Step 5: Commit** with subject "Rebuild the display primitives on Mantine".

### Task 5: Toasts on Mantine Notifications

**Files:**
- Modify:
  - `package.json` (add `@mantine/notifications@8.3.18`, pinned)
  - `src/frontend/src/hooks/use-toast.ts`
  - `src/frontend/src/components/ui/{toaster,toast}.tsx`
  - `src/frontend/src/index.tsx` (import `@mantine/notifications/styles.layer.css` after the core styles)
  - `src/frontend/src/app.tsx` (the Toaster mount)
- Test: `src/frontend/src/components/ui/toaster.test.tsx` (update), `src/frontend/src/hooks/use-toast.test.ts` (update)

**Interfaces:**
- **Same `useToast()` API:** `toast({ title, description, variant, action, duration })` returns `{ id, dismiss, update }`; `dismiss(id?)` is unchanged. It's backed by `notifications.show`, `hide` and `update`.
- **The Toaster** renders `<Notifications position="bottom-right" limit={5} />`.
- **`variant: 'destructive'`** → color `red` and `role="alert"`; the default variant → `role="status"`.
- **`action`** (a `ToastAction` element) renders inside the notification body.

- [ ] **Step 1: Write the failing tests:**
  - `toast shows title and description`;
  - `destructive toast renders with the critical colour and an action`;
  - `dismiss removes it`;
  - `update changes its text`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full vitest suite.** About 158 files call `useToast`; none should need changes.
- [ ] **Step 5: Commit** with subject "Show toasts with Mantine notifications".

### Task 6: DataTable as the explorer grid

**Files:**
- Modify: `src/frontend/src/components/ui/data-table.tsx`, plus a new `data-table.module.css`
- Test: `src/frontend/src/components/ui/data-table.test.tsx` (extend)

**Interfaces:**
- **Same props and exports**, as used by about 30 files: sorting, global filter, pagination, optional selection, `bulkActions`, fixed layout.
- **Rendering:** a Mantine-styled table matching `mantine/asset-explorer/asset-table.tsx` (28px rows, a `surface-strong` header, `border-subtle` row lines, a selected-row highlight following Task 10b's rules), a Mantine `TextInput` filter, a Mantine `Pagination size="sm"`, and Mantine `Checkbox` selection.

- [ ] **Step 1: Write the failing tests:**
  - `renders 28px rows and the explorer header style`;
  - `keyboard sort and select-all still work` (Tab to a header, Enter sorts; Space on select-all selects the page);
  - `bulk actions appear with a selection`;
  - `global filter narrows rows`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full vitest suite and the Task 1 check** (inventories must match), then re-baseline the screenshots.
- [ ] **Step 5: Commit** with subject "Restyle the shared DataTable as the explorer grid".

### Task 7: Radix compound primitives restyled in place

**Files:**
- Modify: `src/frontend/src/components/ui/{select,dropdown-menu,dialog,alert-dialog,tabs,accordion,popover,hover-card,collapsible,command,tooltip,sheet,context-menu}.tsx`
- Test: `src/frontend/src/components/ui/compound-density.test.tsx` (new), `dialog.close-label.test.tsx` (existing, must pass)

**Interfaces:** the APIs are unchanged; they stay Radix (spec call 7). Only class strings change, to Aura density:
- Select trigger: 28px high, 12px text, 4px radius. Items: 26px.
- Menu and command items: 26px.
- Tabs list: 30px, with an underline style matching Mantine's `Tabs` default and a 2px accent indicator.
- Dialog and alert-dialog content: 8px radius, the floating shadow, 16px padding, a 14px semibold navy title.
- Tooltip: navy background, 11px white text.
- Popover and hover-card: 8px radius, the floating shadow, a 1px border.

Behaviour (focus trap, Esc, portals, `asChild`) is untouched. Tooltip stays Radix, so the shadcn `TooltipProvider` in `app.tsx` stays mounted until wave 6. This narrows the spec's "replaced by Mantine equivalents" to the Toaster (Task 5).

- [ ] **Step 1: Write the failing tests:**
  - `select trigger is 28px and opens with keyboard`;
  - `dialog keeps focus trap and Esc and its close label`;
  - `tabs switch with arrow keys and show the accent indicator`;
  - `dropdown items are 26px and activate with Enter`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement the class changes.**
- [ ] **Step 4: Run the full vitest suite and the Task 1 check** (inventories must match), then re-baseline the screenshots.
- [ ] **Step 5: Commit** with subject "Bring the Radix primitives to Aura density".

### Task 8: Shared app components

**Files:**
- Modify:
  - `src/frontend/src/components/common/{list-view-skeleton,relative-date,ownership-panel,principal-picker}.tsx`
  - `src/frontend/src/components/settings/settings-page-wrapper.tsx`
  - `src/frontend/src/components/metadata/entity-metadata-panel.tsx`
  - `src/frontend/src/components/comments/*`
  - the domain badges: `certification-badge`, `publication-badge`, `publication-scope`, `maturity`, `version-count`, `quality-badge`, `rating`, `domain-badge-list`
- Test: each component's existing tests; new `src/frontend/src/components/common/shared-panels.restyle.test.tsx`

**Interfaces:**
- Props and exports are unchanged.
- Layout moves from Tailwind to Mantine (`Stack`, `Group`, `Text`) plus CSS modules, matching the explorer's details panel: label column 86px, 12px text, rows separated by `border-subtle`, no nested cards.
- The domain badges keep their colour meaning but use the Aura status palette (good #277153 / bg #DDEBE4, warning #B67F14 / bg #FFF6E9, critical #D41C16, info #1E7CA1).

- [ ] **Step 1: Write the failing tests:**
  - `ownership panel lists owners in the details-panel grid`;
  - `metadata panel uses no nested cards`;
  - `comments thread keeps add, edit and delete controls`;
  - `badges use the Aura status colours`.
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.** Remove the Tailwind classes from these files.
- [ ] **Step 4: Run the full vitest suite and the Task 1 check** (inventories must match), then re-baseline the screenshots.
- [ ] **Step 5: Commit** with subject "Restyle the shared panels, skeletons and badges".

### Task 9: Approval wizard restyle (globally mounted)

**Files:**
- Modify: `src/frontend/src/components/common/approval-wizard-dialog.tsx` (1,302 lines) and its sub-components
- Test: the existing approval-wizard tests (2 files) must pass; add `approval-wizard.restyle.test.tsx`

- [ ] **Step 1: Write the failing test.** `every step's fields and buttons are present and the dialog uses Aura density`, asserting each step's controls by role and label.
- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Restyle** to Mantine layout primitives and CSS modules. Keep the Radix Dialog shell from Task 7.
- [ ] **Step 4: Run the tests and the Task 1 check.**
- [ ] **Step 5: Commit** with subject "Restyle the approval wizard".

### Task 10: The page kit (explorer anatomy)

**Files:**
- Create: `src/frontend/src/mantine/page/{page-layout.tsx,page-header.tsx,filter-bar.tsx,pane.tsx,details-grid.tsx,page.module.css}`
- Modify: `src/frontend/src/mantine/asset-explorer/explorer-page.tsx` (adopt `PageHeader`, `FilterBar` and `DetailsGrid` without changing behaviour)
- Test: `src/frontend/src/mantine/page/page-kit.test.tsx`

**Interfaces:**

```ts
export function PageLayout(props: { breadcrumb?: ReactNode; header: ReactNode; filters?: ReactNode; aside?: ReactNode; fullBleed?: boolean; children: ReactNode }): JSX.Element
export function PageHeader(props: { title: string; badges?: ReactNode; actions?: ReactNode; titleId?: string }): JSX.Element   // one line, 16px display-font title
export function FilterBar(props: { children: ReactNode; hint?: ReactNode }): JSX.Element
export function Pane(props: { title?: string; actions?: ReactNode; children: ReactNode; 'aria-label'?: string }): JSX.Element   // 1px shared borders, no shadow, no radius when adjacent
export function DetailsGrid(props: { rows: { label: string; value: ReactNode }[] }): JSX.Element   // 86px label column
export function Tabs: re-export of Mantine Tabs pre-styled to the Task 7 tab look, for pages migrating off ui/tabs
```

- `PageLayout` replaces the layout's `p-6` and the breadcrumb for pages that opt in. In `components/layout/layout.tsx`, a route renders full-bleed when it's in `FULL_BLEED_ROUTES`. Each wave adds its routes to that list.

- [ ] **Step 1: Write the failing tests:**
  - `page layout renders breadcrumb, a one-line header, filters and panes with shared borders`;
  - `details grid renders label/value rows`;
  - `the explorer still renders its header via PageHeader` (its existing tests also stay green).
- [ ] **Step 2: Run them to verify they fail.**
- [ ] **Step 3: Implement.** Make `FULL_BLEED_ROUTES` a pattern list, so detail routes such as `/assets/:assetId` can be added.
- [ ] **Step 4: Run the tests and the full vitest suite.**
- [ ] **Step 5: Commit** with subject "Extract the explorer's page anatomy into a page kit".

### Tasks 11–15: Wave 1 data asset pages

These tasks share the same shape. Each consumes the Task 10 page kit and the restyled primitives, and adds its routes to `FULL_BLEED_ROUTES`.

| Task | Page(s) | Files | Notes |
|---|---|---|---|
| 11 | Asset detail `/assets/:assetId` | `views/asset-detail.tsx` (659), plus the panels it renders | Tabs become page-kit `Tabs`. The details grid matches the explorer's details panel. The lineage graph and impact panels keep their libraries; only their pane chrome changes. |
| 12 | Data Catalog `/data-catalog`, `/data-catalog/*` | `views/data-catalog.tsx` (662), `views/data-catalog-details.tsx` (609) | The UC browser list becomes the explorer-style grid (raw `ui/table` today). The detail tabs move to page-kit `Tabs`. |
| 13 | Schema Importer `/schema-importer`, `/concepts/import` | `views/schema-importer.tsx` (297), `components/schema-importer/*` (incl. import-preview-dialog, schema-browser) | The wizard steps keep their order and validation. |
| 14 | Settings → Asset Types | `views/asset-types.tsx` (238), `components/settings/asset-type-form-dialog.tsx` | A DataTable page (Task 6). Its form dialog moves to Mantine fields. |
| 15 | Data Asset Reviews `/data-asset-reviews`, `/data-asset-reviews/:id` | `views/data-asset-reviews.tsx` (279), `views/data-asset-review-details.tsx` (525), `components/data-asset-reviews/*` | Keep the markdown and syntax-highlight rendering. `create-review-request-dialog` moves to Mantine fields. |

Steps for each task:
- [ ] **Step 1: Write the failing test** in `<page>.restyle.test.tsx`:
  - `<page> renders with the page kit` (PageHeader, panes, no `.p-6` and no shadcn Card in the page tree);
  - `<page> keeps every control` (assert the page's controls by role and name);
  - for detail pages, `<page> tabs switch with arrow keys`.
- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Restyle the page.**
  - Use Mantine and CSS modules, and remove every Tailwind class and `components/ui` import from the page's own files, wherever a Mantine or page-kit equivalent exists.
  - The compound Radix pieces (Select, DropdownMenu, Dialog) move to Mantine `Select`, `Menu` and `Modal` in this task.
  - Behaviour, routes and API calls are unchanged.
- [ ] **Step 4: Run the page's existing tests and the full vitest suite.**
- [ ] **Step 5: Run the Task 1 check for this page.** Control inventories for both personas must match the baseline exactly. Re-baseline the screenshots, and attach before and after images to the report.
- [ ] **Step 6: Commit** with subject "Restyle <page> on Mantine".

### Task 16: Review, merge and roadmap check

- [ ] **Step 1:** The controller restarts its own 8100 backend and confirms 3100 serves the branch. It never touches 3000 or 8000.
- [ ] **Step 2: Owner review** at http://localhost:3100. Cover the five wave-1 pages, plus a walk through three pages that have only had wave 0 (Data Products, Compliance, Settings → Teams), to judge whether wave 0's half state is acceptable.
- [ ] **Step 3:** Fix any owner findings through the owning task's tests.
- [ ] **Step 4: Run everything.** Run `npx vitest run`, `npm run type-check`, lint on the touched files, the Task 1 check for every page and persona, and the backend unit suite (to show nothing changed there).
- [ ] **Step 5: Merge** into `development`, with the owner's go-ahead, and only then.

---

## Roadmap (each wave gets its own plan when it starts)

| Wave | Pages | Tasks of their own |
|---|---|---|
| 2 Build | Data Products list, My Products, My Requests, Data Contracts list, Concepts (browser, detail, search, hierarchy, enrich, mapping, define, collections, generator), business owners, owner-consumers, Marketplace, Search | Data Product details (2,561 lines), Data Contract details (3,418 lines), Concept detail |
| 3 Govern | Compliance (list, policy, run), Master Data, Security Features, Entitlements, Entitlements Sync | none |
| 4 Settings | 22 settings pages, Data Domains (list, detail), Teams, Projects, Business Roles, Delivery Methods, Audit, Workflows list | Workflow designer toolbars, dialogs and nodes (the reactflow canvas stays) |
| 5 Deploy and the rest | Estate Manager, Estate details, Home, About, User Guide, docs pages, Database Schema, Not Found, sync-domains, `/dev/lineage` | Catalog Commander |
| 6 Clean-up | remove `components/ui`, Tailwind and its config and plugins, the HSL variables, unused Radix packages, the legacy shell files, unrouted views, `@dnd-kit` and `usePointerEventsGuard`; simplify the CSS layers; update the 18 Playwright journey specs and run them once against the worktree stack | none |

Each later wave's plan follows the same pattern: the Task 1 check, then page-kit restyle tasks, then the owner's review, then the merge.
