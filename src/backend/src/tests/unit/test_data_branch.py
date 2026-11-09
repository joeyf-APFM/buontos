"""Assets and connections carry a data branch (uc / internal / external).

Databricks imports are "uc" (its System asset has none); other connectors stamp the
connection's branch; a re-import fills only a missing branch.
"""
import os

os.environ['TESTING'] = 'true'
os.environ['SKIP_STARTUP_TASKS'] = 'true'

import subprocess
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError
from rdflib import ConjunctiveGraph, URIRef

from src.controller.assets_manager import AssetsManager
from src.controller.ontology_schema_manager import OntologySchemaManager
from src.controller.schema_import_manager import SchemaImportManager
from src.db_models.assets import AssetDb, AssetTypeDb
from src.db_models.connections import ConnectionDb
from src.models.assets import (
    AssetCreate, AssetMetadata, AssetUpdate, DataBranch, UnifiedAssetType,
)
from src.models.connections import ConnectionCreate, ConnectionUpdate
from src.models.schema_import import ImportDepth, ImportRequest

TTL = Path(__file__).resolve().parents[2] / "data" / "taxonomies" / "ontos-ontology.ttl"
BACKEND = Path(__file__).resolve().parents[3]
TABLE = "main.raw.orders"


@pytest.fixture(scope="module")
def osm():
    graph = ConjunctiveGraph()
    graph.get_context(URIRef(OntologySchemaManager.BASE_ONTOLOGY_CONTEXT)).parse(
        str(TTL), format="turtle")
    return OntologySchemaManager(SimpleNamespace(_graph=graph))


@pytest.fixture
def asset_types(db_session, osm):
    osm.sync_asset_types(db_session)
    return {t.name: t for t in db_session.query(AssetTypeDb).all()}


class _Connector:
    def __init__(self, connector_type):
        self.connector_type = connector_type
        self._metadata = {
            "main": self._meta("main", UnifiedAssetType.UC_CATALOG),
            "main.raw": self._meta("main.raw", UnifiedAssetType.UC_SCHEMA),
            TABLE: self._meta(TABLE, UnifiedAssetType.UC_TABLE),
        }

    def _meta(self, path, kind):
        return AssetMetadata(identifier=path, name=path.rsplit(".", 1)[-1],
                             asset_type=kind, connector_type=self.connector_type)

    def get_asset_metadata(self, path):
        return self._metadata.get(path)

    def list_assets(self, options=None):
        return []

    def list_containers(self, parent_path=None):
        return []


def _connection(db, connector_type, data_branch=None):
    conn = ConnectionDb(name=f"{connector_type}-conn", connector_type=connector_type,
                        config={}, data_branch=data_branch)
    db.add(conn)
    db.flush()
    return conn


def _import(db, conn, connector_type):
    connections = MagicMock()
    connections.get_connector_for_connection.return_value = _Connector(connector_type)
    importer = SchemaImportManager(connections, AssetsManager())
    return importer.execute_import(
        db,
        ImportRequest(connection_id=conn.id, selected_paths=[TABLE], depth=ImportDepth.ONE_LEVEL),
        "u@x.com",
    )


def _branch_at(db, location):
    return db.query(AssetDb).filter(AssetDb.location == location).one().data_branch


def test_assets_accept_and_return_a_data_branch(db_session, asset_types):
    manager = AssetsManager()
    created = manager.create_asset(db_session, asset_in=AssetCreate(
        name="feed", asset_type_id=asset_types["Table"].id, data_branch="external"),
        current_user_id="u@x.com")
    assert created.data_branch == DataBranch.EXTERNAL

    summary = manager._asset_to_summary(db_session.get(AssetDb, created.id))
    assert summary.data_branch == "external"

    updated = manager.update_asset(db_session, asset_id=created.id,
                                   asset_in=AssetUpdate(data_branch="internal"),
                                   current_user_id="u@x.com")
    assert updated.data_branch == DataBranch.INTERNAL


def test_an_unknown_branch_is_rejected(asset_types):
    with pytest.raises(ValidationError):
        AssetCreate(name="x", asset_type_id=asset_types["Table"].id, data_branch="cloud")
    with pytest.raises(ValidationError):
        ConnectionCreate(name="c", connector_type="snowflake", data_branch="uc")
    with pytest.raises(ValidationError):
        ConnectionUpdate(data_branch="cloud")


def test_databricks_imports_are_uc_but_their_system_is_not(db_session, asset_types):
    conn = _connection(db_session, "databricks")
    _import(db_session, conn, "databricks")

    assert _branch_at(db_session, TABLE) == "uc"
    assert _branch_at(db_session, "main") == "uc"
    system = db_session.query(AssetDb).filter_by(location="databricks").one()
    assert system.data_branch is None


def test_other_connector_imports_take_the_connection_branch(db_session, asset_types):
    conn = _connection(db_session, "snowflake", data_branch="internal")
    _import(db_session, conn, "snowflake")

    assert _branch_at(db_session, TABLE) == "internal"
    assert db_session.query(AssetDb).filter_by(location="snowflake").one().data_branch == "internal"


def test_other_connector_without_a_branch_leaves_assets_unmarked(db_session, asset_types):
    conn = _connection(db_session, "snowflake")
    _import(db_session, conn, "snowflake")

    assert _branch_at(db_session, TABLE) is None


def test_reimport_keeps_a_hand_set_branch_and_fills_a_missing_one(db_session, asset_types):
    conn = _connection(db_session, "snowflake", data_branch="internal")
    _import(db_session, conn, "snowflake")
    table = db_session.query(AssetDb).filter_by(location=TABLE).one()
    schema = db_session.query(AssetDb).filter_by(location="main.raw").one()
    table.data_branch = "external"   # set by hand
    schema.data_branch = None        # never marked
    db_session.flush()

    _import(db_session, conn, "snowflake")

    assert _branch_at(db_session, TABLE) == "external"
    assert _branch_at(db_session, "main.raw") == "internal"


def test_the_migration_adds_both_columns():
    """Offline SQL for the new revision only (replaying every migration breaks on data migrations)."""
    out = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "c5_merge_cv2_b8:d1_data_branch", "--sql"],
        cwd=BACKEND, capture_output=True, text=True, check=True,
        # Placeholders only: offline mode renders SQL and never connects.
        env={**os.environ, "ENV": "LOCAL", "PGHOST": "localhost", "PGDATABASE": "offline",
             "PGUSER": "offline", "PGPASSWORD": "offline", "DATABRICKS_HOST": "https://offline.invalid",
             "DATABRICKS_WAREHOUSE_ID": "offline", "APP_AUDIT_LOG_DIR": "/tmp/offline-audit"},
    )
    sql = out.stdout + out.stderr
    assert "ALTER TABLE assets ADD COLUMN data_branch" in sql
    assert "ALTER TABLE connections ADD COLUMN data_branch" in sql
    assert "CREATE INDEX ix_assets_data_branch ON assets (data_branch)" in sql
