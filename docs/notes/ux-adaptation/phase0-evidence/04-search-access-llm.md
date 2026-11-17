# Phase 0 §0.5 findings: search (A22), marketplace payload, access request (A12, A10/D5), terms (A11), LLM (A23)

Repo `/Users/joey.filichia/Projects/nucleus`, branch `development`, HEAD `277a5595`. Read-only research. Paths are relative to `src/backend/src` (BE) or `src/frontend/src` (FE) unless absolute.
Labels: [FORK ✔] = verified in this repo (file:line or command result). [UNVERIFIED] = inferred.
Live checks: read-only GETs against the dev backend. Caveat: the dev DB has **0 data products** (`GET /api/data-products` and `/published` both return `[]`), so product-shaped output was verified from code, not from live rows.

## Summary (most decision-relevant)

1. **BRIEF CONTRADICTED (A12).** A seeded approval-mode workflow for `for_request_access` already exists: id `request-access` (`data/default_workflows.yaml:1228`), a single `user_action` step with `reason` (required, min 10) and `expiry_days` (optional text). D5(b) is not "seed one"; it is "extend the existing `request-access`" with terms and acknowledgement steps. The brief's list of seeded ids omitted it. [FORK ✔]
2. **`access-grant-request` is process-mode** (no `workflow_type`, so default process; trigger `on_request_access`, entity type `access_grant`). It is notification, then admin approval, then notification. It is NOT what opens the wizard. The wizard is looked up by `for_request_access` (`hooks/use-approval-wizard-trigger.ts:47`). [FORK ✔]
3. **Wizards are OFF by default.** At startup `load_from_yaml(requests_only_active=True)` (`app.py:135`) creates every non-`on_request_*` workflow inactive (`controller/workflows_manager.py:264-266`), whatever the YAML says. The live dev DB confirms it: `Request Access`, `Subscription Agreement` and `Approval response` all exist with `is_active=False`, and `GET /api/workflows/for-trigger/for_request_access` returns "No active workflow found". So today, "Request access" falls back to the direct form unless an admin activated the workflow. Whether APFM prod did: [UNVERIFIED], needs Joey (Workflows settings page). [FORK ✔ for dev DB]
4. **"Request access" on a product today** opens `RequestProductActionDialog` (`components/data-products/request-product-action-dialog.tsx`, mounted at `views/data-product-details.tsx:2194`, button at `:1556`), not `request-access-with-duration-dialog.tsx`. That dialog is orphaned (only reachable through a deprecated re-export that nothing imports). Without an active wizard the dialog shows reason + duration (`AccessRequestFields`) and POSTs `/api/access-grants/request`. The marketplace has **no** Request-access button, only Subscribe (`marketplace-view.tsx:422`). [FORK ✔]
5. **Duration bug when the wizard is active (D5 blocker).** The dialog's payload always carries `requested_duration_days: 30` (`:305`, state default `:120`). The wizard-field hoist only fills top-level fields that are empty (`:516-524`), so the wizard's `expiry_days` never overrides the 30. Wizard duration is silently ignored. Also, the wizard's field id must stay `reason`: the hoist map only knows `reason`/`expiry_days`/`requested_duration_days` (`:451-456`), and the BE model requires `reason` min_length 10 (`models/access_grants.py` `AccessGrantRequestCreate.reason`). A field named `purpose` would be sent only inside `wizard_data`, leaving top-level `reason` as `''`, which fails validation with a 422. [FORK ✔ by code reading, not executed]
6. **Where Purpose/reason lands.** Access request: `access_grant_requests.reason` (Text) and `requested_duration_days` (Integer) (`db_models/access_grants.py:75-77`); the whole wizard map is also forwarded as `entity_data`/`wizard_data` to the `on_request_access` workflow. Shown to approvers as "Reason" in `HandleAccessGrantDialog` (`components/access/handle-access-grant-dialog.tsx:213-219`), in the workflow approval response dialog (`workflow-approval-response-dialog.tsx:145`) and the approval step notification (`common/workflow_executor.py:677-781`). **My Requests does not show the reason** (`views/my-requests.tsx` only reads `raw.reason` into the type, never renders it). The "approvals queue" (`/api/approvals/queue`) is contracts/products awaiting lifecycle approval, NOT access requests. [FORK ✔]
7. **Subscription wizard.** `reason` becomes `data_product_subscriptions.subscription_reason` (`db_models/data_products.py:411`) via `_complete_session` then `dp_manager.subscribe(reason=...)` (`controller/agreement_wizard_manager.py:~680`). `use_case` is **not** persisted in the subscription row; it lives only in `agreements.step_results` (JSON text) and the PDF. Owners/admins see the reason in the product's Subscribers section (`views/data-product-details.tsx:2058`). [FORK ✔]
8. **Search can serve the marketplace, but needs 3 backend changes.** (a) `GET /api/search` has only `search_term`, with no type parameter, no limit and no pagination (`routes/search_routes.py:44-50`); (b) the index contains **every** product regardless of status or publication_scope (drafts included), because it is built with `list_products(is_admin=True)` and `extra_data` has no publication_scope (`controller/data_products_manager.py:3016`, `:2970-2979`); (c) permission is only feature-level `data-products` READ_ONLY, while `_caller_can_read_product` (`routes/data_product_routes.py:75`) says consumers must not read unpublished products. So **today search exposes draft product titles/descriptions/team names to any READ_ONLY user** (draft-name leak, ONT-NEG-011 class). Filtering by `publication_scope`/`status` is a security requirement, not a nicety. [FORK ✔ by code]
9. **A product search item is NOT enough for the §2.1 card.** It has title, description (purpose + usage only), tags, link, status, version, domain, owner team name. It lacks certification, quality, classification, rating, updated date, publication scope, owner contact. Best design: search for ranked ids (add a `type` filter), then hydrate cards from `GET /api/data-products/published` (the `DataProduct` model has certification, `updated_at`, `owner_team_name`, `team`, `support`, `description`). Quality/rating are fetched per card by badge components, and **classification exists nowhere on the product** (only per column on contracts). [FORK ✔]
10. **LLM (A23).** On iff `LLM_ENABLED=True` and `LLM_ENDPOINT` set (`common/config.py:176-177`). `src/app.yaml:40-43` ships `LLM_ENABLED="True"` with `LLM_ENDPOINT` from a `serving-endpoint` resource, and `docs/superpowers/plans/2026-11-11-wave-2-preview-app.md:10` says prod runs `LLM_ENABLED=True` with a serving endpoint, so it is very likely on in APFM. Cannot confirm from code what prod actually has: needs Joey. Locally `GET /api/llm-search/status` returns **500** (the OBO workspace client dependency raises PermissionDenied), so the plan's "hide the button if status is not enabled" must treat errors as disabled. [FORK ✔ for config and local 500; prod state UNVERIFIED]

---

## A22: Search as the marketplace retrieval layer

**Item types** [FORK ✔: code + live type counts from `GET /api/search?search_term=a` on dev]
- `data-product` (`controller/data_products_manager.py:2991`, feature_id `data-products`), `data-contract` (`data_contracts_manager.py:586`), `glossary-term` (`semantic_models_manager.py` ~3612, feature `semantic-models`), `data-domain` (`data_domains_manager.py:479`), `team` (`teams_manager.py:50`), `project` (`projects_manager.py:47`), `tag` (`tags_manager.py:505`), `data-asset-review` (`data_asset_reviews_manager.py:988`), `asset-<type>` (`assets_manager.py:816`, e.g. asset-table, asset-column), and `help` (`help_manager.py:79`).
- Config in `data/search_config.yaml` lists: data-product, data-contract, glossary-term, data-asset-review, tag, data-domain, asset, team, project, help. An item whose type is disabled in config, or has no `feature_id`, is dropped (`search_manager.py:96-106`).
- Live counts on dev (`search_term=a`): asset-column 1729, glossary-term 856, asset-logical-attribute 445, asset-tableau 216, asset-view 96, help 95, asset-table 47, asset-logical-entity 45, data-domain 22, asset-dataset 9, data-contract 9, asset-genie-space 8, team 6, asset-catalog 3, asset-schema 3, asset-system 2, project 1, data-product 0.

**Fields on a data-product item** (`SearchIndexItem`: `common/search_interfaces.py:16-30`; built at `data_products_manager.py:2860-3000`)
- `id` = `product::<uuid>`, `type` = `data-product`, `feature_id` = `data-products`, `title` = name, `link` = `/data-products/<id>`.
- `description` = `purpose | usage` joined (`:2879`). **`limitations` is not indexed.**
- `tags` = unified tag FQNs + assigned domain names + ODPS original-domain strings + linked glossary concept labels/IRI tails (`:2884-2967`). Domain names and concepts are mixed into tags (that is how a product is found by glossary term).
- `extra_data` (`:2970-2979`): `status`, `version`, `domain` (primary), `domains` (all), `owner` (= owner-team name, else product team name), `owner_team`, `product_team`, `team_members` (names only, deliberately not usernames, `:2905-2910`).
- **Absent:** owner contact, classification, certification level, quality, rating, `publication_scope`/published flag, `updated_at`, subscription state.

**Type filtering**
- REST `GET /api/search` (`routes/search_routes.py:44`) takes only `search_term`; returns all types, unpaginated (in-memory backend), no `type` param. Adding one is small: filter on `item.type` in the route/manager.
- A type-filtered, paginated, faceted API already exists but is MCP-only: `SearchManager.query_index(query, type_filter=..., filters=..., limit, offset, include_facets, fields)` (`search_manager.py:357-382`), used by `tools/search.py:68`, `tools/data_products.py`. It does scope-based access only, with no per-user permission filtering, so it is not directly safe for the REST route.
- Postgres backend: `SEARCH_BACKEND` defaults to `memory` (`common/config.py:144`; not overridden in `src/app.yaml`). In the postgres path candidates are capped at 200 *before* permission filtering (`search_manager.py:277`), so a type filter must be applied before that cap or products can be crowded out by 800+ glossary terms. In memory mode there is no cap.

**Help items**: `type="help"`, `feature_id="help"`, id `help::<slug>#<anchor>`, `extra_data` has `article_slug`, `anchor`, `topic`, `roles` (`help_manager.py:70-95`). `HELP_ITEM_TYPE = "help"` (`search_manager.py:33`); help matches bypass the permission filter and are always returned (`:231-249`, postgres `:290-301`); they are returned even to users with no groups. Excluding them from marketplace results is trivial with a `type=data-product` filter.

**Published vs draft** (important): the index is built from `list_products(limit=10000, is_admin=True)` (`:3016`) and `_build_search_index_item` has no status/scope check. All products are indexed, including drafts and personal drafts. Search auth is `feature_id` READ_ONLY only (`search_manager.py:243`). By contrast `GET /api/data-products/published` returns only `publication_scope != none` (`controller/data_products_manager.py:1749-1752`), and direct reads of unpublished products are blocked for consumers (`routes/data_product_routes.py:75-83`). Also `limit=10000` is a hard cap on the index build.

**Ranking** (`controller/search_scoring.py`, `data/search_config.yaml`)
- Query is tokenized on non-word chars; each token is matched independently against each indexed field; item score = sum of the best per-token field score x coverage (matched tokens / total tokens) (`search_scoring.py:180-225`). Partial matches (1 of 2 tokens) are kept, only down-weighted.
- Data-product fields: title prefix, priority 1, boost 3.0; description substring, priority 2, boost 1.0; tags prefix, priority 3, boost 0.5; owner/owner_team substring p4 b1.5; product_team p4 b1.2; team_members p4 b1.2; domain p4 b1.0; status exact p5 b0.8; version prefix p6 b0.5.
- Sort: `match_priority` (lowest field priority of the best-matching field), then `boost_score`, then title A-Z (`ranking:` block, `_sort_key`).
- **"marketing cost" would find a product by description**: yes, `description` is indexed with substring matching, so tokens "marketing" and "cost" each match inside the purpose/usage text. Caveats: (1) a product whose *title* contains either token is ranked ahead (priority 1 beats 2); (2) because ranking is priority-first, the 856 glossary terms and domains titled "Marketing ..."/"Cost ..." outrank description-only product hits in an unfiltered query (live: top results for `marketing cost` are glossary terms and data-domains); so a type filter is mandatory for the marketplace; (3) tags are prefix-matched (a glossary concept "Marketing Spend" linked to the product also matches). Verified by code only; no products exist in dev to run it.

**Card sufficiency**: not enough (see Summary 9). Recommended source: `GET /api/data-products/published` for card data; search supplies ranked ids and snippet. Alternative is enriching `extra_data` with `publication_scope`, certification level, `updated_at`, but quality/rating/classification would still be per-badge fetches.

**Impact on plan**
- D4 holds in principle but changes: add a `type` (and `publication_scope`) filter to the REST route (or a new `/api/search/data-products`), and add `publication_scope` + `status` to the product's `extra_data`; fix the draft leak before shipping §2.2. Without it D4 would expose unpublished products to consumers.
- §2.2 "client filter as fallback" stays; note the client filter is a whole-phrase substring match on name/purpose/usage (`marketplace-view.tsx:384-391`), so "marketing cost" only matches if contiguous. The server search is what makes the acceptance test pass.
- §2.1 "Data" bullet: use `/published` for cards; use search for ranking. Plan item "owner contact" and "classification" need new fields (see next section).

---

## Marketplace payload: `GET /api/data-products/published`

Route `routes/data_product_routes.py:1525`, `response_model=List[DataProduct]`, optional `scope` query; permission `data-products` READ_ONLY. Returns every product with `publication_scope` other than `none`, **of any status** (no status filter; but publishing requires active per route comment ~`:781`). Model: `models/data_products.py:370-468` (`DataProduct`). Live: returns `[]` on dev.

Fields present (`DataProduct`):
- Identity: `id`, `name`, `version`, `status`, `kind`, `apiVersion`, `tenant`, `project_id`, `project_name`.
- Domain: `domain` (primary name), `domain_ids`, `primary_domain_id`.
- Owner: `owner_team_id`, `owner_team_name` (resolved in `_load_product_with_tags`, `data_products_manager.py` ~3090), `team` (`name`, `description`, `members[]` with `username`, `name`, `role`), `support[]` (`channel`, `url`, `tool`, ...).
- Description: `description.{purpose, usage, limitations}`.
- Certification: `certification_level`, `inherited_certification_level`, `certified_at`, `certified_by`, `certification_expires_at`, `certification_notes`.
- Time: `updated_at`, `created_at`, `published_at`, `published_by`, `publication_scope`.
- Also `tags`, `inputPorts`, `outputPorts` (with `contractId`, `contractName`, `containsPii`), `consumer_principals`, versioning fields.

For plan §2.1:
| Card element | In payload? |
|---|---|
| name, one-line purpose | Yes (`name`, `description.purpose`) |
| owner team name | Yes (`owner_team_name`); the marketplace currently shows `team.members[0].username` instead (`marketplace-view.tsx:484`) |
| owner contact | Partial: `team.members[].username` (often email) and `support[]`; no explicit team contact field. The `teams` table has `name/title/description/extra_metadata` JSON, no email column (`db_models/teams.py`) |
| domain | Yes |
| certification | Yes (ordinals; resolved to names via `/api/certification-levels`, already done by the card) |
| quality | **No.** `QualityBadge` fetches per product (`marketplace-view.tsx:534`) |
| rating | **No.** `RatingBadge` fetches per product (`:533`) |
| classification | **No.** Not on the product model. Exists only per contract column: `db_models/data_contracts.py:305` (`classification`), `models/data_contracts_api.py:39,205`. Needs derivation via output port `contractId` then schema properties (highest wins); `outputPorts[].containsPii` is a related boolean |
| last updated | Yes (`updated_at`) |
| subscription state | **No.** Separate `GET /api/data-products/my-subscriptions` (`marketplace-view.tsx:207`) |

**Impact on plan**: §2.1 "extend the response model server-side for classification, owner contact" is confirmed necessary. Owner contact needs a decision (team lead email vs support channel vs team table). Also N+1 badge fetches per card already exist; adding more per-card fetches will worsen it, so prefer a server-side summary.

---

## A12 + A10/D5: access requests

### Seeded workflows (`data/default_workflows.yaml`)
| id | line | trigger | mode | steps |
|---|---|---|---|---|
| `access-grant-request` | 586 | `on_request_access`, entity `access_grant` | **process** (no `workflow_type`) | notification (requester) then `approval` (approvers "Admin", 3 days) then notification approved/rejected, then pass/fail |
| `project-access-request` | 837 | `on_request_access`, entity `project` | process | notify requester, notify owner, pass (no approval step) |
| `role-access-request` | 875 | `on_request_access`, entity `role` | process | notify, approval (Admin, 5 days), notify, pass/fail |
| `approval-response` | 1053 | `for_approval_response` | **approval** | `user_action` (`reason`, required, min 10, primary field `reason`), pass |
| `subscription` | 1100 | `for_subscribe` | approval | `legal_document` (static `body_markdown`) then `acknowledgement_checklist` (3 items) then `user_action` (`reason` required, `use_case` optional) then `persist_agreement` then `generate_pdf` then `deliver` (in_app to signer + entity_owner) then pass |
| **`request-access`** (not in brief) | 1228 | `for_request_access` | **approval** | `user_action` only: `reason` ("Why do you need access?", required), `expiry_days` ("Requested duration (days, leave blank for indefinite)", text, optional), `minimum_input_length: 10`, `primary_field_id: reason`; then pass |
| `on-request-access-grant-permissions-reference` | 1671 | `on_request_access`, `access_grant` | process, `is_active: false` | single `grant_permissions` step (reference only) |

Process vs approval: `workflow_type: approval` marks wizard workflows (default `process`). `for_*` triggers are looked up by `GET /api/workflows/for-trigger/{type}` (`routes/workflows_routes.py:569`, requires an **active** workflow), and `on_request_access` fires when the request is posted (`controller/access_grants_manager.py:148`). The `access-grant-request` process workflow is what runs after the wizard, on submit.

**Does `for_request_access` open the wizard or the direct dialog?** It opens the wizard only if the seeded `request-access` workflow is active, which it is not after a fresh seed (Summary 3). Live dev: inactive, so the direct dialog is used. [FORK ✔]

### What happens on "Request access" today
1. Click: `views/data-product-details.tsx:1556` sets `isRequestDialogOpen`, which mounts `RequestProductActionDialog` (`:2194`) with `defaultRequestType='access'` (a multi-purpose dialog also offering review/publish/certify/status-change).
2. On open it calls `useApprovalWizardTrigger().lookupWorkflowId('for_request_access')` (`request-product-action-dialog.tsx:182-199`; hook `hooks/use-approval-wizard-trigger.ts:47` = `GET /api/workflows/for-trigger/for_request_access`; any error means null).
3. **No active workflow (today):** shows `AccessRequestFields` (reason textarea + duration Select; duration options from `GET /api/access-grants/config/data_product/options`, default `[30, 90, 180, 365]`, `access-request-fields.tsx:34-50`); validation: reason non-empty and >= 10 chars (`:255-263`); `POST /api/access-grants/request` with `{entity_type:'data_product', entity_id, reason, requested_permission_level:'READ', requested_duration_days}` (`:299-306`).
4. **Active workflow:** dialog hides its own fields; Submit opens `ApprovalWizardDialog` (`:716`-ish, `pendingSubmit`); wizard session via `POST /api/approvals/sessions` (+ `/steps`); on completion `handleWizardComplete` (`:~519`) hoists fields and POSTs the same `/api/access-grants/request` with `wizard_data` (and sends the request as soon as the wizard completes, not when closed).
5. Backend `AccessGrantsManager.create_request` (`controller/access_grants_manager.py:73-190`): blocks if a pending request or active grant exists; validates duration against per-entity-type config; inserts `access_grant_requests`; commits; fires `ON_REQUEST_ACCESS` with `entity_data` (first-class fields + splatted `wizard_data`). If no workflow handles it, falls back to `_notify_admins_new_request` (`:~280`). The seeded `access-grant-request` then does notify then Admin approval then notify.
6. Other callers: **marketplace has no Request-access path**; only Subscribe. `request-access-with-duration-dialog.tsx` is dead code (its only import is the deprecated `request-access-dialog.tsx` re-export, which nothing imports).

### How duration and reason are saved
- Table `access_grant_requests` (`db_models/access_grants.py:68-86`): `reason` Text, `requested_duration_days` Integer NOT NULL, `permission_level`, `status`, `entity_type/id/name`, `requester_email`, handled_* fields, `admin_message`. API model `AccessGrantRequestCreate` (`models/access_grants.py`): `requested_duration_days` int 1..365 required; `reason` Optional but `min_length=10`; `wizard_data` dict; `extra="allow"`.
- Duration allowed values are validated against `config.is_duration_allowed` (`access_grants_manager.py:126-132`); an out-of-set value raises ValueError so a free-text duration from the wizard (e.g. 45) can be rejected.
- On approval the approver sets `granted_duration_days` (required when approving) in `/api/access-grants/handle`, creating an access grant row.
- **No separate "purpose" column.** `wizard_data` is not stored on the request row; it exists only in `entity_data` for the workflow execution (and in `agreements.step_results` if a persist step exists; the current `request-access` has none).
- **Duration-ignored bug** and **field-id constraint**: see Summary 5.

### Where reason/use_case are persisted and shown
- **Access request:** persisted `access_grant_requests.reason`. Approvers: (a) notification action `handle_access_grant_request` opens `HandleAccessGrantDialog`, which renders "Reason:" (`handle-access-grant-dialog.tsx:213-219`; payload built at `access_grants_manager.py:~745-765`); (b) the process approval step's notification includes `Reason:`/`Duration:` lines and structured facets (`common/workflow_executor.py:634-781`) and `WorkflowApprovalResponseDialog` renders a reason row (`:145`); (c) `AccessGrantsPanel` on the product page has `reason` in its type (`access-grants-panel.tsx:49`; not checked whether rendered). Requester: **My Requests does not show the reason** (`views/my-requests.tsx`; `/api/access-grants/my-requests`, route `access_grants_routes.py:245`). Rows show entity, permission, status, dates and `(READ, 30d)`.
- **Approvals queue**: `/api/approvals/queue` (`routes/approvals_routes.py:101`, consumed by `home/required-actions-section.tsx:38`) lists contracts/products in `proposed`/`under_review` only; access requests do not appear there.
- **Subscription wizard:** `_complete_session` (`agreement_wizard_manager.py:536-720`) with `completion_action='subscribe'`; `_reason_from_step_results` (`:221-232`) takes `payload.reason`, else the first non-empty string in any step; calls `DataProductsManager.subscribe(reason=...)` which stores `data_product_subscriptions.subscription_reason` (`db_models/data_products.py:411`; API `Subscription.subscription_reason`, `models/data_products.py:737`). `use_case` is **dropped** from the subscription row; kept only in `agreements.step_results` (Text JSON, `db_models/agreements.py:23`) and the PDF (`utils/agreement_pdf_builder.py`). Displayed: Subscribers section for owners/admins (`views/data-product-details.tsx:2048-2060`, shows `subscriber.reason`). The agreement itself is exposed at `/api/approvals/agreements` (`approvals_routes.py:271-298`), but no FE page consumes it (grep: only `required-actions-section` uses `/api/approvals/queue`; no hits for `approvals/agreements` in `.tsx/.ts`).

### Step types (`models/process_workflows.py:112-136`)
`validation, approval, notification, assign_tag, remove_tag, conditional, script, pass, fail, policy_check, delivery, create_asset_review, webhook, user_action, generate_pdf, entity_action, legal_document, acknowledgement_checklist, co_signers, persist_agreement, deliver, grant_permissions, on_behalf_of`.
- `legal_document` (`:300`): `title, description, body_markdown, require_scroll_to_end, require_acknowledgement_checkbox, acknowledgement_label, references`. Designer schema `controller/workflows_manager.py:~935-955`.
- `acknowledgement_checklist` (`:312`): `items[{id,label,required}]`, max 10.
- `user_action` (`:274`): `title, description, document_url, document_content, required_acceptances, required_fields[{id,label,type,required}], references`, plus `requires_input`, `minimum_input_length`, `primary_field_id` in the designer schema (`workflows_manager.py:824-852`).
- `persist_agreement`: no config; `generate_pdf`: `storage` (volume|none), `volume_path`, `include_step_results`. `on_behalf_of`, `co_signers`, `deliver` also exist.

**Can `user_action` express a required text field with min length and an optional select?** Mostly yes, with caveats:
- Required text: yes, `required: true`. Min length: yes but **only for ONE field**, the `primary_field_id` (default: first required field, else `reason`); enforced both in BE (`agreement_wizard_manager.py:266-291`) and FE (`approval-wizard-dialog.tsx:550-551, 1289-1296`). Per-field min length is not supported. Counting is `len(strip)`.
- Select: the **FE renders `type: 'select'`** with static `options[{value,label}]` or `options_endpoint` (`approval-wizard-dialog.tsx:151-162, 1008`). But the designer's JSON schema only allows `type` enum `["text","checkbox"]` (`workflows_manager.py:843`) and the Pydantic doc says `text|text_list` (`models/process_workflows.py`; `required_fields` is untyped `List[Dict]`, so the backend does not reject `select`). The seed YAML can use `select`; the designer UI cannot author it without a schema change. Checkbox: schema says yes; FE render path for `checkbox` not verified. Validation of select values (membership in options) is not done server-side. [FORK ✔ except checkbox rendering UNVERIFIED]
- Duration as select: workable (`options` 30/90/180/365 from the same config as the legacy dialog), but then the value is a **string** and goes through the hoist's `parseInt` (`:526-532`), which then hits the `existingIsEmpty` bug above. A dynamic option source for durations (`/api/access-grants/config/data_product/options` returns `{duration_options: number[]}`, not `{value,label}[]`) would not fit `options_endpoint` as is: [UNVERIFIED] how `FetchedSelectField` maps the response.

**Impact on plan (D5, §2.5)**
- D5(b): do not seed a new workflow; **edit `request-access`** (id stays stable): add `legal_document` (terms) and `acknowledgement_checklist` before the `reason` step, add `persist_agreement` + `generate_pdf` + `deliver`. Keep field id `reason` (label "Purpose") or extend `WIZARD_FIELD_HOIST`; set `minimum_input_length: 10` (primary field is `reason`).
- New fresh-seed work is not enough: **activation**. Existing databases (and fresh ones at startup) get wizards inactive and existing workflows are never updated by startup load (`update_existing=False`). Plan must add an explicit activation step/migration or document an admin step (and an ask to Joey for prod).
- D5(c): "persist Purpose where approvers see it" is already done for the `reason` column and approver dialogs; remaining work is (i) relabel Reason to Purpose in i18n (`access-grants:handle.fields.reason`, workflow approval response row, notification text), (ii) show it in My Requests (§2.6), (iii) fix the duration hoist so a wizard-chosen duration wins. If terms/agreement are signed, add `entity_type/entity_id/request_id` linkage: `persist_agreement` currently ties the agreement to the *session*, not to the access request row [UNVERIFIED how wizard session id could be linked to `access_grant_requests`; there is no column].
- A consumer needs `access-grants` READ_ONLY to run the `for_request_access` wizard (per `lib/workflow-labels.ts:185`, `WIZARD_PERMISSION_DISPATCH` in `workflows_routes.py:~598`); [UNVERIFIED] exact dispatch table, check that the Consumer role has it.
- Replace the multi-purpose `RequestProductActionDialog` for consumers: the "no new dialog" rule still holds, but that dialog shows five request types to a consumer; a consumer entry could call the same wizard directly (needs only workflow lookup + `handleWizardComplete`).

---

## A11: terms source

- **Today a `legal_document` step gets its text only from its own config `body_markdown`** (BE `LegalDocumentStepConfig.body_markdown`, `models/process_workflows.py:304`; FE renders `currentStep.config.body_markdown` or "no document content", `approval-wizard-dialog.tsx:1061`). The step config comes from the workflow snapshot via `_step_to_response` (`agreement_wizard_manager.py:234-243`, config passed through unchanged). There is no entity-aware resolution anywhere. `UserActionStepConfig` also has `document_url`/`document_content`, again static.
- Seed `subscription` (line 1100) and `request-access` use generic static text / none.
- A resolver belongs in `_step_to_response` / session creation (BE) because it has `session.entity_type/entity_id`; the FE needs no change except a new i18n key and a designer field (`body_source`). The FE renderer's `simpleMarkdown` escapes HTML but allows arbitrary `[text](url)` hrefs, including `javascript:` (`approval-wizard-dialog.tsx:28`); contract text is user-authored, so sanitize the scheme in the resolver or renderer before feeding it contract content (security surprise).
- **Where the data lives** (not ODCS JSON):
  - Contract: columns on `data_contracts`: `description_usage`, `description_purpose`, `description_limitations` (Text) (`db_models/data_contracts.py:41-43`); API fields `descriptionUsage/Purpose/Limitations` (`models/data_contracts_api.py:431-433, 506-508`); mapped to ODCS `description.{usage,purpose,limitations}` in `data_contracts_manager.py:1056-1061`. Contracts also have `status`, `version`, `publication_scope`, `certification_level`.
  - Product: table `data_product_descriptions` (`purpose`, `limitations`, `usage`; `db_models/data_products.py:124-138`), exposed as `DataProduct.description` (`models/data_products.py:110-118, 390`).
  - Link product to contract: `OutputPort.contractId` (`models/data_products.py:204`; output ports table). Resolution helper already used: `data_contract_repo.get(db, id=port.contract_id)` (`data_products_manager.py:1204-1211`).
  - **There is no "primary" output port concept**: no `is_primary` flag on `OutputPort` and the readiness route counts "any port with contractId" (`routes/readiness_routes.py:71-76`). The resolver must define it (suggest: first output port, ordered by port id/created, that has a contract with status active; fall back to any contract; then to product `description`; then static body). Needs a decision.
- ODCS "terms/SLA": `data_contracts.sla_default_element` exists; no dedicated terms-of-use table found [UNVERIFIED beyond a grep of `db_models/data_contracts.py`].

**Impact on plan**: §2.5(1) `body_source: contract_terms` is feasible as a backend resolver with no migration. Decide "primary output contract". Also decide whether product `description.limitations` should be a fallback when no contract (it is in the product table, so likely yes).

---

## A23: LLM

- **What enables it** (`common/config.py:175-191`): `LLM_ENABLED` (default `False`), `LLM_ENDPOINT` (Databricks serving endpoint name), optional `LLM_BASE_URL`, `LLM_SYSTEM_PROMPT`, `LLM_DISCLAIMER_TEXT`. `.env.example:119-147` documents them (default `LLM_ENABLED=False`).
- **Status endpoint** `GET /api/llm-search/status` (`routes/llm_search_routes.py:153-162`) returns `LLMSearchStatus` (`models/llm_search.py:332`): `enabled`, `endpoint`, `model_name`, `disclaimer`, `adoption_mode` (`controller/llm_search_manager.py:432-459`). When disabled: HTTP 200 with `enabled: false` (and `endpoint: null`), not a 404. The route has no PermissionChecker.
- **Gotcha:** the handler depends on `get_llm_search_manager`, which builds an OBO workspace client (`routes/llm_search_routes.py:113-141`). Locally (no user token) the call **returns HTTP 500** (backend log: `PermissionDenied ... /api/2.0/preview/scim/v2/Me`). FE callers: `components/search/llm-search-api.ts` `fetchLLMStatus`, `mantine/ontos/ontos-store.ts:12` (holds `null` "until known or when it failed"). So "enabled" must be treated as `status?.enabled === true`, never "not an error".
- **In APFM?** Repo evidence only: `src/app.yaml:40-43` sets `LLM_ENABLED: "True"` and `LLM_ENDPOINT` via `valueFrom: serving-endpoint` (added in the first "Ask Ontos" commit `94f946dc`); `docs/superpowers/plans/2026-11-11-wave-2-preview-app.md:10,40-50` states prod uses `LLM_ENABLED=True` with `model` `system.ai.claude-opus-5-5` and an AI-gateway `LLM_BASE_URL`. I did not read any credential or env file. **What the running apfm-ontos / nucleus app actually has is [UNVERIFIED]: needs Joey** (open question O4), e.g. `GET /api/llm-search/status` as a real user in the deployed app.
- Related: `HELIX_ENABLED` ("Ask Helix"/Genie One) defaults false in `src/app.yaml`; separate from LLM search. The FE has an LLM chat window (`mantine/ontos`), `components/search/llm-search.tsx`, and the route `/search` per plan.

**Impact on plan**: D4 "Ask a question" hand-off: gate on `status.enabled === true`, treat 500/network error as disabled. D10 requires O4 as written.

---

## Surprises / contradictions

1. **BRIEF CONTRADICTED (A12, brief `01` row A12 and `04` §2.5 step 2):** the seeded ids list omits `request-access` (approval, `for_request_access`). D5(b) "seed an approval-mode workflow" is already partly seeded. Mode of `access-grant-request` confirmed process (as believed).
2. **Wizards seeded inactive** at startup regardless of YAML `is_active: true`; the plan's "keep legacy dialog as fallback" is therefore the *default* path, and enabling the wizard needs an explicit activation step.
3. **Wizard duration is silently ignored** (30-day default beats `expiry_days`), and a wizard field not named `reason` breaks the request (422). The plan's `purpose` field id would fail unless the hoist map is extended.
4. **Search index leaks unpublished/draft products** to any `data-products` READ_ONLY user (no status/scope filtering at index or query time). Blocks D4 until fixed. Also `limit=10000` cap and postgres-backend 200-candidate cap before filtering.
5. **Brief says terms are "ODCS JSON? columns?"**: they are plain columns (`data_contracts.description_*`) and a `data_product_descriptions` table; no "primary output contract" concept exists.
6. **`use_case` is not persisted** in the subscription record (only in agreement JSON/PDF), and nothing in the FE reads agreements back (no UI consumes `/api/approvals/agreements`).
7. **My Requests hides the reason**, and the "approvals queue" is unrelated to access requests (it lists contracts/products in review).
8. **`request-access-with-duration-dialog.tsx` is dead code**; the real entry is `RequestProductActionDialog` (a five-purpose dialog).
9. **Local `GET /api/llm-search/status` returns 500**, not `enabled:false`.
10. **Designer/FE mismatch for `user_action` field types:** FE renders `select` (static or endpoint options); BE designer schema lists `text|checkbox` only; so a duration dropdown can be seeded in YAML but not authored in the designer. `minimum_input_length` applies to one field only.
11. Link renderer in the wizard allows `javascript:` URLs in markdown links (`approval-wizard-dialog.tsx:28`): relevant once contract-authored text is rendered there.
12. Working tree: `git status` shows untracked `../.superpowers/` and `../docs/notes/ux-adaptation/` (not mine; this file is under the git-ignored `.superpowers/` per instructions). Nothing tracked was changed.
