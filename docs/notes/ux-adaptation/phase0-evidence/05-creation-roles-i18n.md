# Phase 0 §0.5 findings: creation flows, roles/personas, nav/home, My Products, i18n

Repo `/Users/joey.filichia/Projects/nucleus`, branch `development`, HEAD `277a5595`. Read-only research.
Paths below are relative to `src/frontend/src` (FE) or `src/backend/src` (BE) unless absolute.
Labels: `[FORK ✔]` verified by file:line or a command result; `[UNVERIFIED]` inferred.
Live ground truth: GET calls against the dev backend (ENV=LOCAL, user = local admin, `MOCK_USER_GROUPS=["admins","local-admins","developers","DataServicesAdmins"]`).

## Summary (most decision-relevant answers)

1. **BRIEF CONTRADICTED (A13): the 5-step contract wizard is dead code.** `components/data-contracts/data-contract-wizard-dialog.tsx` (2,101 lines) is imported by nothing except its own test. [FORK ✔] (`grep -rnI "data-contract-wizard-dialog" .` returns only `data-contract-wizard-dialog.test.tsx:8`). Contract creation today is `DataContractBasicFormDialog` (`views/data-contracts.tsx:802`), a single Mantine form (name, version, status, owner team, project, domains, tenant, purpose/usage/limitations, tags). Plan §3.2's "wizard step 1 requires name, version, status ... keep draft-save" describes an unreachable component.
2. **Why the form-field grep found nothing:** the fork's product dialog is Mantine (`TextInput`, `Select`, `Textarea`, `Input.Wrapper`) with react-hook-form `register()` plus a zod schema factory, inside the `@/mantine/page` `Dialog` (`data-product-create-dialog.tsx:4-18`). There is no shadcn `FormField`/`Label` markup. The contract basic dialog is also Mantine. Only the orphaned wizard uses shadcn `Label`/`Input`.
3. **Plan §3.2 defaults are wrong for the fork:** version defaults to `0.0.1`, not `1.0.0`. Status is already `draft`. Tenant is already optional. The only required field is `name`; version and status are "required" but prefilled. Owner team and domain are optional today, so "domain and owner team are the only required choices" needs new validation. Prefill/hide work is mostly UI re-layout ("Advanced" collapse + change `0.0.1` to `1.0.0`).
4. **BRIEF CONFIRMED: `hidden_nav_features` does not exist.** Zero hits across all of `/Users/joey.filichia/Projects/nucleus` (`hidden_nav|hiddenNav|hidden-nav`, excluding node_modules/.git), covering backend, frontend, alembic and locales. `GET /api/user/navigation` returns 404 live. Per-role nav is permission-only.
5. **Persona/role switching exists, with two distinct mechanisms.** (a) "Apply role override" in the user menu (`components/ui/user-info.tsx:361-390`, `POST /api/user/role-override`), available to admins and local dev, switching to any role live. This works today with no setup. (b) The test-persona picker (`GET /api/test/personas`, `X-Test-*` headers) is DISABLED in the dev container: live returns 404 "Test mode not enabled" because `TEST_USER_TOKEN` is unset. `MOCK_USER_GROUPS` is read from env at startup (`common/authorization.py:290`), so changing it needs a backend restart.
6. **NEW BUG/RISK (high impact on §1.2): three nav items are hidden for every role, Admin included.** `nav-config.ts` uses permission ids `search` (l.163), `my-products` (l.228) and `my-requests` (l.231). None of them is a backend feature id: `/api/user/actual-permissions` (live) has 47 keys and none of these. `hasPermission` returns NONE for an unknown id (`stores/permissions-store.ts:40`), so `visibleNav` drops the items. [FORK ✔ code and live API; not checked in a browser.]
7. **Consumer sidebar today (derived): 4 top-level items.** Discover: Marketplace, Data Catalog. Build: Data Contracts (Explorer), Products (All products). Count excludes the three hidden-for-all items in #6. If #6 is fixed, a consumer gets 7 top-level items (adds Search, My products, My Requests), so the "≤ 5" acceptance needs the hiding mechanism, not just seeding. The live Data Consumer role has no `semantic-models` and no `assets`, so no Concepts/glossary item at all.
8. **BRIEF PARTLY CONTRADICTED: `my-products` is a consumer's subscribed products.** `views/my-products.tsx:51` calls `GET /api/data-products/my-subscriptions`. It does NOT list the producer's own products. `my-requests` already has a "Subscriptions" tab that calls the same endpoint (`views/my-requests.tsx:138`), so My Products duplicates it. `my-products` belongs in the consumer set (or merges into My Requests); it is wrong as a producer-only item. "Subscribe" means a notification subscription + agreement, not an access grant (see §4).
9. **Home: `home_sections` only controls DATA_CURATION and DISCOVERY, and its order is not configurable.** REQUIRED_ACTIONS is rendered as `null` in the loop (`views/home.tsx:137`), and the My Actions card (Approvals + Quick Actions), Overview tiles and Recent Activity render for everyone with any access, regardless of role. Order comes from a hard-coded array (`home.tsx:55`) except when a role override is applied. §1.3 "search + discovery + pending actions, nothing else" requires editing `home.tsx`, not just role data.
10. **i18n: the brief's premise is half true.** The YAML comment (`default_workflows.yaml:1090-1100`) says seed strings are not translated. In the fork, a reverse-lookup layer (`lib/workflow-default-texts.ts`, `workflowDefaults.json`, 71 strings, 8 locales, parity-tested) translates seed text at display time when it equals the shipped English string exactly. Covered: wizard `user_action` titles/descriptions/field labels, workflow names, step names. NOT covered: the subscription workflow's Terms of Service step, acknowledgement checklist labels, and body markdown ("Terms of Service", "I accept the Terms of Service", ...), so those stay English in other locales.
11. **Vocabulary table (§1.4) partly mismatches reality.** The new shell labels come from `shell.json`, not `navigation.json`/`features.json`. Several "Today" values differ (see §6 table). `data-products:createDialog.createTitle` literally reads "Create Data Product (ODPS v1.0.0)".

---

## 1. A13: creation flows

### 1a. Data product create dialog
Question: actual fields, required, defaults.
File: `components/data-products/data-product-create-dialog.tsx` (611 lines). Mounted from `views/data-products.tsx:1027` (create) and `views/data-product-details.tsx:2160` (edit mode via `mode='edit'`).

Library: Mantine `TextInput`, `Select`, `Textarea`, `Input.Wrapper`, `Loader` (l.7), kit `Dialog` from `@/mantine/page` (l.10), react-hook-form + zod (l.4-6). [FORK ✔]

Fields (single page, no steps) and requirement:
| Field | Control | Line | Required by schema | Default |
|---|---|---|---|---|
| name | TextInput `withAsterisk` | 392-401 | yes (`min(1)`, l.33) | `''` |
| version | TextInput `withAsterisk` | 404-412 | yes (`min(1)`, l.34) | **`'0.0.1'`** (l.91, l.140) |
| status | Select `withAsterisk` | 414-427 | yes (`min(1)`, l.35) | `DataProductStatus.DRAFT` (l.92); disabled in edit mode (l.422) |
| productType | Select (source, source-aligned, aggregate, consumer-aligned, sink) | 432-443 | no | undefined |
| ownerTeamId | Select from `useTeams()` | 445-459 | no | `''` |
| projectId | Select (incl. "None") | 463-475 | no | current project (`currentProject?.id`, l.144) |
| domain_ids / primary_domain_id | `DomainMultiSelector` | 479-493 | no | `[]` / null |
| tenant | TextInput | 495-501 | no | `''` |
| purpose, limitations, usage | 3 Textareas under "Description (ODPS Structured)" | 508-539 | no | `''` |
| tags | `TagSelector` (create allowed) | 551-562 | no | `[]` |
| consumer_principals | `ConsumerGroupsPicker` | 578-587 | no | `[]` |

Create payload (l.258-295): `apiVersion 'v1.0.0'`, `kind 'DataProduct'`, empty `inputPorts/outputPorts/managementPorts/support/authoritativeDefinitions`, `customProperties` carries `productType`. `POST /api/data-products` (l.297). Backend requires write permission (`routes/data_product_routes.py:1786`) and `DataProduct.status` (required, `models/data_products.py:376`); `id` is generated server-side. No "draft save" concept: a product is created directly with `status=draft`. A discard-confirm guards unsaved edits (l.162-174).

Impact on the plan: Plan §3.2 "prefill version=1.0.0, status=draft" - status already draft; version must be changed from 0.0.1 (a behavioural change, also affects `data-contract-basic-form-dialog.tsx:63`). Hiding tenant/version/status/productType/project/consumer groups under a collapsed "Advanced" is a layout change within this one file. "Domain and owner team required" is NEW validation (both optional today). The dialog title string carries "ODPS v1.0.0" (`createDialog.createTitle`), a banned term for non-technical users. Existing restyle tests for this dialog should be checked before editing (not read).

### 1b. Contract creation: what is actually used
- Used: `components/data-contracts/data-contract-basic-form-dialog.tsx`, opened from `views/data-contracts.tsx:802-806` (`onSubmit={createContract}`, `POST /api/data-contracts`, l.207-215). The nav item "New contract" opens it via `/data-contracts?new=1` (`mantine/shell/nav-config.ts:219`).
  Fields: name (`withAsterisk`, l.287; only validated field, `handleSubmit` l.190), version (default `'0.0.1'`, l.63), status (default `'draft'`, l.64), owner team (`/api/teams/summary`, l.88), project, domains, tenant, purpose/usage/limitations, tags. Payload `kind: 'DataContract'`, `apiVersion: 'v3.1.0'` (l.215-217). No schema step.
- Dead: `data-contract-wizard-dialog.tsx` (5 steps; `totalSteps = 5`, l.100). Not imported anywhere except its test. [FORK ✔]
  - Step 1 Fundamentals (l.605-745): name*, version* (default `'1.0.0'`, l.106/l.237), status* (default draft, select from `['draft','active','deprecated','archived']`, l.24), owner, domains, tenant, data product, usage/purpose/limitations, contract-level concepts. Required (validated in `handleNext` l.353-366): name, version, status only.
  - Step 2 Schema (l.746+): "Infer from Asset" button opens `InferFromAssetDialog` (l.2095) or "Add Schema Object". Logical name* per object.
  - Step 3 Quality rules (l.1312+), Step 4 Team & access (l.1562+: consumers, SMEs, read/write groups, support email; classification/PII checkboxes), Step 5 SLA & infrastructure/servers (l.1719+).
  - Draft save: `handleSaveDraft` (l.460-546) validates name/version/status, forces `status: 'draft'` (l.488), and calls the parent's `onSubmit(payload)`. The wizard itself does no HTTP.
- "Infer schema" reads from the **asset inventory, not Unity Catalog pickers**: `InferFromAssetDialog` uses `AssetSelector` (`/api/assets`, `/api/asset-types`, `components/common/asset-selector.tsx:220-265`) then `GET /api/assets/{id}/infer-schema` (`infer-from-asset-dialog.tsx:47`, BE `routes/assets_routes.py:524`). The UC-browsing variant is `InferFromCatalogDialog`, which uses `/api/connections` and `/api/schema-import/metadata/{connectionId}?path=` (`infer-from-catalog-dialog.tsx:53,89`). Both are mounted only in `views/data-contract-details.tsx:2855-2866` (buttons at l.2211, 2263), i.e. AFTER a contract exists. `UCAssetLookupDialog` (`/api/catalogs`, `/api/catalogs/{c}/schemas`, ... `/columns`) is used by concept/property search, not by contract creation.

Impact on the plan: (i) Plan §3.2 must target `DataContractBasicFormDialog` (+ product dialog); retire the wizard from the plan or decide to revive/delete it. (ii) Plan §3.3 "Start from a table": the contract-wizard "infer schema" capability is not reachable at creation time; use `GET /api/assets/{id}/infer-schema` (needs the table to be an inventoried asset) or `InferFromCatalogDialog`'s `/api/schema-import/metadata/...` flow (needs a connection + path). Plain catalog/schema/table browsing exists in `UCAssetLookupDialog` + `/api/catalogs/...`. Decide which one. (iii) The reuse-map entry in `01` ("contract wizard 'infer schema' step") is wrong for the fork.

## 2. Roles and persona switching

Q: Is there a persona/role switcher a tester can use?
A: Yes, three ways; only the first works now with no setup.

1. **Role override in the user menu.** `components/ui/user-info.tsx:216` `canSwitchRoles = isLocalDev || isAdminActual || myRoles.length >= 2`; menu block l.361-390 lists all roles minus the actual one (admin/local dev see every role, l.245). Selecting calls `POST /api/user/role-override {role_id}` (BE `routes/user_routes.py:194`; admins can override to any role, non-admins only to roles whose groups they belong to; clearing always allowed). `GET /api/user/role-override` live returns `{"role_id":null}`. The FE permission store then reads the override role's `feature_permissions` (`stores/permissions-store.ts:35-37`) and the home page reads its `home_sections` in stored order (`views/home.tsx:46-49`). This gives a faithful view-as-role for sidebar, home and permission-gated buttons. It does not change the identity or groups; backend routes also honour the override via `get_applied_role_override_for_user` (`user_routes.py:135-139`).
2. **Test-persona picker** (`stores/test-persona-store.ts`, user-info.tsx:293-337): lists personas from `GET /api/test/personas` (`routes/test_personas_routes.py`, data `data/test_personas.yaml`: admin, governance (DGO), steward, producer, consumer, security, anon) and injects `X-Test-Token/-Email/-Groups` headers. Needs backend `TEST_USER_TOKEN` and FE `VITE_TEST_USER_TOKEN` or `localStorage['ucapp.testToken']`. Live: `GET /api/test/personas` returns 404 "Test mode not enabled", so it is not available in the dev container. Do not enable it in production (`config.py:302-311` warns).
3. **`MOCK_USER_GROUPS`** (env var, JSON array or CSV) with `ENV=LOCAL` or `MOCK_USER_DETAILS` (`common/authorization.py:282-309`) sets the dev user's groups. Needs a backend restart (forbidden for this phase); the groups for the consumer persona are `data-consumers`, producer `data-producers`, steward `data-stewards`, DGO `data-governance-officers`, security `security-officers` (`data/settings.yaml`). Admin = `DataServicesAdmins`/`NucleusOntosReviewers` in the live DB.

What a role contains today (live `GET /api/settings/roles`, keys): `id, name, description, assigned_groups, assigned_users, feature_permissions, home_sections, approval_privileges, deployment_policy, is_admin, can_adopt_entity_ids, requestable_by_roles, approver_roles`. Model: `models/settings.py:75-100`. No nav-hiding field. Approval privileges enum: DOMAINS, CONTRACTS, PRODUCTS, BUSINESS_TERMS, ASSET_REVIEWS (`models/settings.py:32-37`). Role form tabs: general, privileges (home sections checkboxes + approval privileges), permissions, deployment, access-control (`components/settings/role-form-dialog.tsx:384-388`; home sections are plain checkboxes, l.468-480, so no order).

Live role contents (non-admin; `GET /api/settings/roles`):
- Data Consumer: home `[DISCOVERY]`; perms (non-None): access-grants R, catalog-commander R, comments RW, data-catalog R, data-contracts R, data-domains R, data-products R, process-workflows R, projects R, teams R. No `semantic-models`, `assets`, `my-*`, `search`.
- Data Producer: home `[DATA_CURATION, DISCOVERY]`; data-products RW, data-contracts RW, access-grants RW, teams RW, projects RW, plus the read-only set; no `assets`, no `semantic-models`.
- Data Steward / DGO / Security Officer: home `[REQUIRED_ACTIONS, DISCOVERY]`; DGO has approvals for all five entities, steward for CONTRACTS/PRODUCTS/ASSET_REVIEWS.

`hidden_nav_features`: absent everywhere. [FORK ✔] `grep -rniI "hidden_nav|hiddenNav|hidden-nav"` over the repo (excluding node_modules/.git/.venv/dist) returns nothing; `GET /api/user/navigation` -> 404. Matches brief (A2). `home_sections` order: not configurable (see §3).

Drift worth knowing: `data/settings.yaml` seeds roles only when the DB has no roles (`controller/settings_manager.py:~620-700`), and prefers the YAML over the in-code `DEFAULT_ROLE_PERMISSIONS`. The YAML uses feature ids `business-glossary` and `datasets` that do not exist in `common/features.py` (so they are skipped), and omits `semantic-models`, which the in-code defaults grant (Consumer R, Producer R, Steward RW, DGO Admin). That is why the live Consumer has no Concepts/glossary. Also: `settings:personaNav.*` keys exist in the en locale ("My Subscriptions", "Access Requests", ...) but are referenced by no TS/TSX [FORK ✔ grep], a vestige.

Impact on the plan: §1.1 must be a real port (no mechanism present). §1.2 acceptance "use the role/persona switcher found in Phase 0": use the user-menu Role override (as the local admin). §1.2 cannot be met by seeding alone because of the unknown-permission-id issue (summary #6) and the settings gate (§3). To give consumers a glossary the Consumer role needs `semantic-models: Read-only` (update YAML; existing DBs need a settings change since seeding only runs on an empty DB). `[UNVERIFIED]` whether edits to settings.yaml reach the existing dev/prod DB (they do not by code reading above).

## 3. Navigation and home

### 3a. New shell sidebar (the live one)
Files: `mantine/shell/nav-config.ts`, `use-shell-nav.ts`. The old `components/layout/navigation.tsx` + `sidebar.tsx` are dead: `layout/layout.tsx` imports `AppShell` (l.5) and nothing imports `Sidebar`/`Navigation` (the only importer of `./navigation` is the unused `sidebar.tsx`). [FORK ✔]

Filtering: `visibleNav(has, showMaturity)` (nav-config.ts:352-368): an item shows when `has(item.permissionId, item.level ?? READ_ONLY)` AND `showMaturity(maturityOf(item.id))`; settings-area groups (Organization, Semantics, Workflows, Settings) are dropped unless the user has `settings` READ_ONLY, except `ungated` sections (Govern, Deploy). Maturity gate = `useFeatureVisibilityStore.allowedMaturities` (beta on by default, alpha off, `stores/feature-visibility-store.ts:17-18`; only admins see the alpha toggle). So it is permission + maturity only; no persona/role nav config.

Feature maturities (`config/features.ts`, 17 features): ga: marketplace, search, data-catalog, assets, concepts, data-contracts, data-products, my-products, my-requests; beta: compliance, master-data, data-asset-reviews; alpha: security-features, entitlements, entitlements-sync, estate-manager, catalog-commander. [FORK ✔] (A1 confirmed).

Consumer sidebar count (derived by applying `visibleNav` to the live Data Consumer permissions; not rendered in a browser): 
- Discover: Marketplace (perm `data-products` R), Data Catalog (`data-catalog` R). `search` hidden (unknown perm id).
- Build: Data Contracts with child Explorer (`new-contract` needs RW, hidden); Products with child All products (`my-products` hidden: unknown perm id). Assets hidden (`assets` None), Concepts hidden (`semantic-models` None), My Requests hidden (unknown perm id).
- Organization/Semantics/Workflows/Settings: hidden (no `settings` permission; Govern/Deploy items: compliance, master-data, reviews, security, entitlements, estate-manager are None; catalog-commander has R but is alpha, hidden).
Result: **4 top-level items (6 counting children).** With the unknown-id bug fixed it would be 7 top-level.

Unknown-id bug detail: `nav-config.ts:163/228/231` use `permissionId: 'search' | 'my-products' | 'my-requests'`; `config/features.ts` has no `permissionId` for those three (only marketplace->data-products l.48 and concepts->semantic-models l.90 map). `common/features.py` has none of them (`grep` shows only `routes/access_grants_routes.py:245` "/my-requests" as a URL). The same applies to Home quick actions (`components/home/quick-actions.tsx:33` uses feature `search`). The routes themselves exist (`app.tsx:189-191`) and `GET /api/access-grants/my-requests` is gated on `access-grants` (`access_grants_routes.py:~253`), which the Consumer has.

`[UNVERIFIED]` visually: please confirm in the running UI (admin) that Search, My products and My Requests are absent from the sidebar; if they appear, there is a permission-id mapping I did not find.

### 3b. Home
`views/home.tsx`:
- Always rendered for anyone with any non-None permission (l.67): logo + title ("Welcome to {{appName}}") + tagline + SearchBar (l.80; the bar fetches `/api/search?search_term=` and navigates to `result.link` (`components/ui/search-bar.tsx:60,133`), it does NOT go to a results page or `/marketplace?q=`), an **Overview** grid of tiles (l.88-103), a **My Actions** card with Approvals (`RequiredActionsSection`, `/api/approvals/queue`) and Quick Actions (l.106-133), role sections (l.136-143), and Recent Activity (l.146).
- `home_sections` handling: with an applied override, the role's list in stored order (l.46-49); otherwise the union across the user's matched roles, re-sorted into a fixed `[REQUIRED_ACTIONS, DATA_CURATION, DISCOVERY]` order (l.55-57), default `[DISCOVERY]`. REQUIRED_ACTIONS is rendered as `null` in the loop (l.137) because the My Actions card is always shown. So only DATA_CURATION and DISCOVERY are controlled by role.
- Overview tiles (`tiles/index.ts`): semantic-models (needs `semantic-models` R, `/api/semantic-models/stats`, "Concepts: Business terms and definitions"), data-products (needs `data-products` R; `/api/data-products`; "Total data products" with a status breakdown), data-contracts (`/api/data-contracts`; "Active contracts" with draft/active/deprecated/retired), compliance (`/api/compliance/trend`; "Current compliance score"). A Consumer sees Data Products and Data Contracts tiles: totals/status breakdown across ALL products/contracts, not consumer-actionable. The `home:overview.tiles.estates` strings exist in en but no estates tile is registered.
- Quick actions: built from features + permissions + maturity (`quick-actions.tsx:29-52`); Consumer gets marketplace, data-catalog, data-products browse (search is hidden by the unknown-id bug).
- DiscoverySection: published products (`/api/data-products/published`, l.59) plus "My subscriptions" (`/api/data-products/my-subscriptions`, l.78), domain filter.

Impact on the plan: §1.3 needs `home.tsx` edits (hide Overview, My Actions' Quick Actions and Recent Activity for the consumer, make order data-driven) - role data alone cannot do it. The hero search must be rewired (it currently opens a search hit directly); marketplace has no `q` param yet `[UNVERIFIED]` (not read in this pass). §1.2 table row "Data Consumer: marketplace, search, my-requests, glossary" needs (1) the permission-id fix, (2) `semantic-models` R on the role, (3) hiding Data Catalog/Data Contracts/Products, which a permission-only filter cannot do without removing the read permission (and consumers need `data-products` R for the marketplace, since marketplace uses that id), hence the need for a nav-hiding layer (D1).

## 4. My Products / My Requests

- `views/my-products.tsx`: shows the **current user's subscribed products**: `GET /api/data-products/my-subscriptions` (l.51), BE `routes/data_product_routes.py:1552-1569` (`manager.get_user_subscriptions(subscriber_email=current_user.username)`). Not products the user owns. Page text: `features.json` description "View and manage your subscribed data products" (`config/features.ts:117`); also has a domain browser (pills/graph) and search. It opens `/my-products/:id` (`DataProductDetails`). The same route is used by marketplace cards (`components/home/marketplace-view.tsx:474,772`).
- `views/my-requests.tsx`: two tabs. "Access requests" = `GET /api/access-grants/my-requests` (l.103; BE `access_grants_routes.py:244-263`, all statuses pending/approved/denied/cancelled/expired, `AccessGrantRequestStatus` in `models/access_grants.py:15-21`), with Cancel for pending (`DELETE /api/access-grants/requests/{id}`, l.157). "Subscriptions" tab = the same `/my-subscriptions` call (l.138). It does not show workflow/approval-wizard sessions or "request review/publish" requests; only access-grant requests.
- "Subscribe" semantics: the product page's Subscribe runs the `for_subscribe` approval workflow then `completion_action=subscribe` (`views/data-product-details.tsx:814-830`, `:2221`; `components/home/marketplace-view.tsx:422-424,791`), producing a notification subscription (`data-products:details.subscription.subscribeMessage` = "You will receive updates for this data product"). Access is separate (access grants). So §1.4's "Subscribe -> Request access" rename would mislabel; `[UNVERIFIED]` whether subscribe also triggers a grant downstream (`on_subscribe` trigger exists, `controller/data_products_manager.py:4153`, not read).

Impact on the plan: `my-products` goes in the consumer set (it is a consumer concept); consider folding it into My Requests (duplicate Subscriptions tab) so the consumer nav stays ≤ 5. A producer's own products are the regular Products list filtered by ownership (not a separate item today). Plan §1.2's `[UNVERIFIED]` is resolved: consumer column.

## 5. i18n: seed workflows vs `workflowDefaults.json`

- Which is true: both, partly. The YAML comment (`data/default_workflows.yaml:1090-1100`) says the seed strings are NOT loaded through i18n bundles and are meant to be customised. The fork added a display-time reverse lookup: `lib/workflow-default-texts.ts` finds an English text in the `en` `workflowDefaults` bundle by exact (trimmed) match and renders `t('workflowDefaults:<key>')`; edited texts display as written. Used by `components/workflows/approval-wizard-dialog.tsx:324` (`defaultText(...)` at l.862, 883, 931, 966, 970, 989, 1003, 1028, 1045), `workflow-execution-dialog.tsx`, `workflow-run-dialog.tsx`, `workflow-approval-response-dialog.tsx`, `self-service-dialog.tsx`, `views/workflows.tsx`. [FORK ✔]
- `en/workflowDefaults.json` has 71 strings under `approvalResponse, subscription, requestReview, requestAccess, requestPublish, requestStatusChange, stepNames, failMessages, workflowNames`. Parity-tested (`i18n/locale-key-parity.test.ts:11`).
- What is covered (checked by matching YAML strings): `subscription.user_action` step ("Subscription Details", "Reason for subscribing", "Intended use case") exists in `pt` as "Detalhes da assinatura" etc. Wizard step names and workflow names are covered.
- What is NOT covered (no match in en bundle, scripted check): subscription workflow's `legal_document` title "Terms of Service" (yaml:1116), its description (1117), `body_markdown` and `acknowledgement_label`, the checklist title "Acknowledgements" (1128), "Please confirm each item below." (1129) and the three item labels (1132-1138). The wizard only wraps step names, titles, step `config.description` and field labels in `defaultText`; checklist item labels and legal body are not translated. Rough scale: of 144 name/title/description/label/body string literals in the YAML from line 700 on, 46 match the bundle exactly and 98 do not (many are notification/internal step names, not user-facing wizard text).
- Locales present: `de en es fr it ja nl pt` (8) [FORK ✔ `ls src/frontend/src/i18n/locales`]; en has 45 namespace files.
- Parity test (`locale-key-parity.test.ts:11`): `data-contracts, data-products, workflows, data-domains, database-schema, workflowDefaults` (6 namespaces). `features, navigation, shell, home, common` are NOT parity-tested, so §1.4 value edits to those are not guarded; keys must be kept in sync by hand across 8 locales (no pluralisation-only `_zero/_two/_few/_many` comparison).

Impact on the plan: D5(a)/§2 access-request Terms: translating a new `body_source: contract_terms` is moot (contract text is user content), but the static fallback and acknowledgement labels will not translate unless added to `workflowDefaults.json` AND the wizard wraps them with `defaultText`. Adding the legal/checklist strings to the bundle needs wizard changes, not just JSON.

## 6. Vocabulary table (03 §1.4): actual strings and keys (en)

Nav labels in the live shell come from `shell.json` (`shell:items.*`, `shell:sections.*`), group names from `navigation:groups.*` (Discover/Build/Govern/Deploy) and `features:*` only for a few items.

| Concept | Plan "Today" | Actual en value and key |
|---|---|---|
| Concepts (nav) | Concepts | `features:concepts.name`="Concepts"; the shell Build item uses `features:concepts.name` (nav-config.ts:180); children: `shell:items.conceptBrowser`="Explore", `conceptSearch`="Search", `conceptHierarchy`="Hierarchy Browser", `conceptEnrich`="Enrich", `conceptMapping`="Term Mapping", `conceptCollections`="Collections"; page title `concepts:title`="Concepts"; `features:semantic-models.name`="Concept Browser" |
| Assets (nav) | Assets | `shell:items.assets`="Assets" (+ `assets:title`) |
| Contracts (nav) | Contracts | shell: `shell:items.dataContracts`="Data Contracts" (already "Data Contracts"); `features:data-contracts.name`="Contracts"; `data-contracts:title`="Data Contracts" |
| Contract section on a product page | output contract / ODCS terms | Product page section label is `data-products:details.sections.contracts` / `details.contracts.title`="Data Contracts"; no "output contract" string. ODCS appears in contract pages (`data-contracts:detailsView.header.exportOdcs`, `detailsView.stableIdTitle`="ODCS StableId", `detailsView.teamMetadata.title`="ODCS Team Metadata", `detailsView.authDefs.subtitle`) |
| Deliverable(s) | Deliverables | `data-products:details.deliverables.titleWithCount`="Deliverables ({{count}})", `.addDeliverable`, `.noDeliverables`, `.subtitle`; 66 occurrences total (see counts) |
| Consumable(s) | Consumables | `data-products:details.consumables.titleWithCount`="Consumables ({{count}})", `.addConsumable`; also `inputPortForm.addTitle`="Add Consumable"; 26 occurrences |
| Delivery method | Delivery Methods | `shell:items.deliveryMethods`="Delivery methods"; `delivery-methods:title`="Delivery Methods"; field `data-products:outputPortForm.labels.deliveryMethod`="Delivery Method" |
| Subscribe | Subscribe | `data-products:details.subscribe`="Subscribe" (also `home:discoverySection.subscribe`, `metadata:info.subscribe`); semantics = notifications (see §4) |
| Status | draft / active | `data-products:status.draft`="Draft", `.active`="Active", `.published`="Published" (key exists); contracts same set; dialogs show the status select values |
| Physical name | fully qualified name | `data-contracts:schema.fields.physicalName`/`property.fields.physicalName`="Physical Name"; wizard "Physical Name (Optional)"; "Asset FQN" (`data-asset-reviews:details.columnAssetFqn`, `editor.fqnLabel`="FQN:") |
| Compliance (nav) | Compliance | `features:compliance.name`="Compliance" |
| Asset Reviews (nav) | Asset Reviews | `features:data-asset-reviews.name`="Asset Reviews"; `data-asset-reviews:title`="Data Asset Reviews" |
| Tenant field | Tenant | `data-products:details.coreMetadata.tenant`="Tenant", `data-contracts:form.tenant`="Tenant"; the product create dialog uses `data-products:createDialog.tenantLabel` |

Banned terms in `en` locale values (case-insensitive for words; `ODCS|ODPS|FQN|DSL` case-sensitive, whole word; script over all 45 files, 8,677 string leaves). Totals: Estate 44, ODCS 34, ODPS 29, Deliverable 66, Consumable 26, Entitlement 19, FQN 5, DSL 4, Catalog Commander 5.
Per namespace file (total; term counts):
- data-products 101 (ODPS 27, ODCS 2, Deliverable 46, Consumable 26)
- data-contracts 52 (ODCS 31, ODPS 2, Deliverable 18, Catalog Commander 1)
- estates 37 (Estate 37); entitlements 13 (Entitlement 13)
- features 5 (Estate 1, Catalog Commander 1, Entitlement 3); settings 5 (Catalog Commander 1, Estate 2, Entitlement 2)
- home 4 (Estate 2 [unused estates tile], Entitlement 1, Catalog Commander 1 [quick-action labels]); workflows 3 (DSL 3)
- catalog-commander 2; common 2 (Estate 1, ODCS 1: `placeholders.pasteODCSJSON`); data-asset-reviews 2 (FQN 2); delivery-methods 2 (Deliverable 2); term-mapping 2 (FQN 2); compliance 1 (DSL); mdm 1 (FQN)

Where they appear on screens a Data Consumer can reach (consumer has data-products/data-contracts/data-catalog/access-grants read, marketplace, product page, contract page, My Requests; no concepts today):
- Marketplace (`components/home/marketplace-view.tsx`, namespaces home/metadata/common): no banned terms in keys it uses (home: only quick-action/tiles strings flagged, see below).
- Product page (`views/data-product-details.tsx`, 47 deliverable/consumable references in code): "Deliverables ({{count}})", "Consumables ({{count}})", "Add Deliverable", "Delete deliverable", "No deliverables defined.", "No consumables defined", "Export ODPS" (`details.actions.exportODPS`), "ODPS Team Metadata ({{count}} members)" (`details.teamMetadata.titleWithCount`), plus ODPS lifecycle text in status transition dialogs. Add/edit/delete strings only show to writers; section titles, "Export ODPS" and team metadata show to readers.
- Contract page (reachable via product page links): "Export ODCS", "ODCS StableId", "ODCS Team Metadata", "ODCS authoritative sources ...", "Open {{name}} in Catalog Commander", "Deliverable: ..." linked-products lines, "Contract successfully linked to product deliverable".
- Home (consumer): quick actions are permission-filtered, so "Catalog Commander" and "Entitlements" are shown to the consumer only for catalog-commander, which is alpha and hidden by default; Estates tile string is dead.
- My Requests: no banned terms in the keys read (`data-asset-reviews:myRequests.*`); [UNVERIFIED] the entity-type labels it shows come from other keys.
- Glossary/concepts: the consumer has no access today; concept pages not scanned.
- Access/subscribe wizard (`workflows`): no banned term in the subscription seed text ("Terms of Service", "Data Product Terms of Service" body); `workflows:designer.*dsl*` strings are designer-only (admins).

## 7. Plan impacts (decisions needed)

1. Retarget §3.2 from the orphaned wizard to `DataContractBasicFormDialog` + `DataProductCreateDialog`; decide whether to delete the wizard (2,101 lines, 80+ i18n keys) or leave it. Mismatched default (`0.0.1` vs `1.0.0`): choose one default for product and contract.
2. Fix the permission ids for `search`/`my-products`/`my-requests` before building persona nav; otherwise §1.2 testing is misleading.
3. §1.1 port needs a nav-hiding layer because Consumers need `data-products`/`data-contracts` READ to use the marketplace/product page, yet should not see the Products/Contracts sidebar entries. A real per-role nav field (upstream's `hidden_nav_features`) is the only mechanism that separates "can read" from "shown".
4. Roles YAML needs `semantic-models: Read-only` for Data Consumer (glossary) and cleanup of stale ids (`business-glossary`, `datasets`); remember seeding only runs on an empty DB, so existing environments need a migration or settings edit.
5. §1.3 home needs code changes in `home.tsx`, not just role data; SearchBar behaviour differs from the plan's `/marketplace?q=`.
6. "My Products" -> consumer column, merge candidate with My Requests -> Subscriptions.
7. §1.4: "Subscribe -> Request access" is not valid (subscribe = notification subscription); keep "Subscribe" or relabel to "Follow/Get updates"; Product detail Deliverables/Consumables strings are the largest banned-term surface (72 of the 232 banned occurrences, in the product page and form namespaces); `shell.json`/`features.json`/`home.json`/`navigation.json` are not parity-tested.
8. Translating new wizard texts needs both `workflowDefaults.json` entries and `defaultText(...)` wrapping for legal/checklist strings.

## Surprises / contradictions

- BRIEF CONTRADICTED: contract wizard (5 steps) is not used anywhere; "draft save" belongs to dead code. Real create flow is a single basic dialog.
- BRIEF CONTRADICTED: `my-products` is not the producer's own list; it is the consumer's subscriptions (and duplicated in My Requests).
- BRIEF CONFIRMED: no `hidden_nav_features`, no `/api/user/navigation`.
- Default version in the fork is `0.0.1` for product and contract basic dialogs (plan assumes `1.0.0`).
- Unknown permission ids for `search`, `my-products`, `my-requests` hide them for every role (code + live API; verify in browser).
- The old `components/layout/navigation.tsx`/`sidebar.tsx` are dead code; the live nav is `mantine/shell/nav-config.ts`. Plan §1.1's list of upstream files (`navigation.tsx`, `quick-actions.tsx`) does not map cleanly onto the fork's shell.
- Test-persona picker is off in dev (`/api/test/personas` -> 404); the role override in the user menu is the working switcher.
- `settings:personaNav.*` locale keys are unused; settings.yaml references non-existent feature ids.
- Home `home_sections` does not control REQUIRED_ACTIONS at all; order is hard-coded except under role override.
- Product create dialog title contains "(ODPS v1.0.0)"; the Overview tile counts include all products/contracts, regardless of publication state.

## Not determined / not read
- Browser-level rendering of the sidebar for each persona (all counts derived from code + live API); marketplace `q` handling; `on_subscribe` trigger outcome (does it grant access?); marketplace `/published` payload fields (other §0.5 row); other contract entry points (`self-service-dialog.tsx`, `create-contract-inline-dialog.tsx`); whether editing `settings.yaml` can reach existing databases; concept pages' banned-term strings.
