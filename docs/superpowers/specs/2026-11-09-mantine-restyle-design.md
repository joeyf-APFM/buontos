# Restyle the rest of buontos on Mantine: design

Date: 2026-11-09. Status: draft for review. Follows `2026-11-07-mantine-asset-explorer-helix-design.md` (the shell, Asset Explorer and Helix), which is built on branch `feature/mantine-explorer-helix`.

## Why

The shell, the Asset Explorer and the Helix and Ontos windows are now Mantine in APFM's Aura colours, with dense Databricks-style layouts. The other 67 screens are still shadcn/Radix + Tailwind, so the app looks like two apps.

The owner wants every page restyled to match. Each page keeps its current layout and behaviour, and the app ends **fully on Mantine**, with Tailwind and shadcn removed (owner, 2026-11-09).

## Success

- Every routed screen looks and feels like the Asset Explorer: Aura colours, the density targets, and panes that share 1px borders instead of floating cards.
- No screen imports from `components/ui` (shadcn) or uses Tailwind classes.
- Tailwind, shadcn, `tailwindcss-animate`, `tailwind-merge` and the unused Radix packages are removed from `package.json`.
- Behaviour is unchanged. Existing tests still pass, with their markup queries updated where they relied on shadcn internals.

## Goals

1. **Wave 0, the foundation:**
   - point the old pages' CSS variables at the Aura tokens;
   - rebuild the shared building blocks on Mantine;
   - fix the tests that depend on shadcn internals.
2. **Wave 1, the data asset pages** (owner's first priority).
3. **Waves 2 to 5:** the remaining screens, area by area.
4. **Wave 6:** remove Tailwind, shadcn, the old CSS variables and the dead legacy files.

## Non-goals

- Changing what any page does, its layout structure, its routes or its API calls. This is a restyle; a rethink of how users move through the app is a separate later project (owner, 2026-11-09).
- The workspace-portability project (inventory of workspace-bound values and a migration runbook). It comes after this one.
- Dark mode. Aura is light-only.
- Graph libraries. reactflow and cytoscape stay; only their surrounding toolbars, cards, node styling and controls are restyled.
- Merging Ask Ontos into Helix, and the Ask Ontos write-permission issue. Both are open separately with the owner.

## Anti-goals (a failure even if it works)

- A page loses a feature, an action, a permission check or a keyboard path because a component was swapped.
- Pages end up in a half state for long: Mantine controls on top of Tailwind gutters and card stacks.
- A new workspace-specific value (a host, warehouse ID, catalog name or similar) is hard-coded during the restyle. buontos must later move to a new workspace (see "Constraints").

## Constraints

- **Stack:** React 18, Mantine **8.3.18** pinned (Mantine 9 needs React 19), TanStack Table, react-hook-form + zod, react-i18next, vitest, Playwright.
- **The visual system is the one already built:** the Aura tokens and density targets in `docs/superpowers/plans/2026-11-09-mantine-asset-explorer-helix.md` ("Global Constraints"), the theme in `src/frontend/src/mantine/theme.ts`, and the shell, explorer and Helix modules as reference implementations.
- **Workspace portability:** buontos will move to an APFM-managed VPC workspace that replaces the current one. The Unity Catalog metastore stays. No workspace-specific values in frontend code. Any found in passing are noted for the later portability project, not fixed in this one.
- **Permissions:** every menu item, button and action keeps its current permission gating.
- **i18n:** strings stay in their current namespaces. New strings go through react-i18next.
- **Working rules:** work happens on a feature branch, and nothing is pushed or merged without the owner. Never restart the owner's dev servers (3000 and 8000). Tests come first, and existing tests keep passing.
- **Branching and merging (owner, 2026-11-09): merge into `development` per wave.**
  - The restyle starts once `feature/mantine-explorer-helix` (the shell, explorer and Helix work) has been reviewed by the owner and merged into `development`.
  - Each wave is then its own branch off `development`. Wave 0 and wave 1 merge together, so the half-restyled state (Mantine controls on Tailwind layouts) never ships alone.
  - Each later wave merges when the owner has reviewed it.

## Foundation (wave 0)

1. **Tokens.** `src/frontend/src/index.css` defines the HSL CSS variables that Tailwind and shadcn read: background, foreground, primary, muted, border, ring, radius and so on. Point them at the Aura values and set the radius to the 4px default. Every unmigrated page changes colour at once, before any component work. Verify with the existing unmigrated-screens Playwright check, re-baselined on purpose.
2. **Building blocks.** Rebuild these on Mantine, keeping each one's exported names and props, so their callers don't change. *Exception (my call):* the compound Radix primitives (Select, DropdownMenu, Dialog, AlertDialog, Tabs, Accordion, Popover, HoverCard, Collapsible, Command) stay on Radix in wave 0, restyled through the Aura tokens. Each page moves to the Mantine equivalents in its own wave, because about 100 files compose them from parts, and a parts-preserving Mantine adapter would be fragile.
   - button, badge, label, input, textarea, select, checkbox, switch, radio-group;
   - dialog, alert-dialog, alert;
   - card, tabs, table;
   - tooltip, popover, dropdown-menu, separator, scroll-area, collapsible, accordion, progress, skeleton, avatar, hover-card;
   - the toaster and `use-toast`;
   - the shared `DataTable` (`components/ui/data-table.tsx`), as a Mantine-styled TanStack table matching the explorer grid.

   About 270 files import these. Where an API can't be kept exactly, the wrapper maps the old props and the plan lists the exceptions.
3. **Shared app components.** These are used across many screens and get the same treatment:
   - `list-view-skeleton`, `SettingsPageWrapper`, `relative-date`, `entity-metadata-panel`, `ownership-panel`, `comments`, `principal-picker`;
   - the domain badges (certification, publication, quality and others).
4. **Tests.** About 20 component tests mock `components/ui/*` or query Radix-specific roles and attributes. They are updated to query behaviour (roles, labels, test ids) instead of library internals. vitest gets the Mantine test wrapper and shims everywhere.
5. **Global pieces in `app.tsx`:**
   - the shadcn `TooltipProvider` and `Toaster` are replaced by Mantine equivalents;
   - `usePointerEventsGuard` (a Radix workaround) is removed once nothing needs it;
   - `ApprovalWizardDialog` (mounted globally) is restyled in wave 0, because every area uses it.

After wave 0 every page uses Mantine controls in Aura colours. Layouts still carry Tailwind spacing and card stacks until each page's wave.

## Page waves

Each page in a wave is restyled to the explorer's page anatomy, keeping its content and behaviour:
- breadcrumb;
- a one-line page header with title, type and status badges and the primary action on the right;
- a filter bar where it has filters;
- content in panes that share 1px borders, without floating cards and without page-wide `p-6` gutters;
- the density targets.

A page's Tailwind classes are removed when its wave lands.

- **Wave 1, data asset pages (owner's choice):**
  - asset detail `/assets/:assetId`;
  - Data Catalog `/data-catalog` and `/data-catalog/*`;
  - Schema Importer `/schema-importer` and `/concepts/import`;
  - Settings → Asset Types;
  - Data Asset Reviews `/data-asset-reviews` and `/data-asset-reviews/:id`.
- **Wave 2, Build:**
  - Data Products list, My Products, My Requests;
  - Data Contracts list;
  - the Concepts area (browser, concept detail, search, hierarchy, enrich, mapping, define, collections, generator);
  - business owners and owner-consumers;
  - Marketplace and Search, from Discover, because they share these lists.
  
  Data Product details and Data Contract details are each their own task, being the two largest views (2,561 and 3,418 lines).
- **Wave 3, Govern:** Compliance (list, policy, run), Master Data, Security Features, Entitlements and Entitlements Sync.
- **Wave 4, Settings:**
  - the 22 settings pages (most are thin wrappers around `components/settings/*`);
  - Data Domains list and detail, Teams, Projects, Business Roles, Delivery Methods, Audit;
  - Workflows (list and the designer's toolbars and dialogs; the designer canvas stays reactflow).
- **Unlisted pieces (my call):** the remaining `components/ui` pieces (command/cmdk, form, sheet, slider, tree-view, tag-selector, tag-chip, domain-multi-selector, notification-bell, project-chooser, markdown-viewer, user-info, breadcrumbs) move in the first wave whose pages use them. `/dev/lineage` goes in wave 5.
- **Wave 5, Deploy and the rest:**
  - Estate Manager, Estate details, Catalog Commander (its own task);
  - Home, About, User Guide, the docs pages, Database Schema, Not Found;
  - sync-domains.

## Wave 6, clean-up

- Remove `components/ui` once no imports remain, along with Tailwind, its config, `tailwindcss-animate`, `tailwind-merge`, the Tailwind layers in `index.css`, the HSL variables, unused Radix packages, the unused legacy shell files (`components/layout/sidebar`, `header`, `navigation`, `stores/layout-store`), the unrouted views (`views/asset-explorer.tsx`, `ontology-home.tsx`, `business-terms.tsx`) and `@dnd-kit` (unused).
- Simplify the CSS layer order to Mantine only.

## Verification

- **Per page:**
  - existing tests pass;
  - a Playwright screenshot of the page with fixture data, taken before and after, attached to the task for the owner;
  - a check that every action and permission-gated control is still present: a scripted list of buttons and menu items per page, before against after.
- **Two personas (my call):** the per-page control check runs as two users, an admin and a read-only consumer without `assets:READ_WRITE`, so controls shown or hidden by permission level are both compared.
- **Ports (my call):** screenshot runs use their own Vite server on port 3200, with the API mocked by fixtures. That leaves 3100 free for the review frontend.
- **Per wave:** the owner reviews the wave on the worktree frontend before it merges. That's localhost:3100, against the worktree backend on 8100, which reads a copy of the dev database (`app_ontos_mantine`); this already exists.
- **End-to-end journeys (my call):** the 18 Playwright user-journey specs in `src/frontend/src/tests/` run against a live backend and write data, so they are not a per-wave gate. They are updated (shadcn selectors removed) and run once against the worktree environment, before wave 6 merges.

## Left to the builder

- **Building blocks:** the internal structure of the Mantine wrappers, and whether a building block becomes a thin wrapper or callers move to Mantine directly. Either way, `components/ui` must be gone by wave 6.
- **Per page:** how its content maps onto panes.
- **Tests:** the per-page screenshot fixtures.

## Calls made without the owner (check these)

1. Wave 0 does the tokens and the shared building blocks first, so the whole app shifts towards the new look before any page work.
2. Building blocks keep their current interfaces in wave 0, so about 270 files change look without edits. Callers move off the wrappers page by page, and the wrappers are deleted in wave 6.
3. Wave 1 covers the five data asset pages listed above (confirmed by the owner).
4. Marketplace and Search join wave 2, because they share Build's list components.
5. The two largest detail pages, the workflow designer and Catalog Commander are each a task of their own within their wave.
6. The owner reviews each wave on the worktree frontend before it merges.
7. The compound Radix primitives stay on Radix, recoloured, in wave 0, and move to Mantine page by page.
8. The control check runs as two personas, admin and read-only consumer.
9. Screenshot runs use port 3200; review stays on 3100/8100.
10. The 18 end-to-end journeys are updated and run once before wave 6, not per wave.
11. The remaining `components/ui` pieces move in the first wave that uses them; `/dev/lineage` goes in wave 5.

## Open questions

None.
