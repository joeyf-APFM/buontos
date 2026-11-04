"""auto_link_schema_to_assets for a contract whose schema spans several tables of one Dataset.

Found 2026-11-04 loading AS-IS contracts (7 of 9 failed with HTTP 500):
  1. The Dataset's governedBy link added for the first table was not visible to the existence check for the second
     table in the same pass, so it was added twice -> uq_entity_relationship IntegrityError, whole request rolled back.
  2. The "parent Dataset" lookup accepted any hasTable/hasView source, so a Schema asset could be taken for the Dataset.
  3. The asset match used location ILIKE '%name%' + first(), so main.prod.crm_user could resolve to
     main.prod.crm_user_history.
"""
from pathlib import Path
from types import SimpleNamespace

import pytest
from rdflib import ConjunctiveGraph, URIRef

from src.controller.ontology_schema_manager import OntologySchemaManager
from src.db_models.assets import AssetDb, AssetTypeDb
from src.db_models.entity_relationships import EntityRelationshipDb

TTL = Path(__file__).resolve().parents[2] / "data" / "taxonomies" / "ontos-ontology.ttl"


@pytest.fixture(scope="module")
def osm():
    graph = ConjunctiveGraph()
    graph.get_context(URIRef(OntologySchemaManager.BASE_ONTOLOGY_CONTEXT)).parse(str(TTL), format="turtle")
    return OntologySchemaManager(SimpleNamespace(_graph=graph))


@pytest.fixture
def asset_types(db_session, osm):
    osm.sync_asset_types(db_session)
    return {t.name: t for t in db_session.query(AssetTypeDb).all()}


def _asset(db, types, type_name, name):
    a = AssetDb(name=name, asset_type_id=types[type_name].id, location=name, platform="databricks")
    db.add(a)
    db.flush()
    return a


def _rel(db, src_type, src, rel, tgt_type, tgt):
    db.add(EntityRelationshipDb(source_type=src_type, source_id=str(src.id), target_type=tgt_type,
                                target_id=str(tgt.id), relationship_type=rel))
    db.flush()


def test_multi_table_contract_links_each_table_once_and_its_dataset_once(db_session, asset_types, monkeypatch):
    from src.controller import data_contracts_manager as dcm

    history = _asset(db_session, asset_types, "View", "main.prod.crm_user_history")  # created first on purpose
    current = _asset(db_session, asset_types, "View", "main.prod.crm_user")
    schema = _asset(db_session, asset_types, "Schema", "main.prod")
    dataset = _asset(db_session, asset_types, "Dataset", "Advisors & Employees")
    # Schema links first, so a source_type-blind parent lookup would find the Schema.
    for view in (current, history):
        _rel(db_session, "Schema", schema, "hasView", "View", view)
    for view in (current, history):
        _rel(db_session, "Dataset", dataset, "hasView", "View", view)

    contract = SimpleNamespace(schema_objects=[
        SimpleNamespace(id="so-1", name="crm_user", physical_name="main.prod.crm_user"),
        SimpleNamespace(id="so-2", name="crm_user_history", physical_name="main.prod.crm_user_history"),
    ])
    monkeypatch.setattr(dcm.data_contract_repo, "get_with_all", lambda *_a, **_k: contract)
    manager = dcm.DataContractsManager.__new__(dcm.DataContractsManager)

    result = manager.auto_link_schema_to_assets(db_session, "c-1", current_user="u@x.com")

    implements = {c["schema_object"]: c["asset_id"] for c in result["created"]
                  if c["relationship_type"] == "implementsContract"}
    assert implements == {"crm_user": str(current.id), "crm_user_history": str(history.id)}
    governed = [c for c in result["created"] if c["relationship_type"] == "governedBy"]
    assert [(c["asset_type"], c["asset_id"]) for c in governed] == [("Dataset", str(dataset.id))]
    stored = db_session.query(EntityRelationshipDb).filter(
        EntityRelationshipDb.relationship_type == "governedBy").all()
    assert [(r.source_type, r.source_id) for r in stored] == [("Dataset", str(dataset.id))]
