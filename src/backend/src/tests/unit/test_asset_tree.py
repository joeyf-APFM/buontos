"""The Asset Explorer tree: node keys, node scopes, children and counts."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import Select
from sqlalchemy.orm import Session

from src.controller.asset_tree import parse_node_key, scope_subquery, tree_children
from src.controller.assets_manager import assets_manager
from src.db_models.assets import AssetDb, AssetRelationshipDb, AssetTypeDb
from src.db_models.entity_relationships import EntityRelationshipDb
from src.app import app
from src.common import dependencies
from src.routes import assets_routes

TYPE_CATEGORIES = {
    "System": "system", "Catalog": "data", "Schema": "data", "Table": "data", "View": "data",
    "Volume": "data", "Metric View": "data", "Column": "data", "Dataset": "data",
    "Dashboard": "analytics", "Notebook": "analytics",
}


@pytest.fixture
def graph(db_session: Session):
    """UC catalog insights -> schemas referrals (2 tables, 1 view, 1 volume, columns) and
    catalog_graph; a Databricks System above insights (no branch); an internal Snowflake
    System with one catalog; one data-category asset with no branch; one dashboard."""
    types = {}
    for name, category in TYPE_CATEGORIES.items():
        existing = db_session.query(AssetTypeDb).filter_by(name=name).first()
        types[name] = existing or AssetTypeDb(name=name, category=category)
        db_session.add(types[name])
    db_session.flush()

    def asset(name, type_name, branch="uc"):
        a = AssetDb(id=uuid.uuid4(), name=name, asset_type_id=types[type_name].id,
                    status="active", data_branch=branch, location=f"{type_name}:{name}")
        db_session.add(a)
        return a

    type_names = {t.id: name for name, t in types.items()}

    def link(source, target, rel):
        # As SchemaImportManager.execute_import wires it: both tables, entity ids as strings.
        db_session.add(AssetRelationshipDb(source_asset_id=source.id, target_asset_id=target.id,
                                           relationship_type=rel))
        _entity_link(db_session, type_names[source.asset_type_id], source.id,
                     type_names[target.asset_type_id], target.id, rel)

    databricks = asset("Databricks", "System", branch=None)
    insights = asset("insights", "Catalog")
    referrals = asset("referrals", "Schema")
    catalog_graph = asset("catalog_graph", "Schema")
    leads = asset("leads", "Table")
    moves = asset("moves", "Table")
    lead_view = asset("lead_view", "View")
    raw_files = asset("raw_files", "Volume")
    lead_id = asset("lead_id", "Column")
    nodes = asset("nodes", "Table")
    snowflake = asset("Snowflake", "System", branch="internal")
    sf_catalog = asset("SF_DB", "Catalog", branch="internal")
    orphan = asset("loose_extract", "Dataset", branch=None)
    asset("Ops Dashboard", "Dashboard", branch=None)
    db_session.flush()

    link(databricks, insights, "hasCatalog")
    link(insights, referrals, "hasSchema")
    link(insights, catalog_graph, "hasSchema")
    link(referrals, leads, "hasTable")
    link(referrals, moves, "hasTable")
    link(referrals, lead_view, "hasView")
    link(referrals, raw_files, "hasVolume")
    link(leads, lead_id, "hasColumn")
    link(catalog_graph, nodes, "hasTable")
    link(snowflake, sf_catalog, "hasCatalog")
    db_session.flush()

    return SimpleNamespace(
        databricks=databricks.id, insights=insights.id, referrals=referrals.id,
        catalog_graph=catalog_graph.id, leads=leads.id, moves=moves.id, lead_view=lead_view.id,
        raw_files=raw_files.id, lead_id=lead_id.id, nodes=nodes.id, snowflake=snowflake.id,
        sf_catalog=sf_catalog.id, orphan=orphan.id,
    )


def _entity_link(db, source_type, source_id, target_type, target_id, rel):
    db.add(EntityRelationshipDb(source_type=source_type, source_id=str(source_id),
                                target_type=target_type, target_id=str(target_id),
                                relationship_type=rel))


def _scope_ids(db, key):
    return set(db.execute(scope_subquery(db, key)).scalars().all())


def test_root_lists_the_three_branches_and_unsorted_when_present(db_session, graph):
    nodes = tree_children(db_session, None, None)
    assert [(n.key, n.label, n.kind, n.has_children) for n in nodes] == [
        ("branch:uc", "Unity Catalog", "branch", True),
        ("branch:internal", "Internal", "branch", True),
        ("branch:external", "External", "branch", False),
        ("branch:unsorted", "Unsorted", "branch", False),
    ]
    counts = {n.key: n.count for n in nodes}
    # uc: insights, 2 schemas, 3 tables, view, volume (column excluded)
    assert counts == {"branch:uc": 8, "branch:internal": 2, "branch:external": 0, "branch:unsorted": 1}


def test_root_omits_unsorted_when_empty(db_session, graph):
    db_session.query(AssetDb).filter(AssetDb.id == graph.orphan).delete()
    db_session.flush()
    assert [n.key for n in tree_children(db_session, None, None)] == [
        "branch:uc", "branch:internal", "branch:external",
    ]


def test_uc_children_are_catalogs_not_the_system(db_session, graph):
    nodes = tree_children(db_session, "branch:uc", None)
    assert [(n.key, n.label, n.kind, n.asset_type_name, n.count, n.has_children) for n in nodes] == [
        (f"asset:{graph.insights}", "insights", "asset", "Catalog", 7, True),
    ]
    assert nodes[0].asset_id == graph.insights


def test_internal_children_are_source_systems(db_session, graph):
    nodes = tree_children(db_session, "branch:internal", None)
    assert [(n.label, n.asset_type_name, n.count, n.has_children) for n in nodes] == [
        ("Snowflake", "System", 1, True),
    ]
    assert [n.label for n in tree_children(db_session, f"asset:{graph.snowflake}", None)] == ["SF_DB"]


def test_unsorted_and_leaf_nodes_have_no_children(db_session, graph):
    for key in ("branch:unsorted", f"group:{graph.referrals}:Table", "type:Dashboard",
                f"asset:{graph.lead_id}", f"asset:{graph.moves}", f"asset:{graph.raw_files}"):
        assert tree_children(db_session, key, None) == []


def test_a_catalog_lists_its_schemas_sorted_with_counts(db_session, graph):
    nodes = tree_children(db_session, f"asset:{graph.insights}", None)
    # What is under each schema, not the schema itself.
    assert [(n.label, n.count, n.has_children) for n in nodes] == [
        ("catalog_graph", 1, True), ("referrals", 4, True),
    ]


def test_an_empty_schema_counts_zero_and_has_no_children(db_session, graph):
    schema_type = db_session.query(AssetTypeDb).filter_by(name="Schema").one()
    empty = AssetDb(id=uuid.uuid4(), name="empty", asset_type_id=schema_type.id, status="active",
                    data_branch="uc", location="Schema:empty")
    db_session.add(empty)
    db_session.flush()
    _entity_link(db_session, "Catalog", graph.insights, "Schema", empty.id, "hasSchema")
    db_session.flush()

    nodes = {n.label: n for n in tree_children(db_session, f"asset:{graph.insights}", None)}
    assert (nodes["empty"].count, nodes["empty"].has_children) == (0, False)
    assert tree_children(db_session, f"asset:{empty.id}", None) == []


def test_a_schema_lists_its_tables_views_and_volumes_by_name(db_session, graph):
    nodes = tree_children(db_session, f"asset:{graph.referrals}", None)
    assert [(n.key, n.label, n.kind, n.asset_type_name, n.count, n.has_children) for n in nodes] == [
        (f"asset:{graph.lead_view}", "lead_view", "asset", "View", 0, False),
        (f"asset:{graph.leads}", "leads", "asset", "Table", 1, True),
        (f"asset:{graph.moves}", "moves", "asset", "Table", 0, False),
        (f"asset:{graph.raw_files}", "raw_files", "asset", "Volume", 0, False),
    ]


def test_a_table_lists_its_columns_as_leaves(db_session, graph):
    nodes = tree_children(db_session, f"asset:{graph.leads}", None)
    assert [(n.key, n.label, n.kind, n.asset_type_name, n.count, n.has_children) for n in nodes] == [
        (f"asset:{graph.lead_id}", "lead_id", "asset", "Column", 0, False),
    ]


def test_a_view_lists_its_columns_sorted_by_name(db_session, graph):
    column_type = db_session.query(AssetTypeDb).filter_by(name="Column").one()
    view = db_session.get(AssetDb, graph.lead_view)
    for name in ("Zip", "amount"):
        column = AssetDb(id=uuid.uuid4(), name=name, asset_type_id=column_type.id, status="active",
                         data_branch="uc", location=f"Column:{name}")
        db_session.add(column)
        db_session.flush()
        _entity_link(db_session, "View", view.id, "Column", column.id, "hasColumn")
    db_session.flush()

    assert [n.label for n in tree_children(db_session, f"asset:{graph.lead_view}", None)] == ["amount", "Zip"]
    schema = {n.label: n for n in tree_children(db_session, f"asset:{graph.referrals}", None)}
    assert (schema["lead_view"].count, schema["lead_view"].has_children) == (2, True)


def test_node_scope_is_the_node_and_everything_under_it_with_columns_only_under_tables(db_session, graph):
    assert _scope_ids(db_session, f"asset:{graph.referrals}") == {
        graph.referrals, graph.leads, graph.moves, graph.lead_view, graph.raw_files,
    }
    assert graph.lead_id not in _scope_ids(db_session, f"asset:{graph.databricks}")
    assert graph.lead_id not in _scope_ids(db_session, f"asset:{graph.insights}")
    assert _scope_ids(db_session, f"asset:{graph.leads}") == {graph.leads, graph.lead_id}
    assert _scope_ids(db_session, f"asset:{graph.moves}") == {graph.moves}
    assert _scope_ids(db_session, f"asset:{graph.lead_id}") == {graph.lead_id}
    assert _scope_ids(db_session, f"group:{graph.referrals}:Table") == {graph.leads, graph.moves}
    assert _scope_ids(db_session, "branch:internal") == {graph.snowflake, graph.sf_catalog}
    assert _scope_ids(db_session, "branch:unsorted") == {graph.orphan}
    assert len(_scope_ids(db_session, "type:Dashboard")) == 1
    assert len(_scope_ids(db_session, "category:analytics")) == 1


def test_node_scope_is_a_subquery_and_pages(db_session, graph):
    scope = scope_subquery(db_session, f"asset:{graph.referrals}")
    assert isinstance(scope, Select)
    page = assets_manager.get_all_assets(db_session, skip=0, limit=1, scope_subquery=scope)
    assert len(page.items) == 1
    assert page.total == 5
    # The node combines with the other filters.
    tables = assets_manager.get_all_assets(
        db_session, asset_type_names=["Table"], scope_subquery=scope,
    )
    assert {a.id for a in tables.items} == {graph.leads, graph.moves}


def test_scoped_user_sees_only_nodes_with_readable_assets(db_session, graph):
    only = [graph.leads]
    root = {n.key: n.count for n in tree_children(db_session, None, only)}
    assert root["branch:uc"] == 1
    assert root["branch:internal"] == 0
    assert {n.key: n.has_children for n in tree_children(db_session, None, only)} == {
        "branch:uc": True, "branch:internal": False, "branch:external": False,
    }

    uc = tree_children(db_session, "branch:uc", only)
    assert [(n.label, n.count, n.has_children) for n in uc] == [("insights", 1, True)]
    catalog = tree_children(db_session, f"asset:{graph.insights}", only)
    assert [(n.label, n.count, n.has_children) for n in catalog] == [("referrals", 1, True)]
    schema = tree_children(db_session, f"asset:{graph.referrals}", only)
    # leads' column isn't readable: leads is listed (it is readable) but counts 0, no children.
    assert [(n.label, n.count, n.has_children) for n in schema] == [("leads", 0, False)]
    assert tree_children(db_session, "branch:internal", only) == []


def test_a_scoped_user_sees_a_table_through_a_readable_column(db_session, graph):
    only = [graph.lead_id]
    schema = tree_children(db_session, f"asset:{graph.referrals}", only)
    assert [(n.label, n.count, n.has_children) for n in schema] == [("leads", 1, True)]
    table = tree_children(db_session, f"asset:{graph.leads}", only)
    assert [(n.label, n.count) for n in table] == [("lead_id", 0)]


def test_each_asset_count_is_its_scope_without_the_node(db_session, graph):
    for parent in ("branch:uc", f"asset:{graph.insights}", f"asset:{graph.referrals}", f"asset:{graph.leads}"):
        for node in tree_children(db_session, parent, None):
            scope = _scope_ids(db_session, node.key)
            assert node.asset_id in scope
            assert node.count == len(scope) - 1, node.label


def test_a_scoped_catalog_without_readable_grandchildren_has_no_children(db_session, graph):
    # The schema is readable but nothing under it is: it still shows, counting 0, and the
    # catalog (not readable, one readable asset under it) counts 1.
    only = [graph.catalog_graph]
    catalog = tree_children(db_session, f"asset:{graph.insights}", only)
    assert [(n.label, n.count, n.has_children) for n in catalog] == [("catalog_graph", 0, False)]
    assert [(n.label, n.count) for n in tree_children(db_session, "branch:uc", only)] == [("insights", 1)]


def test_the_hierarchy_comes_from_entity_relationships(db_session, graph):
    # Real imports leave the hierarchy only in entity_relationships.
    db_session.query(AssetRelationshipDb).delete()
    db_session.flush()

    assert [(n.label, n.count, n.has_children) for n in tree_children(db_session, "branch:uc", None)] == [
        ("insights", 7, True),
    ]
    assert [(n.label, n.count) for n in tree_children(db_session, f"asset:{graph.insights}", None)] == [
        ("catalog_graph", 1), ("referrals", 4),
    ]
    assert [(n.label, n.count) for n in tree_children(db_session, f"asset:{graph.referrals}", None)] == [
        ("lead_view", 0), ("leads", 1), ("moves", 0), ("raw_files", 0),
    ]
    assert [n.label for n in tree_children(db_session, f"asset:{graph.leads}", None)] == ["lead_id"]
    assert _scope_ids(db_session, f"group:{graph.referrals}:Table") == {graph.leads, graph.moves}
    assert _scope_ids(db_session, f"asset:{graph.referrals}") == {
        graph.referrals, graph.leads, graph.moves, graph.lead_view, graph.raw_files,
    }


def test_asset_relationships_alone_do_not_nest(db_session, graph):
    db_session.query(EntityRelationshipDb).delete()
    db_session.flush()

    labels = [n.label for n in tree_children(db_session, "branch:uc", None)]
    assert labels == ["catalog_graph", "insights", "referrals"]
    assert tree_children(db_session, f"asset:{graph.referrals}", None) == []


def test_edges_to_entities_that_are_not_assets_are_ignored(db_session, graph):
    # entity_relationships also links other entities (e.g. a Dataset) to assets.
    dataset_id = uuid.uuid4()
    _entity_link(db_session, "Dataset", dataset_id, "Schema", graph.referrals, "hasSchema")
    _entity_link(db_session, "Dataset", dataset_id, "Table", graph.leads, "hasTable")
    _entity_link(db_session, "Schema", graph.referrals, "Table", uuid.uuid4(), "hasTable")
    _entity_link(db_session, "Schema", graph.referrals, "Table", "not-a-uuid", "hasTable")
    db_session.flush()

    # referrals still has a tree parent (insights) and no extra table.
    assert [n.label for n in tree_children(db_session, "branch:uc", None)] == ["insights"]
    assert [n.label for n in tree_children(db_session, f"asset:{graph.referrals}", None)] == [
        "lead_view", "leads", "moves", "raw_files",
    ]
    assert _scope_ids(db_session, f"asset:{graph.referrals}") == {
        graph.referrals, graph.leads, graph.moves, graph.lead_view, graph.raw_files,
    }
    assert _scope_ids(db_session, f"asset:{dataset_id}") == set()


def test_a_schema_alone_in_its_branch_is_a_branch_root(db_session, graph):
    # The parent is in another branch: the schema has no tree parent in its own branch.
    nodes = tree_children(db_session, "branch:internal", None)
    assert [n.label for n in nodes] == ["Snowflake"]
    db_session.query(AssetDb).filter(AssetDb.id == graph.catalog_graph).update({"data_branch": "internal"})
    db_session.flush()
    assert [n.label for n in tree_children(db_session, "branch:internal", None)] == [
        "catalog_graph", "Snowflake",
    ]


def test_cycle_in_hierarchy_terminates(db_session, graph):
    _entity_link(db_session, "Table", graph.leads, "Catalog", graph.insights, "hasSchema")
    db_session.flush()
    ids = db_session.execute(scope_subquery(db_session, f"asset:{graph.referrals}")).scalars().all()
    assert len(ids) == len(set(ids))
    assert set(ids) == {
        graph.insights, graph.referrals, graph.catalog_graph, graph.leads, graph.moves,
        graph.lead_view, graph.raw_files, graph.nodes,
    }
    # catalog_graph still holds only nodes; referrals now reaches the whole catalog, not itself twice.
    assert [n.count for n in tree_children(db_session, f"asset:{graph.insights}", None)] == [1, 7]


def test_category_children_are_types(db_session, graph):
    nodes = tree_children(db_session, "category:analytics", None)
    by_name = {n.label: n for n in nodes}
    assert [n.label for n in nodes] == sorted(by_name, key=str.lower)
    assert {"Dashboard", "Notebook"} <= set(by_name)
    assert (by_name["Dashboard"].key, by_name["Dashboard"].kind, by_name["Dashboard"].count) == (
        "type:Dashboard", "type", 1,
    )
    assert by_name["Notebook"].count == 0
    assert not any(n.has_children for n in nodes)


@pytest.mark.parametrize("key", [
    "asset:not-a-uuid", "branch:elsewhere", "group:not-a-uuid:Table",
    f"group:{uuid.uuid4()}:Column", "category:data", "type:", "nonsense", "",
])
def test_a_bad_key_is_rejected(key):
    with pytest.raises(ValueError):
        parse_node_key(key)


def test_tree_route_returns_400_for_a_bad_key(api):
    assert api.get("/api/assets/tree", params={"parent": "asset:not-a-uuid"}).status_code == 400
    assert api.get("/api/assets", params={"node": "branch:elsewhere"}).status_code == 400


@pytest.fixture
def api(client, db_session):
    """The test client, with requests on the test's session.

    The routes' DBSessionDep uses ``src.common.dependencies.get_db``, which conftest doesn't
    override; its commit would persist this test's rows into the shared in-memory database.
    """
    def _test_session():
        yield db_session

    app.dependency_overrides[dependencies.get_db] = _test_session
    yield client
    app.dependency_overrides.pop(dependencies.get_db, None)


@pytest.fixture
def unscoped_user(monkeypatch):
    """The test client's user, given assets READ_WRITE."""
    monkeypatch.setattr(assets_routes, "_user_has_assets_feature", lambda request, user, level: True)


def test_tree_route_lists_children_and_list_route_scopes_to_a_node(api, graph, unscoped_user):
    root = api.get("/api/assets/tree")
    assert root.status_code == 200
    assert [(n["key"], n["count"]) for n in root.json()][:3] == [
        ("branch:uc", 8), ("branch:internal", 2), ("branch:external", 0),
    ]

    children = api.get("/api/assets/tree", params={"parent": f"asset:{graph.referrals}"})
    assert [(n["label"], n["kind"]) for n in children.json()] == [
        ("lead_view", "asset"), ("leads", "asset"), ("moves", "asset"), ("raw_files", "asset"),
    ]

    listed = api.get("/api/assets", params={"node": f"group:{graph.referrals}:Table"})
    assert listed.status_code == 200
    assert {a["name"] for a in listed.json()["items"]} == {"leads", "moves"}


def test_routes_fail_closed_for_a_scoped_user_without_data_products(api, graph):
    # The test client's user lacks assets READ_WRITE and the app has no DataProductsManager.
    root = api.get("/api/assets/tree").json()
    assert [n["count"] for n in root] == [0, 0, 0]
    assert api.get("/api/assets/tree", params={"parent": "branch:uc"}).json() == []
    assert api.get("/api/assets", params={"node": "branch:uc"}).json()["total"] == 0


# --- GET /api/assets?parent=: a node's direct children, as the tree lists them ---

def _tree_assets(api, key):
    nodes = api.get("/api/assets/tree", params={"parent": key}).json()
    return [(n["asset_id"], n["has_children"]) for n in nodes if n["kind"] == "asset"]


def _children(api, key, **params):
    response = api.get("/api/assets", params={"parent": key, "limit": 1000, **params})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("key", [
    "branch:uc", "branch:internal", "branch:external", "branch:unsorted",
    "asset:databricks", "asset:snowflake", "asset:insights", "asset:catalog_graph",
    "asset:referrals", "asset:leads", "asset:moves", "asset:lead_id", "asset:raw_files",
])
def test_parent_lists_the_tree_asset_children_in_order(api, graph, unscoped_user, key):
    kind, _, rest = key.partition(":")
    key = f"asset:{getattr(graph, rest)}" if kind == "asset" else key
    page = _children(api, key)
    expected = _tree_assets(api, key)
    assert [(a["id"], a["has_children"]) for a in page["items"]] == expected
    assert page["total"] == len(expected)


def test_parent_children_cover_every_listable_kind(api, graph, unscoped_user):
    names = lambda key: [a["name"] for a in _children(api, key)["items"]]  # noqa: E731
    assert names("branch:uc") == ["insights"]
    assert names(f"asset:{graph.insights}") == ["catalog_graph", "referrals"]
    assert names(f"asset:{graph.referrals}") == ["lead_view", "leads", "moves", "raw_files"]
    assert names(f"asset:{graph.leads}") == ["lead_id"]
    assert names(f"asset:{graph.lead_id}") == []


def test_parent_children_page_with_a_real_total(api, graph, unscoped_user):
    page = api.get("/api/assets", params={"parent": f"asset:{graph.referrals}", "skip": 1, "limit": 2}).json()
    assert [a["name"] for a in page["items"]] == ["leads", "moves"]
    assert (page["total"], page["skip"], page["limit"]) == (4, 1, 2)
    assert [a["has_children"] for a in page["items"]] == [True, False]


def test_parent_combines_with_the_other_filters(api, graph, unscoped_user):
    key = f"asset:{graph.referrals}"
    tables = _children(api, key, asset_type_names="Table")
    assert ([a["name"] for a in tables["items"]], tables["total"]) == (["leads", "moves"], 2)
    named = _children(api, key, name="lead")
    assert [a["name"] for a in named["items"]] == ["lead_view", "leads"]
    assert _children(api, key, status="deprecated")["total"] == 0


def test_has_children_is_only_filled_on_parent_listings(api, graph, unscoped_user):
    listed = api.get("/api/assets", params={"node": f"asset:{graph.referrals}"}).json()
    assert {a["has_children"] for a in listed["items"]} == {None}


def test_parent_children_follow_the_scoped_users_tree(api, graph, monkeypatch):
    # Readable: leads only. insights and referrals aren't readable but hold leads, so the tree
    # lists them; catalog_graph holds nothing readable and is omitted.
    monkeypatch.setattr(assets_routes, "_restrict_ids_for", lambda *args: [graph.leads])
    for key in ("branch:uc", f"asset:{graph.insights}", f"asset:{graph.referrals}", f"asset:{graph.leads}"):
        assert [(a["id"], a["has_children"]) for a in _children(api, key)["items"]] == _tree_assets(api, key)
    assert [a["name"] for a in _children(api, f"asset:{graph.insights}")["items"]] == ["referrals"]
    leads = _children(api, f"asset:{graph.referrals}")["items"]
    assert [(a["name"], a["has_children"]) for a in leads] == [("leads", False)]


@pytest.mark.parametrize("params", [
    {"parent": "category:analytics"},
    {"parent": "type:Table"},
    {"parent": "asset:not-a-uuid"},
    {"parent": "branch:uc", "node": "branch:uc"},
])
def test_parent_rejects_keys_without_asset_children_and_node(api, unscoped_user, params):
    assert api.get("/api/assets", params=params).status_code == 400


def test_a_consumer_sees_only_names_for_containers_it_cannot_read(api, graph, monkeypatch, db_session):
    # R20: referrals is listed only because the readable leads sits under it.
    referrals = db_session.get(AssetDb, graph.referrals)
    referrals.description, referrals.platform, referrals.tags = "secret", "databricks", ["pii"]
    referrals.properties = {"schema": {"column_count": 3}, "data_type": "STRING"}
    leads = db_session.get(AssetDb, graph.leads)
    leads.description = "lead rows"
    db_session.flush()
    monkeypatch.setattr(assets_routes, "_restrict_ids_for", lambda *args: [graph.leads])

    [row] = _children(api, f"asset:{graph.insights}")["items"]
    assert {k: row[k] for k in ("id", "name", "asset_type_name", "data_branch", "status", "has_children")} == {
        "id": str(graph.referrals), "name": "referrals", "asset_type_name": "Schema",
        "data_branch": "uc", "status": "active", "has_children": True,
    }
    assert row["asset_type_id"]
    blank = {k: v for k, v in row.items() if k not in (
        "id", "name", "asset_type_id", "asset_type_name", "data_branch", "status", "has_children")}
    assert blank == {
        "description": None, "platform": None, "location": None, "tags": None, "domain_ids": [],
        "primary_domain_id": None, "domains": [], "parent_id": None, "parent_name": None,
        "updated_at": None, "owner_display": None, "owner_extra_count": 0, "concepts": [],
        "column_count": None, "data_type": None, "nullable": None,
    }

    [readable] = _children(api, f"asset:{graph.referrals}")["items"]
    assert (readable["name"], readable["description"], readable["location"]) == (
        "leads", "lead rows", "Table:leads",
    )


def test_an_unscoped_user_sees_full_container_rows(api, graph, unscoped_user, db_session):
    db_session.get(AssetDb, graph.referrals).description = "schema notes"
    db_session.flush()
    rows = {a["name"]: a for a in _children(api, f"asset:{graph.insights}")["items"]}
    assert (rows["referrals"]["description"], rows["referrals"]["location"]) == ("schema notes", "Schema:referrals")


@pytest.fixture
def hidden_referrals(db_session, graph):
    """referrals (unreadable to a leads-only consumer) with a concept, a domain and a platform."""
    from src.db_models.data_domains import DataDomain
    from src.db_models.domain_associations import EntityDomainAssociationDb
    from src.db_models.semantic_links import EntitySemanticLinkDb

    domain = DataDomain(id=str(uuid.uuid4()), name=f"d-{uuid.uuid4().hex[:6]}", created_by="u@x.com")
    db_session.add(domain)
    db_session.flush()
    db_session.add(EntityDomainAssociationDb(domain_id=domain.id, entity_id=str(graph.referrals),
                                             entity_type="asset"))
    db_session.add(EntitySemanticLinkDb(entity_id=str(graph.referrals), entity_type="asset",
                                        iri="http://example.com/glossary#Referral"))
    db_session.get(AssetDb, graph.referrals).platform = "databricks"
    db_session.flush()
    return SimpleNamespace(domain=domain.id, concept="http://example.com/glossary#Referral",
                           platform="databricks")


def _hidden_filter_cases(hidden):
    matching = [{"concept_iri": hidden.concept}, {"domain_id": hidden.domain},
                {"domain_ids": hidden.domain}, {"platform": hidden.platform}]
    missing = [{"concept_iri": "http://example.com/glossary#Other"}, {"domain_id": str(uuid.uuid4())},
               {"domain_ids": str(uuid.uuid4())}, {"platform": "snowflake"}]
    return matching, missing


def test_hidden_attributes_never_match_for_an_unreadable_child(api, graph, monkeypatch, hidden_referrals):
    monkeypatch.setattr(assets_routes, "_restrict_ids_for", lambda *args: [graph.leads])
    key = f"asset:{graph.insights}"
    assert _children(api, key)["total"] == 1  # referrals is listed
    matching, missing = _hidden_filter_cases(hidden_referrals)
    for params in matching + missing:
        page = _children(api, key, **params)
        assert (page["total"], page["items"]) == (0, []), params
    # Visible attributes still filter the unreadable child.
    assert _children(api, key, name="referr")["total"] == 1
    assert _children(api, key, asset_type_names="Schema")["total"] == 1


def test_hidden_attributes_match_for_an_unscoped_user(api, graph, unscoped_user, hidden_referrals):
    key = f"asset:{graph.insights}"
    matching, missing = _hidden_filter_cases(hidden_referrals)
    for params in matching:
        assert [a["name"] for a in _children(api, key, **params)["items"]] == ["referrals"], params
    for params in missing:
        assert _children(api, key, **params)["total"] == 0, params


def test_children_differing_only_in_case_keep_a_stable_order(api, db_session, graph, unscoped_user):
    schema_type = db_session.query(AssetTypeDb).filter_by(name="Schema").one()
    ids = []
    for name in ("Staging", "staging"):
        schema = AssetDb(id=uuid.uuid4(), name=name, asset_type_id=schema_type.id, status="active",
                         data_branch="uc", location=f"Schema:{name}")
        db_session.add(schema)
        db_session.flush()
        _entity_link(db_session, "Catalog", graph.insights, "Schema", schema.id, "hasSchema")
        ids.append(str(schema.id))
    db_session.flush()

    key = f"asset:{graph.insights}"
    tree_ids = [str(n.asset_id) for n in tree_children(db_session, key, None) if n.label.lower() == "staging"]
    assert tree_ids == sorted(ids)
    pages = [api.get("/api/assets", params={"parent": key, "skip": skip, "limit": 1}).json()["items"][0]["id"]
             for skip in range(4)]
    assert [i for i in pages if i in ids] == sorted(ids)


@pytest.mark.parametrize("params", [{"skip": -1}, {"limit": 0}, {"limit": -5}])
def test_parent_rejects_bad_paging(api, graph, unscoped_user, params):
    response = api.get("/api/assets", params={"parent": f"asset:{graph.referrals}", **params})
    assert response.status_code == 422
