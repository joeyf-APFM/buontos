# Mantine shell, Asset Explorer tree and Ask Helix: design

Date: 2026-11-07. Status: draft for review.

## Why

buontos (a fork of Ontos) is becoming an app customized for APFM. Upstream Ontos frontend changes will no longer be pulled in, so the frontend can be replaced freely. The owner doesn't like the current shadcn/Radix + Tailwind design: too much whitespace and empty space, and a non-organic feel (separate floating cards rather than one connected workspace). They want a dense, data-rich interface in the style of the Databricks workspace, built on **Mantine** (https://mantine.dev), chosen over MUI X.

This document covers the **first phase**: the new app shell, the side menu, the Asset Explorer and Ask Helix. The rest of the frontend moves to Mantine screen by screen in later phases, each with its own design.

## Success for this phase

The **Asset Explorer tree works end to end in Mantine, and Ask Helix answers questions about it**, as the signed-in user, on local dev and on the deployed app.

## Goals

1. **Mantine foundation:** Mantine installed, with a theme built from APFM's Aura tokens, alongside the existing UI so unmigrated screens keep working.
2. **App shell:** a new top bar with Ask Helix, and the new side menu (option B below).
3. **Asset Explorer** (`/assets`) rebuilt in Mantine with a hierarchical tree, a dense table and a details panel.
4. **Ask Helix:** a chat panel backed by Databricks Genie One, answering as the person asking.

## Non-goals (this phase)

- Migrating any other screen. They render inside the new shell as they are.
- Removing Tailwind or shadcn. That happens once the last screen has moved.
- Dark mode. Aura is light-only. Mantine's theming leaves room to add it later.
- Helix changing anything. It only reads and answers.
- Keeping Helix history in buontos.
- Live browsing of Unity Catalog. The tree shows the assets Ontos already holds.

## Anti-goals (a failure even if it works)

- The new screens look like the old ones: wide gutters, floating cards, low density.
- Helix silently answers as someone other than the asking user. It answers as the user, or, only on a deployment set to shared mode (see Ask Helix → Identity), through the one shared Helix identity, and the panel says so.
- Unmigrated screens break or become unusable inside the new shell.

## Constraints

- **Stack:** React 18, Vite, TypeScript, react-router 6, react-i18next. Backend: FastAPI, Python 3.12. TanStack Table logic can be kept under Mantine-styled tables.
- **The dev servers** (ports 8000 and 3000) are the owner's; don't restart them as part of the work. The base branch is `development`. Commits happen only when the owner asks.
- **Tests:** backend changes are test-first, using `hatch -e dev run pytest`. Frontend uses vitest. Existing tests must keep passing.
- **Feature permissions:** menu items stay hidden for users without access to that feature, as today (`config/features.ts`, permission checks).
- **i18n:** new UI strings go through react-i18next like the rest of the app.

## Visual design (decided)

Two mockups were approved:
- `.superpowers/brainstorm/70931-1794067422/content/aura-helix.html` (layout B, in Aura colours, with Helix).
- `.superpowers/brainstorm/70931-1794067422/content/side-menu.html` (option B).

**Colours:** Aura "APFM Web" tokens, as in `~/Projects/apfm-insights/app/globals.css` (`:root` block, around line 644):

| Role | Token | Value |
|---|---|---|
| Brand / headings | aura-navy | #1F3066 |
| Accent | accent / hover / pressed / subtle | #4F6AC5 / #334FA9 / #273D87 / #F1F5FF |
| Canvas | canvas | #FFFDF7 |
| Panels | surface / surface-strong | #FFFFFF / #F3EFE4 |
| Borders | border / subtle / strong | #E2DDCD / #F3EFE4 / #ADA899 |
| Text | primary / body / secondary / muted | #1F3066 / #2C2F34 / #565D65 / #828D96 |
| Status | good / warning / critical / info, each with a -bg and -fg | as in globals.css |
| Chart series | series-1 … series-8, series-other | as in globals.css |

**Type:** display font Optima → Candara → Segoe UI; body font Commissioner → Segoe UI → system-ui.

**Density (layout B):** 12px body text; 24px tree rows; 28px table header and rows; 26–28px controls; 16px page title.

**Shape:** panes share 1px borders instead of floating cards. Corners are 4–8px, not Aura's 24px cards (a call made for density; the owner can override). Shadows only on floating elements (menus, popovers).

**Layout (left to right):**
1. The side-menu icon strip.
2. The group panel, when open.
3. The page's own sidebar: for the Asset Explorer, the tree.
4. The main content: breadcrumb, a one-line page header with type and status badges and a primary action, a filter bar, then the table.
5. The right panel: asset details, or Helix when it's open.

## Side menu (option B, decided)

- **Strip:** a narrow icon strip (about 52px) with one button per group: **Discover, Build, Govern, Deploy**, from `FeatureGroup` in `config/features.ts`.
- **Group panel:** clicking a group opens a panel (about 200px) listing its items. The panel can be pinned open or tucked away; that choice is remembered per browser.
- **Sub-items:** items can have sub-items, which expand in place. The navigation config gains an optional `children` list per item. Each sub-item is a route or a filtered view of its parent page.
- **Item set:** all current menu items are kept and placed in their existing groups.
- **Initial sub-items:** apart from Assets → Explorer, the builder proposes which items get sub-items; the mockup's examples are illustrations only.
- **Hiding:** items and sub-items are hidden for users without access, as today.
- **Selection:** the active item is highlighted (accent-subtle background with a 2px accent bar on the left), and its group button is marked active.

## Asset Explorer

**Sidebar categories:** the existing five stay at the top level, in this order: Data Assets, Analytics, Integration, System, Custom.

**Data Assets tree:** three branches.
- **Unity Catalog:** Databricks Unity Catalog only. Real catalogs → their schemas → type groups (Tables, Views, Volumes, Metric Views) with counts. Nodes are real assets, built from the `hasCatalog`, `hasSchema`, `hasTable`, `hasView` and new `hasVolume` relationships. Columns don't appear in the tree; they belong on a table's details. There's no Datasets group, because no Schema→Dataset relationship exists *(my call)*.
- **Internal** *(owner's definition)*: systems inside the business, such as SQL Servers on the company network and the business's own Snowflake.
- **External** *(owner's definition)*: anything remote that the business ingests, such as API calls, SFTP sources and Snowflake data from outside parties.
- **Non-Databricks catalogs:** the importer stores Snowflake and BigQuery catalogs as the same Catalog type as UC catalogs. They go under Internal or External, not Unity Catalog. Under each branch, the tree groups assets by source system (for example, a SQL Server instance or a Snowflake account), then follows that system's own hierarchy (catalog → schema → table).
- **Snowflake in both:** the owner listed Snowflake as both Internal and External. My reading is that it depends on whose account it is. The business's own Snowflake account is Internal, and Snowflake data shared from or pulled out of another party's account is External *(my call; check this)*.

**Other categories:** they list asset types as today, as one-level trees. Nesting can be added later in the same component.

**Row style:** icon, name, and a count right-aligned. The selected row gets an accent-subtle background with a 2px accent bar. Rows expand and collapse with a chevron.

**Clicking a node:** the table shows the node and everything under it. For example, clicking a schema lists its tables, views and volumes. *(The builder's call, taken from the approved mockup.)*

**Table:** filter box; Type, Status and Concept filters; columns Name (monospace), Type, Owner, Status (coloured dot), Concepts, Updated. Server-side paging, using the existing `/api/assets` paging. `GET /api/assets` gains a parent filter (the node and everything under it) and a concept filter. Owner shows the asset's first business owner, with "+N" when there are more; Concepts come from its semantic links *(my calls)*.

**Details panel:** selecting a table row opens the asset's details in the right panel: type, full name, owner, column count, concepts, domain, updated time and description. Opening Helix replaces it; closing Helix brings it back. An "Open full page" link goes to the existing asset detail page (`asset-detail.tsx`), which stays reachable as it is *(my call)*.

**Route:** the new explorer replaces `/assets` in place *(my call)*.

**New data model pieces:**
- **Volume asset type:** a new class in `src/backend/src/data/taxonomies/ontos-ontology.ttl` with `ontos:modelTier "asset"`, plus a `hasVolume` relationship from Schema. Asset types sync from that file (`sync_asset_types`). The schema importer currently brings in `UC_VOLUME` as a System asset linked by `hasPart`. It changes to create Volume assets linked by `hasVolume`, and a one-time migration converts the existing volume rows, so the Volumes group isn't empty *(my call)*.
- **Branch marker:** each asset outside Unity Catalog gets a marker, Internal or External. Unity Catalog membership follows from the catalog hierarchy and needs no marker. The marker is set automatically where the source makes it clear (an API or SFTP connector is External, a connection to a host on the company network is Internal). Anyone who can edit the asset can override it by hand. Assets with no marker yet appear under an "Unsorted" node at the bottom of Data Assets, so nothing disappears *(my calls)*.
- **Tree counts** respect the same per-user visibility as the asset list, so users never see counts for assets they can't open (the builder's call).

**Tree component:** Mantine's `Tree` with `useTree`, rendering each row with the row style above. Children load when a node is expanded, so large catalogs don't load all at once.

**Tree API:** a new backend endpoint returns one level of children with counts, for example `GET /api/assets/tree?parent=<id|branch>`. Its exact shape is up to the builder.

## Ask Helix

**Entry point:** an "Ask Helix" button in the top bar on every screen, in navy with a small multicolour mark. It opens the Helix panel on the right.

**Panel:**
- **Header:** "Helix · Genie One" and a close button.
- **Context chip:** shows the current selection (an asset's full name, a schema or a concept), and the user can remove it.
- **Messages:** the user's own messages appear in navy bubbles. Helix's answers show the answer text, a collapsible "Show SQL" with the SQL Genie ran, a small results preview when there is one, and an "Open in Databricks" link.
- **Input** at the bottom.

**Conversation:** follow-up questions continue the same Genie One conversation until the user starts a new one. History lasts for the browser session only.

**Context:** the selection is sent to Genie as context ("the user is looking at `insights.referrals.lead_events`"), so questions are about it by default.

**Backend:**
- A new route streams Genie One's answer to the browser, for example `POST /api/helix/ask`, using server-sent events or chunked streaming.
- It calls Databricks `POST /api/2.0/data-rooms/tools/onechat/responses`, which is what `databricks genie ask` (CLI v1.21) uses and which streams server-sent events.
- The conversation id from Genie is returned to the browser so follow-ups continue the same conversation.

**Identity (decided by the owner):** Helix answers as the person asking. If that can't work on the deployed app, Helix uses a single shared point of access instead.
- **User mode (the goal):** on the deployed app, use the `x-forwarded-access-token` request header (the user's token). If it's missing, return a clear error ("Helix needs your Databricks sign-in"). Other routes already follow this pattern, for example `routes/assets_routes.py` around line 578.
- **Shared mode (the owner's fallback):** if the spike shows Genie One can't run with the user's token, Helix calls Genie One through one shared identity: a dedicated service principal for Helix, whose data access the owner grants and controls. Using a dedicated principal instead of the app's own one is *my call*.
- **Choosing the mode:** a deployment setting, `HELIX_IDENTITY_MODE` = `user` or `shared`. Helix never switches modes on its own for a single request: in user mode, a missing token is still an error *(my call)*.
- **Showing the mode:** in shared mode, the panel header says "Answering as APFM Helix, not as you", so users know the answers reflect the shared identity's access *(my call)*.
- **Local dev:** use the developer's own Databricks CLI profile, `DATABRICKS_CONFIG_PROFILE` in `src/backend/.env`.

**Feature switch:** `HELIX_ENABLED` in settings, separate from `LLM_ENABLED`. When it's off, the button is hidden.

**Risk to settle first:** Databricks Apps pass the user's token only with the scopes listed in `src/manifest.yaml` `user_api_scopes`, which already include `dashboards.genie` and `sql`. Whether the onechat endpoint accepts those scopes is unknown. The first task is a spike against the deployed app to find the required scope, which also checks that streamed answers get through the Apps proxy. Changing the scopes needs the owner's confirmation, because it changes what users are asked to consent to on the production app. If no scope works, the deployment uses shared mode.

**Safety:**
- Helix sends no Ontos data to Genie beyond the context chip's text.
- Answers are rendered as markdown with no raw HTML.
- Links are only to the workspace host.

## Mantine foundation

**Packages:** `@mantine/core`, `@mantine/hooks`, and `@mantine/charts` when a charted screen moves. Mantine's PostCSS preset, as its install guide describes.

**Theme:** one theme module mapping the Aura tokens to Mantine's colours, fonts, radius, spacing and sizes, with defaults set for the density targets above.

**Coexistence with Tailwind:** Mantine's styles and Tailwind's base styles must not override each other. Use CSS layers or an equivalent so unmigrated screens look unchanged.

**Where code goes:** new components under `src/frontend/src/mantine/` or similar, so later phases can delete the old `components/ui` cleanly. The exact layout is up to the builder.

## Left to the builder

- Package layout, file names, and the tree and Helix API shapes.
- Which menu items get sub-items, beyond Assets → Explorer.
- Streaming transport (SSE or fetch streaming).
- Icon choice: lucide-react is already in use and works with Mantine.
- How the Tailwind/Mantine style layering is done.
- Test strategy for the frontend, within vitest.

## Calls made without the owner (check these)

1. Corners kept at 4–8px instead of Aura's 24px, for density.
2. Unity Catalog tree nodes are real catalogs and schemas, with type groups below each schema; columns are not in the tree.
3. Clicking a node shows it and everything beneath it.
4. Helix replaces the details panel while it's open.
5. Helix history is per browser session; nothing is stored in buontos.
6. `HELIX_ENABLED` is a separate switch from `LLM_ENABLED`.
7. Snowflake's branch depends on whose account it is: the business's own is Internal, and another party's is External.
8. Non-UC sources are grouped by source system under Internal and External.
9. The Internal/External marker is set automatically from the source where possible, can be overridden by hand, and unmarked assets go under "Unsorted".
10. Volumes: the importer changes and existing volume rows are migrated now.
11. No Datasets group under schemas.
12. Owner = first business owner (+N); `/api/assets` gains parent and concept filters.
13. `/assets` is replaced in place; the old asset detail page stays, linked from the details panel.
14. Helix's shared mode uses a dedicated service principal, is a per-deployment setting with no automatic switching, and is labelled in the panel.

## Open questions

None.
