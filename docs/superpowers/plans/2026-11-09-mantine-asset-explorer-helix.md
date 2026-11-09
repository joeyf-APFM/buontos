# Mantine shell, Asset Explorer tree and Ask Helix: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app shell and `/assets` with a dense Mantine UI in APFM Aura colours. The new Asset Explorer has a lazy-loaded Unity Catalog / Internal / External tree, and an Ask Helix panel streams Genie One answers as the asking user.

**Architecture:**
- **Backend:** gains a Volume asset type, a `data_branch` marker on assets and connections, a one-level tree endpoint, and a `node` scope on the asset list. It also gains a Helix route that proxies Genie One's streamed `onechat/responses` events as server-sent events, using the user's OBO token, or a dedicated service principal in shared mode.
- **Frontend:** gains Mantine 8 in its own CSS layer next to Tailwind. A new shell (top bar, icon strip, group panel) wraps every route; `/assets` becomes a Mantine page, and the Helix panel is mounted by the shell.

**Tech Stack:**
- Backend: FastAPI, SQLAlchemy, Alembic, pytest (`hatch -e dev run pytest`).
- Frontend: React 18, Vite 6, TypeScript, `@mantine/core`/`@mantine/hooks` **8.3.18**, TanStack Table, react-markdown, zustand, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-mantine-asset-explorer-helix-design.md` (approved 2026-11-09). Approved visuals: `.superpowers/brainstorm/70931-1794067422/content/prototype-final.html`, `aura-helix.html`, `side-menu.html`.

## Global Constraints

- Base branch `development`; work on a feature branch. Commit only when the owner asks. The commit steps below mark the points to offer a commit.
- Never restart the owner's dev servers (ports 8000 and 3000). Steps that need a backend restart say so; the owner runs it.
- Backend changes are test-first. Run tests from `src/backend` with `hatch -e dev run pytest <path> -q`. Frontend tests run from `src/frontend` with `npx vitest run <path>`. Existing tests keep passing.
- Mantine is pinned to **8.3.18**: Mantine 9 requires React 19, and the app is on React 18.
- Aura tokens are exactly as in spec §Visual design: navy #1F3066; accent #4F6AC5 / #334FA9 / #273D87 / #F1F5FF; canvas #FFFDF7; surfaces #FFFFFF / #F3EFE4; borders #E2DDCD / #F3EFE4 / #ADA899; text #1F3066 / #2C2F34 / #565D65 / #828D96. Status values come from `~/Projects/apfm-insights/app/globals.css` around line 644.
- Density: 12px body, 24px tree rows, 28px table header and rows, 26–28px controls, 16px page title, corners 4–8px, 1px shared pane borders, shadows only on floating elements.
- Fonts: display `Optima, Candara, 'Segoe UI', sans-serif`; body `Commissioner, 'Segoe UI', system-ui, sans-serif`. Light only.
- Menu items and sub-items stay hidden without READ_ONLY on their feature (`usePermissions().hasPermission(id, FeatureAccessLevel.READ_ONLY)`).
- New UI strings go through react-i18next, English only, in new namespaces `shell`, `helix` and `asset-explorer`. Other locales fall back to English; the parity test doesn't cover these namespaces.
- Helix never answers as anyone other than the asking user, except in shared mode, which the panel labels "Answering as APFM Helix, not as you". In user mode, a missing token is an error, never a fallback.
- Prod app scope changes (`src/manifest.yaml` `user_api_scopes`), creating Databricks apps, and service principals all need the owner's go-ahead first. Pass `--profile` explicitly; never auto-select one.

## Review Focus

1. **Big schemas:** a schema with thousands of tables must stay fast. Node scopes are SQL subqueries, never Python lists of IDs; the table pages. *Test: Task 5, `test_node_scope_is_a_subquery_and_pages`.*
2. **Consumer users** (no `assets:READ_WRITE`) must not see names or counts of assets they can't read. A container node appears for them only when it holds at least one readable asset. *Test: Task 5, `test_scoped_user_sees_only_nodes_with_readable_assets`.*
3. **Bad data cycles** (A hasSchema B, B hasTable A) must not hang the descendant query. A depth cap of 12 plus UNION dedupe ends it. *Test: Task 5, `test_cycle_in_hierarchy_terminates`.*
4. **A Helix stream that fails mid-answer** (Genie error event, HTTP error, dropped connection) ends the turn with a readable error. The partial answer stays, and the input is usable again. *Tests: Task 7 `test_error_event_becomes_error`; Task 11 `shows an error and re-enables input when the stream fails`.*
5. **Hostile text:** context-chip text over 500 characters, or containing markdown or HTML, is sent as plain text, cut to 500 characters. Answer markdown never renders raw HTML, and links to other hosts are shown as text. *Tests: Task 8 `test_context_is_capped_and_plain`; Task 11 `renders no raw HTML and drops foreign links`.*

---

## File map

**Backend (`src/backend/`):**

| File | Change |
|---|---|
| `src/data/taxonomies/ontos-ontology.ttl` | + `ontos:Volume` class, + `ontos:hasVolume` property |
| `src/models/assets.py` | + `VOLUME_ASSET_TYPE`, `DataBranch`; `data_branch` on AssetBase/Update/Summary; owner/concept fields on AssetSummary |
| `src/models/asset_tree.py` (new) | `AssetTreeNode` |
| `src/models/connections.py` | `data_branch` on Base/Update/Response |
| `src/db_models/assets.py`, `src/db_models/connections.py` | `data_branch` column |
| `alembic/versions/d1_add_data_branch.py` (new) | adds both columns |
| `src/controller/schema_import_manager.py` | Volume mapping, legacy volume retype, branch stamping |
| `src/controller/assets_manager.py` | `retype_asset(rename_relationship=…)`, list enrichment, `node` scope |
| `src/controller/asset_tree.py` (new) | node keys, scopes, children, counts |
| `src/routes/assets_routes.py` | `GET /api/assets/tree`; `node`, `concept_iri` params |
| `src/common/config.py` | Helix settings |
| `src/common/helix_client.py` (new) | Genie One request and event parsing |
| `src/routes/helix_routes.py` (new) | `POST /api/helix/ask`, `GET /api/settings/helix` |
| `src/controller/settings_manager.py` | `helix_enabled` in get/update |
| `src/app.py` | register `helix_routes` |
| `../app.yaml` | Helix env entries (commented, shared-mode secrets) |

**Frontend (`src/frontend/src/`):**

| File | Change |
|---|---|
| `mantine/theme.ts`, `mantine/provider.tsx`, `mantine/layers.css` (new) | theme, provider, CSS layer order |
| `mantine/shell/nav-config.ts`, `use-shell-store.ts`, `app-shell.tsx`, `side-strip.tsx`, `group-panel.tsx`, `top-bar.tsx` (new) | shell |
| `mantine/asset-explorer/api.ts`, `asset-tree.tsx`, `asset-table.tsx`, `details-panel.tsx`, `explorer-page.tsx` (new) | explorer |
| `mantine/helix/helix-stream.ts`, `helix-store.ts`, `helix-markdown.tsx`, `helix-panel.tsx`, `helix-button.tsx` (new) | Helix |
| `mantine/settings/helix-settings.tsx` (new) | Settings → Helix & LLM |
| `components/layout/layout.tsx` | use the new shell |
| `components/settings/settings-layout.tsx` | hide its own left nav inside the new shell |
| `components/common/asset-form-dialog.tsx`, `components/settings/connection-form-dialog.tsx` | Branch select |
| `app.tsx` | `/assets` → new page; `/settings/helix` route |
| `index.tsx`, `index.css` | provider, layer order |
| `i18n/locales/en/{shell,helix,asset-explorer}.json` (new), `i18n/config.ts` | namespaces |
| `test/setup.ts`, `test/utils.tsx` | matchMedia/ResizeObserver mocks, `renderWithMantine` |

---

### Task 1: Helix identity spike (throwaway, needs owner go-ahead)

Find out whether Genie One accepts a user token with the app's scopes, and whether its stream gets through the Databricks Apps proxy. Nothing from this task is kept except the notes file.

**Files:** Create `docs/superpowers/notes/2026-11-09-helix-spike.md`.

**Known already (2026-11-09 probe with CLI v1.21):**
- Request: `POST /api/2.0/data-rooms/tools/onechat/responses` with body `{"input":[{"type":"message","role":"user","content":"<text>"}],"enable_viz":false,"source":"<client>"}`. A follow-up adds `"conversationId":"<id>"`.
- Response: a stream of JSON events. `response.created` carries `conversation_id` and `response_id`. `response.output_item.added`/`.done` items include:
  - `function_call` (`metadata.query` = SQL);
  - `function_call_output` (`metadata.result_data.preview_rows`, `.columns`, `metadata.warehouse_id`, `metadata.statement_id`);
  - `message` (`content[].type == "output_text"`, `.text`).
  
  The stream ends with `response.done`.

- [ ] **Step 1: Scope check without deploying.** Log in a throwaway profile limited to the app's scopes:

  ```bash
  databricks auth login --host <workspace> --profile helix-spike --scopes "sql dashboards.genie"
  ```

  Run `databricks auth login --help` first to confirm the scopes flag. Then ask with that profile:

  ```bash
  databricks genie ask -s spike "How many catalogs can I see?" --profile helix-spike
  ```

  Record whether it answers or gets a 403 and its message. If it gets a 403, repeat with candidate scopes added one at a time (for example `all-apis` as an upper bound) and record the smallest set that works.
- [ ] **Step 2: Proxy streaming check (ask the owner first).** With the owner's OK, deploy a scratch app `helix-spike`, separate from apfm-ontos. It's a 20-line FastAPI app with `user_api_scopes` from Step 1 and one route that relays `onechat/responses` using `x-forwarded-access-token` as a `StreamingResponse` of `text/event-stream`. Record:
  - whether events arrive incrementally in the browser (timestamps), or are buffered until the end;
  - the Genie One web URL for a conversation, so Task 11 can build "Open in Databricks". Get it from the workspace UI after an answer.
- [ ] **Step 3: Write the notes file** with three sections:
  - **Scopes:** what works, and whether `src/manifest.yaml` needs a change. If it does, that's the owner's decision.
  - **Streaming:** incremental or buffered.
  - **Conversation URL:** a pattern, or "none found".

  End it with the decision **User mode works on the deployed app: yes/no**. If no, the deployment runs `HELIX_IDENTITY_MODE=shared` (Task 8).
- [ ] **Step 4: Clean up.** Delete the `helix-spike` app and the `helix-spike` profile (owner's OK).

Tasks 2–7 and 9–10 don't depend on this task and can run in parallel. Task 8 reads the notes file for the mode default. Task 11 reads it for the conversation URL.

---

### Task 2: Volume asset type

**Files:**
- Modify: `src/backend/src/data/taxonomies/ontos-ontology.ttl` (add after `ontos:MetricView`, around line 405; add the property after `ontos:hasView`, around line 693)
- Modify: `src/backend/src/models/assets.py:547`
- Test: `src/backend/src/tests/unit/test_volume_asset_type.py` (new; copy the `osm` and `asset_types` fixtures from `test_metric_view_asset_type.py:48-63`)

**Interfaces:** Produces `VOLUME_ASSET_TYPE = "Volume"` in `src.models.assets`; ontology class `ontos:Volume`, property `ontos:hasVolume` (domain Schema, range Volume, `ontos:isHierarchical true`).

- [ ] **Step 1: Write failing tests**

```python
def test_the_ontology_has_a_volume_asset_class(osm):
    types = {t.label: t for t in osm.get_entity_types()}
    assert "Volume" in types
    assert types["Volume"].ui_category == "data"

def test_has_volume_links_schema_to_volume(osm):
    # same lookup style as test_a_metric_view_has_the_relationships_of_a_view (:75)
    rels = relationships_of(osm, "Schema")      # the helper that test uses for outgoing relationships
    assert ("hasVolume", "Volume") in {(r.name, r.target) for r in rels}

def test_the_startup_sync_seeds_the_volume_asset_type(asset_types):
    assert asset_types["Volume"].category == "data"
```

- [ ] **Step 2: Run them to verify they fail.** Run `hatch -e dev run pytest src/tests/unit/test_volume_asset_type.py -q`. Expected: 3 failures ("Volume" missing).
- [ ] **Step 3: Implement.**
  - `ontos:Volume`: `rdfs:subClassOf ontos:Asset`, `modelLayer "physical"`, `modelTier "asset"`, `uiIcon "FolderArchive"`, `uiCategory "data"`, `uiDisplayOrder 4`, `uiPersonaVisibility "admin,steward,producer"`, `skos:example "catalog.schema.raw_files"`.
  - `ontos:hasVolume`: shaped like `hasView`, with `uiLabel "Contains Volumes"`, `inverseLabel "Schema"`.
  - Add `VOLUME_ASSET_TYPE = "Volume"` next to `METRIC_VIEW_ASSET_TYPE`.
- [ ] **Step 4: Run them to verify they pass,** plus `src/tests/unit/test_metric_view_asset_type.py`. Expected: all pass.
- [ ] **Step 5: Commit point:** "Add the Volume asset type and hasVolume".

---

### Task 3: Import volumes as Volume assets and convert legacy ones

**Files:**
- Modify: `src/backend/src/controller/schema_import_manager.py:70` (`_TYPE_MAP`), `:405-430` (retype on reimport), `:759-771` (legacy match), `:970-984` (`_relationship_type_for`)
- Modify: `src/backend/src/controller/assets_manager.py:422` (`retype_asset`), `:72` (`_HIERARCHICAL_RELS`)
- Test: `src/backend/src/tests/unit/test_volume_import.py` (new; reuse the `_importer`/`_request` helpers' approach from `test_metric_view_asset_type.py:120-165`)

**Interfaces:**
- Consumes: `VOLUME_ASSET_TYPE` (Task 2).
- Produces: `AssetsManager.retype_asset(db, *, asset_id, from_type, to_type, current_user_id, commit=True, rename_relationship: Optional[Tuple[str, str]] = None) -> int`. With `rename_relationship=("hasPart","hasVolume")`, it also rewrites `relationship_type` on the rows where this asset is the **target**, in both `asset_relationships` and `entity_relationships`.

- [ ] **Step 1: Write failing tests**

```python
def test_a_volume_is_previewed_and_imported_as_a_volume_under_has_volume(db_session, asset_types): ...
    # connector reports main.raw.files as UC_VOLUME under schema main.raw
    # assert the asset type is "Volume" and the schema->volume link is "hasVolume" in both relationship tables

def test_a_volume_imported_earlier_as_a_system_is_reused_and_converted(db_session, asset_types): ...
    # seed System asset at location main.raw.files with Schema --hasPart--> it (both tables)
    # import again: same asset id; type Volume; link renamed to hasVolume; change_log has action "retyped"

def test_a_second_import_of_a_converted_volume_changes_nothing(db_session, asset_types): ...

def test_a_uc_function_stays_a_system_asset(db_session, asset_types): ...
    # UC_FUNCTION at main.raw.fn keeps type System and hasPart

def test_volume_imports_as_system_until_the_type_is_seeded(db_session, asset_types): ...
    # delete the Volume AssetTypeDb row first; import -> System/hasPart, no error
```

- [ ] **Step 2: Run them to verify they fail.** Run `hatch -e dev run pytest src/tests/unit/test_volume_import.py -q`. Expected: failures on type "System" != "Volume".
- [ ] **Step 3: Implement.**
  - `_TYPE_MAP[UC_VOLUME] = (VOLUME_ASSET_TYPE, "hasVolume")`.
  - `_relationship_type_for`: `VOLUME_ASSET_TYPE: "hasVolume"`.
  - Add `"hasVolume"` to `_HIERARCHICAL_RELS`.
  - Generalize the metric-view legacy match into a table:

    ```python
    _LEGACY_TYPES = {METRIC_VIEW_ASSET_TYPE: ("View", None), VOLUME_ASSET_TYPE: ("System", ("hasPart", "hasVolume"))}
    ```

    Use it in both the preview match (`:759`) and the retype branch (`:405`), so it keeps the existing savepoint and error handling. When the target type isn't seeded, fall back to the legacy type name, as metric views do.
- [ ] **Step 4: Run tests to verify they pass.** Run the new file plus `test_metric_view_asset_type.py` and `test_schema_import_runs.py`. Expected: all pass.
- [ ] **Step 5: Commit point:** "Import Unity Catalog volumes as Volume assets".

---

### Task 4: Branch marker on assets and connections

**Files:**
- Modify: `src/backend/src/models/assets.py` (`DataBranch`; `data_branch` on `AssetBase`, `AssetUpdate`, `AssetSummary`)
- Modify: `src/backend/src/db_models/assets.py:45`, `src/backend/src/db_models/connections.py:19`
- Modify: `src/backend/src/models/connections.py` (Base/Update/Response)
- Create: `src/backend/alembic/versions/d1_add_data_branch.py` (revision `d1_data_branch`, down_revision `c5_merge_cv2_b8`; check with `hatch -e dev run alembic heads` first)
- Modify: `src/backend/src/controller/schema_import_manager.py` (`_create_asset_from_item:930-944`, `_resolve_system_asset:650-660`)
- Modify: `src/frontend/src/components/common/asset-form-dialog.tsx`, `src/frontend/src/components/settings/connection-form-dialog.tsx`
- Test: `src/backend/src/tests/unit/test_data_branch.py` (new); `src/frontend/src/components/common/asset-form-dialog.branch.test.tsx` (new)

**Interfaces:**
- Produces:

  ```python
  class DataBranch(str, Enum): UC = "uc"; INTERNAL = "internal"; EXTERNAL = "external"
  ```

  - `AssetDb.data_branch: Optional[str]` (indexed); `ConnectionDb.data_branch: Optional[str]`.
  - API field `data_branch` on assets (read/write) and on connections (read/write; allowed values `internal`/`external`).

**Rules (spec §New data model pieces; adjusted for the connectors that exist):**
- **Databricks connector:** every asset it creates gets `uc`. Its auto-created System asset gets none, so UC catalogs sit directly under Unity Catalog.
- **Other connectors** (Snowflake, BigQuery, Kafka, Power BI): every asset they create, including the System asset, gets the connection's `data_branch`, or none when it isn't set. The admin picks Internal or External per connection. That covers "your own Snowflake vs someone else's".
- **Overrides:** a hand-set value is never overwritten by a re-import. Re-import stamps only assets whose `data_branch` is null.
- **No API or SFTP connectors exist yet.** Those assets are created by hand and get their branch in the asset form. *This is the plan's adjustment to "set automatically where the source makes it clear"; mention it to the owner at handoff.*

- [ ] **Step 1: Write failing backend tests**

```python
def test_assets_accept_and_return_a_data_branch(db_session): ...      # create with "external" -> summary.data_branch == "external"
def test_an_unknown_branch_is_rejected(): ...                         # AssetCreate(data_branch="cloud") raises ValidationError
def test_databricks_imports_are_uc_but_their_system_is_not(db_session, asset_types): ...
def test_other_connector_imports_take_the_connection_branch(db_session, asset_types): ...  # snowflake connection data_branch="internal"
def test_reimport_keeps_a_hand_set_branch(db_session, asset_types): ...
def test_the_migration_adds_both_columns(): ...  # run alembic upgrade head --sql (offline) and assert both ADD COLUMN data_branch statements appear
```

- [ ] **Step 2: Run them to verify they fail.** Run `hatch -e dev run pytest src/tests/unit/test_data_branch.py -q`. Expected: failures (unknown field).
- [ ] **Step 3: Implement** the models, columns, migration (`op.add_column` plus an index on `assets.data_branch`, and a downgrade), and importer stamping.
- [ ] **Step 4: Frontend test** `asset-form-dialog.branch.test.tsx`. Assert that:
  - the form shows a "Branch" select with options Unity Catalog / Internal / External / Not set;
  - saving sends `data_branch`;
  - the connection form shows Internal / External / Not set.
- [ ] **Step 5: Implement the two selects** in the existing shadcn forms (a small field, no restyle). Run `npx vitest run src/components/common src/components/settings`. Expected: pass.
- [ ] **Step 6: Run** `hatch -e dev run pytest src/tests/unit -q`. Expected: pass. The migration applies at the next backend start, which the owner runs.
- [ ] **Step 7: Commit point:** "Mark assets and connections with their data branch".

---

### Task 5: Asset tree endpoint and node-scoped asset list

**Files:**
- Create: `src/backend/src/models/asset_tree.py`, `src/backend/src/controller/asset_tree.py`
- Modify: `src/backend/src/routes/assets_routes.py` (new route **before** `/{asset_id}`; `node` param on `get_all_assets`)
- Modify: `src/backend/src/repositories/assets_repository.py:84` (`_apply_filters` gains `scope_subquery`)
- Test: `src/backend/src/tests/unit/test_asset_tree.py` (new)

**Interfaces:**
- Consumes: `DataBranch` (Task 4), `VOLUME_ASSET_TYPE` (Task 2), `resolve_accessible_asset_ids` (existing).
- Produces:

```python
class AssetTreeNode(BaseModel):
    key: str                 # node key, see grammar below
    label: str
    kind: Literal["branch", "type", "asset", "group"]
    asset_id: Optional[UUID] = None
    asset_type_name: Optional[str] = None
    count: int               # assets in this node's scope the user can read
    has_children: bool

# controller/asset_tree.py
TREE_RELS = frozenset({"hasCatalog", "hasSchema", "hasTable", "hasView", "hasVolume", "hasPart"})
CONTAINER_TYPES = ("System", "Catalog", "Schema")
SCHEMA_GROUP_ORDER = ("Table", "View", "Volume", "Metric View")
EXCLUDED_FROM_SCOPE = frozenset({"Column", "Logical Attribute"})
MAX_DEPTH = 12
def parse_node_key(key: str) -> NodeKey  # raises ValueError on bad keys -> 400
def scope_subquery(db, key: str) -> Select  # SELECT assets.id for the node and everything under it
def tree_children(db, parent: Optional[str], restrict_to_ids: Optional[List[UUID]]) -> List[AssetTreeNode]
```

**Node key grammar and meaning:**

| Key | Scope (what the table lists) | Children |
|---|---|---|
| *(no parent)* | — | `branch:uc`, `branch:internal`, `branch:external`; `branch:unsorted` only when its count > 0 |
| `branch:<uc\|internal\|external>` | assets with that `data_branch` | assets in the branch with no `TREE_RELS` parent in the same branch, limited to `CONTAINER_TYPES` |
| `branch:unsorted` | data-category assets with null `data_branch` | none |
| `asset:<uuid>` | the asset plus `TREE_RELS` descendants (recursive CTE, UNION, depth ≤ `MAX_DEPTH`) | Schema: one `group:` per type present, in `SCHEMA_GROUP_ORDER`. Others: child assets of `CONTAINER_TYPES` |
| `group:<schema uuid>:<Type>` | the schema's direct children of that type | none |
| `category:<analytics\|integration\|system\|custom>` | assets of types in that category (used only as a parent) | one `type:` node per asset type in the category, sorted by name |
| `type:<Type name>` | assets of that type | none |

Every scope excludes `EXCLUDED_FROM_SCOPE`. Counts are `count(scope ∩ restrict_to_ids)`. For scoped users (`restrict_to_ids` not None), `asset`/`group` children with count 0 are omitted. Children are sorted by label (case-insensitive), except for groups.

**Routes:**
- `GET /api/assets/tree?parent=<key>` returns `List[AssetTreeNode]`. It uses the same READ_WRITE / scoped logic as `get_all_assets` (factor out `_restrict_ids_for(request, db, current_user, manager)`), and returns 400 on a bad key.
- `GET /api/assets?node=<key>` adds `scope_subquery` to the existing filters.

- [ ] **Step 1: Write failing tests** (build a fixture graph: UC catalog `insights` → schemas `referrals` (2 tables, 1 view, 1 volume, columns) and `catalog_graph`; a Snowflake System marked `internal` with one catalog under it; one data-category asset with no branch):

```python
def test_root_lists_the_three_branches_and_unsorted_when_present(db_session, graph): ...
def test_uc_children_are_catalogs_not_the_system(db_session, graph): ...
def test_internal_children_are_source_systems(db_session, graph): ...
def test_a_schema_has_type_groups_in_order_with_counts(db_session, graph):
    nodes = tree_children(db_session, f"asset:{graph.referrals}", None)
    assert [(n.label, n.count) for n in nodes] == [("Table", 2), ("View", 1), ("Volume", 1)]
def test_node_scope_is_the_node_and_everything_under_it_without_columns(db_session, graph): ...
def test_node_scope_is_a_subquery_and_pages(db_session, graph): ...   # isinstance(scope_subquery(...), Select); list ?node with limit=1 returns 1 item, total 5
def test_scoped_user_sees_only_nodes_with_readable_assets(db_session, graph): ...  # restrict to one table -> only its catalog/schema/group, count 1
def test_cycle_in_hierarchy_terminates(db_session, graph): ...        # add table --hasSchema--> catalog; scope still returns, no duplicates
def test_category_children_are_types(db_session, graph): ...
def test_a_bad_key_is_rejected(): ...                                 # parse_node_key("asset:not-a-uuid") raises ValueError
def test_tree_route_returns_400_for_a_bad_key(client): ...
```

- [ ] **Step 2: Run them to verify they fail.** Run `hatch -e dev run pytest src/tests/unit/test_asset_tree.py -q`. Expected: ImportError.
- [ ] **Step 3: Implement** the models, controller and routes. The descendant CTE is a recursive `select(...).cte(recursive=True)` over `AssetRelationshipDb` joined on `relationship_type.in_(TREE_RELS)`, with a depth column. Counts use one grouped query per children list, not one query per node.
- [ ] **Step 4: Run tests to verify they pass,** plus `src/tests/unit/test_data_product_asset_scoping.py`. Expected: pass.
- [ ] **Step 5: Commit point:** "Add the asset tree endpoint and node-scoped listing".

---

### Task 6: Owner, concepts and concept filter on the asset list

**Files:**
- Modify: `src/backend/src/models/assets.py` (`AssetSummary`), `src/backend/src/controller/assets_manager.py:329-370`, `src/backend/src/routes/assets_routes.py:331`
- Test: `src/backend/src/tests/unit/test_asset_list_owner_concepts.py` (new)

**Interfaces:** Produces these `AssetSummary` fields, which Task 10 reads:

```python
owner_display: Optional[str] = None   # first active business owner by assigned_at: user_name or user_email
owner_extra_count: int = 0            # other active owners
concepts: List[str] = []              # semantic-link labels (fallback: IRI local name), sorted
column_count: Optional[int] = None    # from properties.schema.column_count when present
```

`get_all_assets(..., concept_iri: Optional[str] = None)` limits results to assets with an `EntitySemanticLinkDb` of `entity_type="asset"` and that IRI. The route param is `concept_iri`.

- [ ] **Step 1: Write failing tests:** two owners → `owner_display` is the earlier one and `owner_extra_count == 1`; a removed owner is ignored; concepts come from links; `concept_iri` filters; a page of 50 assets loads owners and links in **two** extra queries (count via a SQLAlchemy `before_cursor_execute` listener).
- [ ] **Step 2: Run them to verify they fail.** Expected: missing fields.
- [ ] **Step 3: Implement** the batch loads next to the existing domain batch load (`assets_manager.py:352`): `BusinessOwnerDb` with `object_type="asset"` and `is_active`; `EntitySemanticLinkDb` with `entity_type="asset"`.
- [ ] **Step 4: Run tests to verify they pass.** Run the new file plus `src/tests/unit -k asset`.
- [ ] **Step 5: Commit point:** "Show owners and concepts in asset lists".

---

### Task 7: Genie One client and event parsing

**Files:** Create `src/backend/src/common/helix_client.py`. Test: `src/backend/src/tests/unit/test_helix_client.py`.

**Interfaces:** Produces:

```python
ONECHAT_PATH = "/api/2.0/data-rooms/tools/onechat/responses"
CONTEXT_MAX_CHARS = 500

@dataclass(frozen=True)
class HelixEvent:
    kind: Literal["conversation", "text", "sql", "result", "done", "error"]
    data: dict   # conversation: {conversation_id}; text: {text}; sql: {sql}; result: {columns, rows, total, warehouse_id}; error: {message}

def build_request(question: str, *, context: Optional[str], conversation_id: Optional[str]) -> dict
def parse_events(lines: Iterable[str]) -> Iterator[HelixEvent]
async def stream_answer(host: str, auth_headers: dict, body: dict, *, timeout_s: float = 600) -> AsyncIterator[HelixEvent]
```

- `build_request` puts the context first, as plain text: `"The user is looking at: <context>\n\n<question>"`. The context is stripped of newlines and cut to `CONTEXT_MAX_CHARS`. The body is `{"input":[{"type":"message","role":"user","content":…}], "enable_viz": False, "source": "apfm_helix"}`, plus `"conversationId"` when given.
- `parse_events` accepts both bare JSON lines and SSE `data:` lines, skips blanks and non-JSON lines, and maps:
  - `response.created` → `conversation`;
  - a `function_call` item with `metadata.query` → `sql`;
  - a `function_call_output` item with `metadata.result_data` → `result` (columns, preview rows, `total_row_count`, `warehouse_id`);
  - a `message` item's `output_text` parts → `text` (once per item, on `.done`);
  - `response.done` → `done`;
  - an event with `type` containing `error`, or `response.status == "failed"` → `error`.
- `stream_answer` uses `httpx.AsyncClient().stream("POST", …)`, yields parsed events, and turns HTTP ≥ 400, timeouts and dropped connections into one `error` event: "Genie One didn't answer (HTTP 403)." It never raises.

- [ ] **Step 1: Write failing tests,** using the event shapes recorded in Task 1's "Known already":
  - `test_request_puts_plain_context_first`
  - `test_follow_up_sends_conversation_id`
  - `test_parses_conversation_sql_result_text_done_in_order`
  - `test_sse_data_lines_are_accepted`
  - `test_error_event_becomes_error`
  - `test_http_403_becomes_one_error_event` (use `httpx.MockTransport`)
  - `test_dropped_stream_ends_with_error`
- [ ] **Step 2: Run them to verify they fail.** Run `hatch -e dev run pytest src/tests/unit/test_helix_client.py -q`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass.**
- [ ] **Step 5: Commit point:** "Add the Genie One client for Helix".

---

### Task 8: Helix route, identity modes and settings

**Files:**
- Modify: `src/backend/src/common/config.py` (after line 197), `src/backend/src/controller/settings_manager.py:1352` and `:1631`, `src/backend/src/app.py:491`, `src/app.yaml`
- Create: `src/backend/src/routes/helix_routes.py`
- Test: `src/backend/src/tests/unit/test_helix_routes.py`

**Interfaces:**
- Consumes: Task 7's functions.
- Produces:

```python
# config.py
HELIX_ENABLED: bool = Field(False, env="HELIX_ENABLED")
HELIX_IDENTITY_MODE: Literal["user", "shared"] = Field("user", env="HELIX_IDENTITY_MODE")
HELIX_SHARED_CLIENT_ID: Optional[str] = Field(None, env="HELIX_SHARED_CLIENT_ID")
HELIX_SHARED_CLIENT_SECRET: Optional[str] = Field(None, env="HELIX_SHARED_CLIENT_SECRET")

# helix_routes.py
class HelixAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    context: Optional[str] = None
    conversation_id: Optional[str] = Field(None, pattern=r"^[A-Za-z0-9_-]{1,64}$")

POST /api/helix/ask  -> text/event-stream; each frame `event: <kind>\ndata: <json>\n\n`
GET  /api/settings/helix -> {"enabled": bool, "mode": "user"|"shared", "workspace_host": str}
```

**Auth headers by mode:**
- **ENV=LOCAL:** `get_workspace_client(settings).config.authenticate()`, which is the developer's CLI profile.
- **`user`:** the `x-forwarded-access-token` header as a Bearer token. If it's missing, return 403 `{"detail": "Helix needs your Databricks sign-in."}` before streaming. There's no fallback, even when `OBO_ALLOW_SP_FALLBACK` is set.
- **`shared`:** `WorkspaceClient(host=…, client_id=HELIX_SHARED_CLIENT_ID, client_secret=HELIX_SHARED_CLIENT_SECRET).config.authenticate()`, cached. If either value is missing, return 503 "Helix's shared identity isn't configured."

**Other route behaviour:**
- **Disabled:** when `HELIX_ENABLED` is false, both routes return 404.
- **Feature permission:** none. Any signed-in user can ask, because answers are limited by the identity's own Databricks access.
- **Audit:** each ask logs `feature="helix"`, `action="ASK"` with the mode and conversation id, never the question text.
- **Defaults:** set the `HELIX_IDENTITY_MODE` default in `app.yaml` from Task 1's notes. Add commented secret entries for the shared client.

- [ ] **Step 1: Write failing tests:**
  - `test_disabled_returns_404`
  - `test_user_mode_without_token_is_403_and_never_calls_genie`
  - `test_user_mode_ignores_sp_fallback_setting`
  - `test_user_mode_streams_events_as_sse_frames` (patch `stream_answer`)
  - `test_shared_mode_uses_the_shared_principal`
  - `test_shared_mode_unconfigured_is_503`
  - `test_context_is_capped_and_plain` (the body passed to `stream_answer` has ≤ 500 context characters and no newlines)
  - `test_bad_conversation_id_is_422`
  - `test_settings_endpoint_reports_mode_and_host`
  - `test_put_settings_toggles_helix_enabled`
- [ ] **Step 2: Run them to verify they fail.** Run `hatch -e dev run pytest src/tests/unit/test_helix_routes.py -q`.
- [ ] **Step 3: Implement.** Register in `app.py`; handle `helix_enabled` in `settings_manager` get/update, mirroring `llm_enabled`.
- [ ] **Step 4: Run** the new tests and `src/tests/unit -q`. Expected: pass.
- [ ] **Step 5: Commit point:** "Add Ask Helix backed by Genie One".

---

### Task 9: Mantine foundation and shell

**Files:**
- Modify: `src/frontend/package.json` (`@mantine/core@8.3.18`, `@mantine/hooks@8.3.18`; dev `postcss-preset-mantine`, `postcss-simple-vars`), `postcss.config.cjs`, `src/index.tsx`, `src/index.css`
- Create: `src/mantine/theme.ts`, `provider.tsx`, `layers.css`, `shell/*` (see the file map)
- Modify: `src/components/layout/layout.tsx`, `src/components/settings/settings-layout.tsx`, `src/test/setup.ts`, `src/test/utils.tsx`, `src/i18n/config.ts`
- Create: `src/i18n/locales/en/shell.json`
- Test: `src/mantine/shell/nav-config.test.ts`, `src/mantine/shell/app-shell.test.tsx`, `tests/e2e/unmigrated-screens.spec.ts` (Playwright)

**Interfaces:**

```ts
// nav-config.ts
export type NavGroupId = 'Discover' | 'Build' | 'Govern' | 'Deploy' | 'Settings';
export interface NavItem { id: string; labelKey: string; path?: string; permissionId: string; icon: LucideIcon; children?: NavItem[] }
export interface NavSection { titleKey?: string; items: NavItem[] }      // Settings uses titled sections
export const NAV: Record<NavGroupId, NavSection[]>;
export function visibleNav(has: (permissionId: string) => boolean): Record<NavGroupId, NavSection[]>; // drops items without access, parents whose children are all hidden, and empty sections and groups
export function activeLocation(pathname: string): { group: NavGroupId; itemId: string; childId?: string } | null; // longest path prefix wins

// use-shell-store.ts (zustand + persist, key 'apfm-shell')
{ openGroup: NavGroupId | null; pinned: boolean; expanded: string[]; actions: { toggleGroup(g), setPinned(b), toggleExpanded(id), afterNavigate() } }
// clicking the open group closes the panel; afterNavigate closes it when !pinned
```

**Menu contents** (from the approved prototype). Ids and paths come from `config/features.ts`; settings paths come from `settings-layout.tsx:45-96`; permission ids are copied from those files.
- **Discover:** Marketplace, Search, Data Catalog.
- **Build:**
  - Assets → Explorer `/assets`, Asset types `/settings/asset-types`, Schema importer `/schema-importer`
  - Concepts → Browser `/concepts/browser`, Search `/concepts/search`, Hierarchy `/concepts/hierarchy`, Enrich `/concepts/enrich`, Mapping `/concepts/mapping`, Import `/concepts/import`
  - Contracts
  - Products → All products `/data-products`, My products `/my-products`
  - My Requests
- **Govern:** Compliance, Master Data, Asset Reviews, Security Features, Entitlements → Entitlements `/entitlements`, Entitlements Sync `/entitlements-sync`.
- **Deploy:** Estate Manager, Catalog Commander.
- **Settings:**
  - **Platform:** General; Helix & LLM `/settings/helix`; Appearance `/settings/ui`; Search; Connectors → Git, MCP tokens `/settings/mcp`, Delivery methods `/settings/delivery-methods`; Jobs.
  - **Organization:** Data domains, Teams, Projects, Roles → App roles `/settings/roles`, Business roles `/settings/business-roles`; Directory.
  - **Semantics:** Semantic models, Asset types, Tags, Levels → Certification, Maturity.
  - **Process:** Workflows, Delivery `/settings/delivery`, Audit log `/settings/audit`.

  "Roles" and "Levels" have no page of their own: clicking them only expands. Helix & LLM uses permission `settings-general`.

**Shell layout:**
- **Top bar** (44px): brand `<short name> · Ontos` in the display font; search (reuse the existing header search component's behaviour, Mantine-styled); the `HelixButton` slot (Task 11); avatar.
- **Strip** (52px): the four groups at the top and Settings at the bottom.
- **Group panel** (200px).
- **Main area:** the health banners stay as they are. Routes in `FULL_BLEED_ROUTES = ['/assets']` (exact match) render with no padding and no breadcrumbs; all others keep the existing `p-6` and `Breadcrumbs`.
- **Old pieces:** the old `Sidebar`/`Header` are no longer rendered. The "Ask Ontos" copilot tab is kept but hidden while Helix is open *(plan call)*. Inside the new shell, `SettingsLayout` renders only its outlet, without its own left nav *(plan call: the Settings group panel replaces it)*.

**Styles:**
- **Mantine CSS:** import `@mantine/core/styles.layer.css`.
- **Layer order** is declared in `mantine/layers.css`, imported first: `@layer tw-base, mantine, tw-app;`. Tailwind's `base` goes into `tw-base`, so its preflight can't override Mantine. Unmigrated screens must look unchanged; the builder picks the mechanism, and the Playwright check below is the acceptance test.
- **Theme:** `primaryColor: 'aura'`, a 10-shade scale built around #4F6AC5 at index 6; `fontFamily` and `headings.fontFamily` from Global Constraints; `fontSizes.sm = 12px`; `defaultRadius: 'sm'` (4px); component defaults with `size: 'xs'`, where control height lands at 26–28px.

- [ ] **Step 1: Write failing unit tests**
  - `nav-config.test.ts`:
    - every `path` in `NAV` is a route in `app.tsx`; parse the route list from the file text, or export it;
    - `visibleNav` hides Settings → Roles when both `settings-roles` and `business-roles` are denied;
    - it hides the whole Settings group when every settings permission is denied;
    - `activeLocation('/settings/business-roles')` returns `{group: 'Settings', itemId: 'roles', childId: 'business-roles'}`;
    - `activeLocation('/assets')` returns the Explorer under Build.
  - `app-shell.test.tsx` (using `renderWithMantine`):
    - clicking Build opens a panel listing "Assets", and clicking Build again closes it;
    - with pin off, navigating closes the panel;
    - the pin choice survives a remount (localStorage);
    - the active item has `aria-current="page"`.
- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/mantine/shell`.
- [ ] **Step 3: Install and wire.** Run `npm i @mantine/core@8.3.18 @mantine/hooks@8.3.18 && npm i -D postcss-preset-mantine postcss-simple-vars`. Then:
  - set up PostCSS following Mantine's Vite guide, keeping `tailwindcss` and `autoprefixer`;
  - add `MantineProvider` in `index.tsx`;
  - add `matchMedia` and `ResizeObserver` mocks to `test/setup.ts`, if they're missing;
  - add `renderWithMantine` (router + MantineProvider + TooltipProvider) to `test/utils.tsx`.
- [ ] **Step 4: Implement** the shell, and switch `layout.tsx` to it.
- [ ] **Step 5: Run unit tests.** Run `npx vitest run`. Expected: all pass, including the existing `layout.health.test.tsx`; update its queries only where they relied on the old header markup.
- [ ] **Step 6: Unmigrated-screens check.** First, on the base commit, record baselines with `npx playwright test tests/e2e/unmigrated-screens.spec.ts --update-snapshots`. The spec screenshots the main content area (excluding the shell) of `/data-products`, `/data-contracts`, `/settings/general` and `/compliance` against the dev servers, with network mocked using fixtures. Then, on this task's commit, run it without the flag. Expected: pass at `maxDiffPixelRatio: 0.01`. Run `npm run type-check` and `npm run lint`. Expected: clean.
- [ ] **Step 7: Commit point:** "Add the Mantine foundation and the new app shell".

---

### Task 10: Asset Explorer page

**Files:**
- Create: `src/frontend/src/mantine/asset-explorer/{api.ts,asset-tree.tsx,asset-table.tsx,details-panel.tsx,explorer-page.tsx}`, `src/i18n/locales/en/asset-explorer.json`
- Modify: `src/frontend/src/app.tsx:195` (`/assets` → `ExplorerPage`; `views/asset-explorer.tsx` is no longer routed but stays in the tree until a later cleanup phase)
- Test: `src/frontend/src/mantine/asset-explorer/explorer-page.test.tsx`, `asset-tree.test.tsx`

**Interfaces:**
- Consumes: `GET /api/assets/tree`, `GET /api/assets?node=&name=&asset_type_names=&status=&concept_iri=&skip=&limit=` (Tasks 5–6); `AssetSummary` fields from Task 6; `useHelixStore().setContext` (Task 11; until then, a no-op import guarded by a feature check is fine).
- Produces:

```ts
export interface TreeNode { key: string; label: string; kind: 'branch'|'type'|'asset'|'group'; assetId?: string; assetTypeName?: string; count: number; hasChildren: boolean }
export function fetchTreeChildren(parent?: string): Promise<TreeNode[]>; // maps the API's snake_case fields to these names
export function fetchAssets(q: { node: string; name?: string; types?: string[]; status?: string; conceptIri?: string; skip: number; limit: number }): Promise<{ items: AssetSummary[]; total: number }>;
```

**Behaviour (spec §Asset Explorer, prototype `prototype-final.html`):**
- **Tree sections:**
  - **Data Assets:** root children, with labels "Unity Catalog", "Internal", "External", "Unsorted".
  - **Analytics, Integration, System, Custom:** `category:<c>` children.
- **Tree rows:** Mantine `Tree` + `useTree`, rows 24px with chevron, icon, name and right-aligned count. Children load on first expand and are cached in component state. Selection uses the accent-subtle background and a 2px accent bar.
- **Initial state:** select `branch:uc` and expand it.
- **Main area:**
  - breadcrumb of the selected node's ancestors;
  - header: node label, a type badge (asset nodes) and status badge, plus a "New asset" button that opens the existing `AssetFormDialog`, preset to the selected node's branch;
  - filter bar: text filter (debounced 250ms → `name`); Type and Status selects; a Concept select loaded from the concepts of assets on the current page plus search;
  - table: 28px rows; columns Name (monospace), Type, Owner (`owner_display` + "+N"), Status (dot: active #277153, draft #B67F14, deprecated #ADA899, archived #D41C16), Concepts, Updated (relative); server paging at 50 per page.
- **Details panel** (right, 280px): opened by selecting a row. Shows Type, Full name (`location`), Owner, Columns (`column_count`), Concepts, Domain (primary domain name), Updated, Description, and an "Open full page" link to `/assets/:id`. It's hidden while Helix is open and comes back on close.
- **Helix context:** on selection change, call `setContext(location ?? name)` for a row, or the node label for a node.
- **Empty and error states:** a node with no assets shows "Nothing here yet" in the table body. A failed load shows an inline error with Retry. Tree loading shows a 24px skeleton row.

- [ ] **Step 1: Write failing tests** (mock fetch):
  - the tree shows Unity Catalog with its count;
  - expanding loads children once;
  - selecting a schema node lists its assets and calls `/api/assets?node=asset:<id>`;
  - the filter debounces into `name`;
  - a row click opens details with the "Open full page" link;
  - an empty node shows the empty state;
  - a failed fetch shows Retry, and Retry refetches.
- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/mantine/asset-explorer`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass;** then run `npm run type-check` and `npx vitest run`.
- [ ] **Step 5: Commit point:** "Rebuild the Asset Explorer in Mantine with the asset tree".

---

### Task 11: Ask Helix panel and settings page

**Files:**
- Create: `src/frontend/src/mantine/helix/{helix-stream.ts,helix-store.ts,helix-markdown.tsx,helix-panel.tsx,helix-button.tsx}`, `src/frontend/src/mantine/settings/helix-settings.tsx`, `src/i18n/locales/en/helix.json`
- Modify: `src/frontend/src/mantine/shell/app-shell.tsx` (mount the button and panel), `src/frontend/src/app.tsx` (`/settings/helix` under `SettingsLayout`)
- Test: `src/frontend/src/mantine/helix/helix-stream.test.ts`, `helix-panel.test.tsx`, `helix-markdown.test.tsx`

**Interfaces:**
- Consumes: `POST /api/helix/ask`, `GET /api/settings/helix`, `PUT /api/settings` with `helix_enabled` (Task 8); Task 1's notes for the conversation URL pattern.
- Produces:

```ts
export type HelixEvent = { kind: 'conversation'|'text'|'sql'|'result'|'done'|'error'; data: any };
export async function* askHelix(body: { question: string; context?: string; conversation_id?: string }, signal: AbortSignal): AsyncGenerator<HelixEvent>; // fetch + ReadableStream SSE parser; non-2xx -> one error event with the server's detail

// helix-store.ts (zustand, session only — no persist)
{ isOpen: boolean; context: string | null; conversationId: string | null; turns: Turn[]; busy: boolean;
  actions: { open(): void; close(): void; setContext(c: string | null): void; clearContext(): void; ask(q: string): Promise<void>; newConversation(): void } }
type Turn = { question: string; text: string; sql: string[]; result?: { columns: string[]; rows: string[][]; total?: string }; error?: string };
```

**Behaviour (spec §Ask Helix, prototype):**
- **Button:** "Ask Helix" in the top bar: navy, with a conic multicolour mark. It's rendered only when `/api/settings/helix` says enabled.
- **Panel** (300px, right):
  - header "Helix · Genie One", plus "Answering as APFM Helix, not as you" when `mode === 'shared'`, and a close button;
  - a removable context chip;
  - suggestion chips when there are no turns yet: "What's in this?", "Who uses this most?", "Show recent changes";
  - message list: user bubbles in navy; answers as markdown, a collapsible "Show SQL", and a results preview (up to 5 rows, "N rows" when `total` is greater);
  - "Open in Databricks", only when Task 1 found a URL pattern;
  - an input (Enter sends, Shift+Enter adds a newline) and a "New conversation" link.
- **While busy:** the input is disabled and a Stop button aborts the stream. On an error, the partial text stays, the error shows in `--critical`, and the input is enabled again.
- **Follow-ups:** later questions send `conversation_id`.
- **Markdown:** `react-markdown` with `skipHtml`, no `rehype-raw`, and a link renderer that keeps a link only when its host equals `workspace_host`; other links show as plain text.
- **Settings page** "Helix & LLM":
  - a Helix on/off switch (`PUT /api/settings {helix_enabled}`);
  - identity mode, read-only, with one line explaining each mode;
  - the existing LLM enabled switch and endpoint field, writing the same keys as General settings, which stay where they are.

- [ ] **Step 1: Write failing tests:**
  - `helix-stream.test.ts`:
    - parses frames split across chunks;
    - ignores comment lines;
    - non-2xx gives one error event with the detail.
  - `helix-panel.test.tsx`:
    - a suggestion chip asks with the context;
    - text streams into one answer;
    - "Show SQL" toggles;
    - a follow-up sends `conversation_id`;
    - "New conversation" clears it;
    - shows an error and re-enables input when the stream fails;
    - the shared-mode label shows only in shared mode;
    - removing the chip sends no context;
    - opening Helix hides the explorer's details panel and closing brings it back (render `ExplorerPage` inside the shell).
  - `helix-markdown.test.tsx`: renders no raw HTML and drops foreign links (`<img onerror>` is absent; a `https://evil.example` link renders as text; a workspace-host link is an anchor).
- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/mantine/helix`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them to verify they pass;** then run `npm run type-check`, `npm run lint` and `npx vitest run`.
- [ ] **Step 5: Commit point:** "Add the Ask Helix panel and its settings page".

---

### Task 12: End-to-end check on local dev

**Files:** none new, unless a fix is needed (any fix goes back through the owning task's tests).

- [ ] **Step 1: Ask the owner to restart the backend.** Run `hatch -e dev run dev-backend`; Vite hot-reloads. Ask them to set `HELIX_ENABLED=true` in `src/backend/.env`. The migration from Task 4 runs at startup. Confirm with `hatch -e dev run alembic current`, which should show `d1_data_branch`.
- [ ] **Step 2: Convert existing volumes.** In the Schema Importer, re-import one UC schema that has volumes. In the explorer, check that Unity Catalog → that catalog → schema → Volumes lists them.
- [ ] **Step 3: Set one connection's branch.** For example, set a Snowflake connection, if present, to Internal. Re-import, and check that it appears under Internal → its System → catalogs. With no non-UC connection, create one asset by hand with Branch External and check that it appears under External.
- [ ] **Step 4: Ask Helix.** Select a table and ask "How many rows does this have?". Check, in the browser's network panel, that the answer streams. Check that Show SQL lists the query, and that a follow-up keeps the conversation.
- [ ] **Step 5: Run everything.** Run `hatch -e dev run pytest -q` (backend, full), and `npx vitest run && npm run type-check && npm run lint` (frontend). Report any failure by name. Compare against the five integration-test pollution failures already noted before this work: `test_audit_log_repository` ×4 and `test_logging_default`.
- [ ] **Step 6: Report to the owner.** Cover what was checked, screenshots of the explorer and Helix, the Task 1 decision (user or shared mode), and any `user_api_scopes` change that needs their confirmation before deploying to apfm-ontos.
