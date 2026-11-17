# Dev seed data: proposal (decision D14, open question O9)

**Status: PROPOSAL. Nothing has been created.** Needs Joey's approval of the list below (request R2 in `instructions/requests-from-claude.md`).
Dev only; never run against a shared or production environment.

**Why:** dev has 0 published products, so a consumer cannot find, trust or request anything (hard rule 12). The baseline
usability test (T1 to T4) and Phase 2 verification need a populated marketplace.

## 1. What exists today (read-only check, 2026-11-17)

| Item | State |
|---|---|
| Data contracts | 9, all `draft`, owner team empty, version 0.1.0 (one 0.3.0), no tags; names end in "(as-is)" |
| Data domains | 22 |
| Teams | 6: Admin Team, Data Services, Finance, Grace, Home Care, Marketing Analytics |
| Certification levels | 3: Bronze (1), Silver (2), Gold (3) |
| Data products | 0 |

## 2. Proposed products (one per contract; owner team and certification are **guesses to confirm**)

| # | Product (proposed name) | Built on contract | Domain (from contract) | Owner team (guess) | Certification | Notes |
|---|---|---|---|---|---|---|
| 1 | Customer Conversations | Grace Conversations | Customer Engagement & Contact | Grace | Silver | |
| 2 | Call Center Interactions | Call Center Interactions | Customer Engagement & Contact | Data Services | Silver | second product in the same domain |
| 3 | Home Care Referrals | Home Care Referrals | Home Care Requests & Activation | Home Care | Gold | the "trusted" example |
| 4 | Product Activation Events | Grace Activations & Product Events | Home Care Requests & Activation | Grace | Bronze | |
| 5 | Billing Charges & Invoices | IPR Charges & Invoices | Revenue, Fees & Credit | Finance | Gold | Finance pilot users (T1 "spend by month") |
| 6 | Website Analytics | Web Analytics | Website Acquisition & Experimentation | Marketing Analytics | Silver | T1 "marketing cost" style task |
| 7 | Senior Living Sales Funnel | Senior Living Sales Funnel (0.3.0) | Pipeline & Lifecycle | Marketing Analytics | none | shows the "not certified" state |
| 8 | Advisor Workforce | Advisors & Employees | Advisor Workforce & Productivity | Data Services | Bronze | |

Left out on purpose: *Senior Living Communities* (domain "Shared Design"; it reads as reference data, not a consumer product).
This gives 8 products across 7 domains, 4 owner teams plus Data Services, and every certification state (Gold 2, Silver 3, Bronze 2, none 1).

Every product also needs, per `01` D14: a plain-language description (purpose, usage, limitations), the contract linked as its
output port, publication scope set so consumers can see it, at least two quality results (on products 3 and 5) and one rating/comment on
product 3 so those badges render. **Example data is not seeded** (the feature does not exist until Phase 2 §2.4).

## 3. How to create them (to confirm before running)

Not yet decided; the research found three routes. Pick one with Joey:
1. **UI**, as a Producer (role override): slow, but exercises the real create flow (also baseline for task T5).
2. **ODPS import** ("Upload File" on Products): generate 8 ODPS YAML files from the contracts and upload them. Fast and repeatable. Needs a check that import handles `publication_scope`, certification and the contract link.
3. **API calls** from a script: fastest; must follow the app's lifecycle rules (a product may need an approved or active contract before it can be published; the contracts are all `draft`).

**Verified 2026-11-17:** a genuine consumer (group `data-consumers`) gets **0 of the 9 contracts** from `GET /api/data-contracts`: non-admins only see `active` or
`deprecated` contracts, and all 9 are `draft` and personal (`draftOwnerId` set, no owner team). A role override in the browser still shows all 9 (override limitation), so
the browser alone can hide this problem. Seeded products therefore likely need their contracts **activated** and given an owner team, which changes the data state (request R5, O10).

Open feasibility question for any route: the contracts are `draft` and have no owner. Can a product be published on a draft contract,
or must the contracts first be approved or activated (changing the data state in O10)?

## 4. Safety and undo

- Dev database only. Record every created entity (type, id, name) in this file under "Created" when it is done.
- Tag every seeded product and any changed contract with `seed/ux-baseline` so they can be found and removed in one pass.
- Nothing is written to Unity Catalog or the Databricks workspace.
- The local database is a one-time copy of the Lakebase `nucleus` branch; re-running `scripts/sync-db.sh` wipes the seed, so keep this file as the recipe.

## 5. Created (dev database, 2026-11-17): DONE

Approved by Joey: option B (products and contracts), via API calls, dev only, tagged `seed/ux-baseline`; then option 1 of request R12 (act as the draft owner's identity inside the local dev app, temporary backend, dev database only; stopped afterwards). Business roles were requested as synthetic data.

**8 data products** (all `active`, v1.0.0, published to `organization`, tagged `seed/ux-baseline`, each built with `from-contract` on its contract, which is now `active`, owner team set, committed out of personal draft, tagged):

| Product | Product id | Contract (now active) | Owner team | Certification |
|---|---|---|---|---|
| Customer Conversations | `13b89230-0ff9-4618-afda-2d1bb3d9197f` | Grace Conversations `ec72e09e-3956-5437-94a8-b84382f74638` | Grace | Silver |
| Call Center Interactions | `a381a5c4-18bb-4b73-85ba-70953bf51712` | Call Center Interactions `27843788-e9fc-530a-af84-cde7c03bf1fa` | Data Services | Silver |
| Home Care Referrals | `9f95b6cf-f38e-4dd3-a06d-784b10009bf4` | Home Care Referrals `380c9e35-294f-5fd9-9aea-c53f58ae645f` | Home Care | Gold |
| Product Activation Events | `c01d9ca1-097c-40fc-8cc0-bb308445b87c` | Grace Activations & Product Events `46cc0af7-6ddd-5a6d-ba36-13121a1afbaf` | Grace | Bronze |
| Billing Charges & Invoices | `29b1dc85-60b6-42c9-a567-740a2dba810b` | IPR Charges & Invoices `ed780759-3319-547a-9d47-3e5e21185d57` | Finance | Gold |
| Website Analytics | `e246cbe0-ae3c-4ddb-ab14-39db4969f8ed` | Web Analytics `c6222663-a0e7-556b-8421-a19a1f9e44a8` | Marketing Analytics | Silver |
| Senior Living Sales Funnel | `93a18619-4244-4252-9fb0-509d1d5e92f6` | Senior Living Sales Funnel `b36a9304-7b07-5e0c-b990-4de1cf6c993f` | Marketing Analytics | none |
| Advisor Workforce | `86d19560-7eef-4cd4-971d-cc045f234500` | Advisors & Employees `7287423f-73d0-5ccf-b45f-68d3df205822` | Data Services | Bronze |

Each product has a purpose, usage and limitations text written from its contract's real table and column names (`DESC` in `seed.py`). Not seeded: quality results, ratings, comments (the plan listed them for products 3 and 5), and example data (feature does not exist). Contract *Senior Living Communities (as-is)* is untouched (still draft).

**Other data created:** tag namespace `seed` (`7eee80a0-fa77-4b30-9907-73ddbe84d751`) and tag `seed/ux-baseline` (`282bc0b1-2be3-4d0b-b151-2adad5c642f7`); **8 synthetic business roles**, each description starting "SYNTHETIC (UX baseline seed)": Data Product Owner `83eae31a-f4c8-45cd-8ef0-1d199cc32a64` (business), Business Data Owner `78888e89-ee0f-42f5-9874-283f73f49c7a` (business), Subject Matter Expert `48c0e0a3-44bd-4888-8a84-247fde0665a8` (business), Data Steward `8af684c4-b7c0-4285-920a-6efad4ba9ae1` (governance), Governance Approver `eb7ff388-2d33-408a-bf08-92d7667e3428` (governance, approver), Access Approver `1e7fa5bf-0ede-4026-9ab6-ad65e342e0b4` (operational, approver), Product Support Contact `7937c10b-e52f-4217-8e84-a46bf6270ea2` (operational), Data Custodian `afd7d2fb-19c5-47a0-86cb-199ca027ff4d` (technical). No business owners were assigned to any product (that needs people; request R13).

**Verified afterwards (read-only API calls):** as an admin, 8 products, all active, organization scope, tagged once; contracts 8 active + 1 draft. As a **genuine consumer** (a temporary backend with group `data-consumers`): all 8 published products and all 8 active contracts are visible; global search for "marketing" returns Senior Living Sales Funnel and Website Analytics. After the writes, the main backend's search index was stale (it had been built before the seed), so I called `POST /api/search/rebuild-index`; its search now finds them too.

**Things learned (worth knowing for later phases):**
- `POST /api/data-products/from-contract` documents that it inherits owner team from the contract, but the new product had `owner_team_id` empty; the script sets it with a full-document `PUT` while the product is still `draft` (a `PUT` on a non-draft product creates a new version).
- A contract's personal-draft commit compares the caller's **username** with the stored draft owner (an **email**); this only works for a user whose username is their email.
- Writes made through one backend process do not update another process's in-memory search index: rebuild it (`POST /api/search/rebuild-index`) or restart.
- The "Web Analytics" contract contains column names that look like injection-test strings (`<b>EVT</b>`, `<%=7*7%>`, `#{7*7}`); three contracts describe transcripts, chat text and employee details (metadata only here).

**Undo / re-run:** `.superpowers/phase0/seed/seed.py` (idempotent; `--dry-run`), write log `created.json`, snapshots of all 9 contracts before any change in `before/`. To remove: delete the 8 products, set the 8 contracts back to draft with no owner team (not reversible through the app's lifecycle: `active` can only go to `deprecated`; restore from `before/` or re-run `scripts/sync-db.sh`, which also removes everything else), delete the 8 business roles and the `seed` namespace. The simplest reset is `scripts/sync-db.sh`, which reloads the original copy of the database.

## 6. Synthetic business owners (R13, added after Joey's confirmation)
Dev database only. Each of the 8 seeded products got two business owners via `POST /api/business-owners` (object type `data_product`): role **Data Product Owner** (`seed.owner.<key>@example.com`) and role **Data Steward** (`seed.steward.<key>@example.com`); keys: grace, grace2, dataservices, dataservices2, homecare, finance, marketing, marketing2. All 16 calls returned ids, logged in `.superpowers/phase0/seed/business-owners.json`. The search index was rebuilt afterwards. Undo: delete these owners by id (`DELETE /api/business-owners/{id}`). To check: the Products list Owner column (was N/A) and OWN-1.
