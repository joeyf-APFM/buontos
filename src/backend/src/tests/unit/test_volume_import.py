"""A Unity Catalog volume is imported as a Volume asset linked from its schema by hasVolume.

Volumes used to be imported as System assets linked by hasPart. Re-importing the
schema converts such an asset (same id) and renames its link from the schema.
"""
import json
import os

os.environ['TESTING'] = 'true'
os.environ['SKIP_STARTUP_TASKS'] = 'true'

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from rdflib import ConjunctiveGraph, URIRef

from src.controller.assets_manager import AssetsManager
from src.controller.ontology_schema_manager import OntologySchemaManager
from src.controller.schema_import_manager import SchemaImportManager
from src.db_models.assets import AssetDb, AssetRelationshipDb, AssetTypeDb
from src.db_models.change_log import ChangeLogDb
from src.db_models.entity_relationships import EntityRelationshipDb
from src.models.assets import AssetCreate, AssetMetadata, UnifiedAssetType
from src.models.schema_import import ImportDepth, ImportRequest

TTL = Path(__file__).resolve().parents[2] / "data" / "taxonomies" / "ontos-ontology.ttl"
VOLUME = "main.raw.files"
FUNCTION = "main.raw.fn"


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
    connector_type = "databricks"

    def __init__(self):
        def meta(path, kind):
            return AssetMetadata(identifier=path, name=path.rsplit(".", 1)[-1],
                                 asset_type=kind, connector_type="databricks")
        self._metadata = {
            "main": meta("main", UnifiedAssetType.UC_CATALOG),
            "main.raw": meta("main.raw", UnifiedAssetType.UC_SCHEMA),
            VOLUME: meta(VOLUME, UnifiedAssetType.UC_VOLUME),
            FUNCTION: meta(FUNCTION, UnifiedAssetType.UC_FUNCTION),
        }

    def get_asset_metadata(self, path):
        return self._metadata.get(path)

    def list_assets(self, options=None):
        return []

    def list_containers(self, parent_path=None):
        return []


def _importer():
    connections = MagicMock()
    connections.get_connector_for_connection.return_value = _Connector()
    return SchemaImportManager(connections, AssetsManager())


def _request(path=VOLUME):
    return ImportRequest(
        connection_id=uuid4(), selected_paths=[path], depth=ImportDepth.ONE_LEVEL)


def _assets_at(db, location):
    return db.query(AssetDb).filter(AssetDb.location == location).all()


def _links_into(db, asset_id):
    """The (source type, relationship, target type) of the links into an asset, both tables."""
    aid = str(asset_id)
    entity = sorted(
        (r.source_type, r.relationship_type, r.target_type)
        for r in db.query(EntityRelationshipDb).filter_by(target_id=aid).all())
    legacy = sorted(
        (r.source_asset.asset_type.name, r.relationship_type, r.target_asset.asset_type.name)
        for r in db.query(AssetRelationshipDb).filter_by(target_asset_id=asset_id).all())
    return entity, legacy


def _retyped_entries(db, asset_id):
    return db.query(ChangeLogDb).filter_by(
        entity_type="asset", entity_id=str(asset_id), action="retyped").all()


def _legacy_system_volume(db, asset_types, location=VOLUME):
    """A volume imported as a System before the Volume type, linked from its schema."""
    manager = AssetsManager()

    def create(name, type_name, loc):
        return manager.create_asset(db, asset_in=AssetCreate(
            name=name, asset_type_id=asset_types[type_name].id,
            platform="databricks", location=loc), current_user_id="u@x.com")

    catalog = create("main", "Catalog", "main")
    schema = create("raw", "Schema", "main.raw")
    volume = create(location.rsplit(".", 1)[-1], "System", location)
    for parent, ptype, child, ctype, rel in (
        (catalog, "Catalog", schema, "Schema", "hasSchema"),
        (schema, "Schema", volume, "System", "hasPart"),
    ):
        db.add(AssetRelationshipDb(
            source_asset_id=parent.id, target_asset_id=child.id, relationship_type=rel))
        db.add(EntityRelationshipDb(
            source_type=ptype, source_id=str(parent.id), target_type=ctype,
            target_id=str(child.id), relationship_type=rel))
    db.flush()
    return volume


def test_a_volume_is_previewed_and_imported_as_a_volume_under_has_volume(
        db_session, asset_types):
    items = {i.path: i for i in _importer().preview_import(db_session, _request())}
    assert items[VOLUME].asset_type == "Volume"
    assert items[VOLUME].will_create is True

    result = _importer().execute_import(db_session, _request(), current_user_id="u@x.com")

    assert result.errors == 0, result.error_messages
    [asset] = _assets_at(db_session, VOLUME)
    assert asset.asset_type.name == "Volume"
    assert _links_into(db_session, asset.id) == (
        [("Schema", "hasVolume", "Volume")], [("Schema", "hasVolume", "Volume")])


def test_a_volume_imported_earlier_as_a_system_is_reused_and_converted(
        db_session, asset_types):
    legacy = _legacy_system_volume(db_session, asset_types)

    items = {i.path: i for i in _importer().preview_import(db_session, _request())}
    assert items[VOLUME].existing_asset_id == legacy.id
    assert items[VOLUME].will_create is False

    result = _importer().execute_import(db_session, _request(), current_user_id="u@x.com")

    assert result.errors == 0, result.error_messages
    [asset] = _assets_at(db_session, VOLUME)
    assert asset.id == legacy.id
    assert asset.asset_type.name == "Volume"
    assert _links_into(db_session, asset.id) == (
        [("Schema", "hasVolume", "Volume")], [("Schema", "hasVolume", "Volume")])
    [entry] = _retyped_entries(db_session, asset.id)
    assert json.loads(entry.details_json) == {
        "location": VOLUME, "from_type": "System", "to_type": "Volume",
        "relationships_rewritten": 2,
    }


def test_a_second_import_of_a_converted_volume_changes_nothing(db_session, asset_types):
    legacy = _legacy_system_volume(db_session, asset_types)
    _importer().execute_import(db_session, _request(), current_user_id="u@x.com")
    links = _links_into(db_session, legacy.id)

    result = _importer().execute_import(db_session, _request(), current_user_id="u@x.com")

    assert result.errors == 0, result.error_messages
    [asset] = _assets_at(db_session, VOLUME)
    assert asset.asset_type.name == "Volume"
    assert _links_into(db_session, asset.id) == links
    assert len(_retyped_entries(db_session, asset.id)) == 1


def test_a_uc_function_stays_a_system_asset(db_session, asset_types):
    result = _importer().execute_import(
        db_session, _request(FUNCTION), current_user_id="u@x.com")

    assert result.errors == 0, result.error_messages
    [asset] = _assets_at(db_session, FUNCTION)
    assert asset.asset_type.name == "System"
    assert _links_into(db_session, asset.id) == (
        [("Schema", "hasPart", "System")], [("Schema", "hasPart", "System")])


def test_volume_imports_as_system_until_the_type_is_seeded(db_session, asset_types):
    db_session.delete(asset_types["Volume"])
    db_session.flush()

    items = {i.path: i for i in _importer().preview_import(db_session, _request())}
    result = _importer().execute_import(db_session, _request(), current_user_id="u@x.com")

    assert items[VOLUME].asset_type == "System"
    assert result.errors == 0, result.error_messages
    [asset] = _assets_at(db_session, VOLUME)
    assert asset.asset_type.name == "System"
    assert _links_into(db_session, asset.id) == (
        [("Schema", "hasPart", "System")], [("Schema", "hasPart", "System")])


def test_converting_drops_a_link_that_already_exists_under_the_new_name(
        db_session, asset_types):
    legacy = _legacy_system_volume(db_session, asset_types)
    schema = db_session.query(AssetDb).filter_by(location="main.raw").one()
    db_session.add(AssetRelationshipDb(
        source_asset_id=schema.id, target_asset_id=legacy.id, relationship_type="hasVolume"))
    db_session.add(EntityRelationshipDb(
        source_type="Schema", source_id=str(schema.id), target_type="Volume",
        target_id=str(legacy.id), relationship_type="hasVolume"))
    db_session.flush()

    AssetsManager().retype_asset(
        db_session, asset_id=legacy.id, from_type="System", to_type="Volume",
        current_user_id="u@x.com", rename_relationship=("hasPart", "hasVolume"))

    assert _links_into(db_session, legacy.id) == (
        [("Schema", "hasVolume", "Volume")], [("Schema", "hasVolume", "Volume")])
