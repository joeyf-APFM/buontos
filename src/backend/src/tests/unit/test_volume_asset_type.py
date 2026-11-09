"""A Unity Catalog volume is an asset of its own type, Volume, contained in a schema."""
import os

os.environ['TESTING'] = 'true'
os.environ['SKIP_STARTUP_TASKS'] = 'true'

from pathlib import Path
from types import SimpleNamespace

import pytest
from rdflib import ConjunctiveGraph, URIRef

from src.controller.ontology_schema_manager import OntologySchemaManager
from src.db_models.assets import AssetTypeDb

ONTOS = "http://ontos.app/ontology#"
TTL = Path(__file__).resolve().parents[2] / "data" / "taxonomies" / "ontos-ontology.ttl"


@pytest.fixture(scope="module")
def osm():
    graph = ConjunctiveGraph()
    graph.get_context(URIRef(OntologySchemaManager.BASE_ONTOLOGY_CONTEXT)).parse(
        str(TTL), format="turtle")
    return OntologySchemaManager(SimpleNamespace(_graph=graph))


@pytest.fixture
def asset_types(db_session, osm):
    """Asset types seeded from the ontology, as at startup."""
    osm.sync_asset_types(db_session)
    return {t.name: t for t in db_session.query(AssetTypeDb).all()}


def test_the_ontology_has_a_volume_asset_class(osm):
    types = {t.label: t for t in osm.get_entity_types(tier="asset")}

    assert "Volume" in types
    assert types["Volume"].ui_category == "data"


def test_has_volume_links_schema_to_volume(osm):
    rels = osm.get_relationships(f"{ONTOS}Schema")

    assert ("hasVolume", f"{ONTOS}Volume") in {
        (r.property_name, r.target_type_iri) for r in rels.outgoing}


def test_the_startup_sync_seeds_the_volume_asset_type(asset_types):
    assert asset_types["Volume"].category == "data"
