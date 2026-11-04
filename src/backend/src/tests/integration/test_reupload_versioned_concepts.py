"""Re-uploading a collection whose concepts are already at v2+.

Two regressions, both found loading a real ontology on 2026-11-04:

  1. Confirm 500 (uq_rdf_triple): when the diff's ``modified`` list held a concept that
     was already versioned, ``_ensure_concept_version_v1`` re-stamped every row of the
     subject -- including prior versions' frozen snapshot rows -- onto the current
     version, colliding with its identical copies. The whole apply rolled back.
  2. Diff against history: the diff baseline was ``list_by_context``, which includes
     prior versions' snapshot rows, so a concept changed once was re-reported as
     ``modified`` on every later upload of the unchanged file (minting no-op versions).

The fixture files carry ``skos:prefLabel`` / ``skos:definition`` themselves, so the
separate "server-written SKOS mirrors" diff noise does not apply here.
Fixtures are local, mirroring test_upload_preview.py (no shared conftest).
"""
import uuid
from pathlib import Path

import pytest
from rdflib import Graph
from sqlalchemy.orm import Session

from src.app import app
from src.common.app_state import set_app_state_manager
from src.controller.semantic_models_manager import (
    SemanticModelsManager,
    _sanitize_context_name,
)
from src.models.semantic_models import SemanticModelCreate
from src.repositories.concept_versions_repository import concept_versions_repo


@pytest.fixture
def semantic_models_manager(db_session: Session, tmp_path: Path):
    data_dir = tmp_path / "sm_data"
    (data_dir / "cache").mkdir(parents=True, exist_ok=True)
    (data_dir / "taxonomies").mkdir(parents=True, exist_ok=True)

    manager = SemanticModelsManager(db=db_session, data_dir=data_dir)
    app.state.semantic_models_manager = manager
    set_app_state_manager("semantic_models_manager", manager)

    class _NoopOSM:
        def sync_asset_types(self, *_args, **_kwargs):
            return {"created": 0, "updated": 0}

    app.state.ontology_schema_manager = _NoopOSM()

    class _NoopAudit:
        def log_action(self, *_args, **_kwargs):
            return None

        def log_event(self, *_args, **_kwargs):
            return None

    app.state.audit_manager = _NoopAudit()

    yield manager

    for attr in ("semantic_models_manager", "ontology_schema_manager", "audit_manager"):
        if hasattr(app.state, attr):
            delattr(app.state, attr)


_PREFIXES = """@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix ex: <http://example.org/onto#> .
"""


def _glossary(revenue_definition: str) -> str:
    return _PREFIXES + f"""
ex:Customer a skos:Concept ;
    skos:prefLabel "Customer" ;
    skos:definition "A buyer of goods." .

ex:Revenue a skos:Concept ;
    skos:prefLabel "Revenue" ;
    skos:definition "{revenue_definition}" .
"""


V1 = _glossary("Income from sales.")
V2 = _glossary("Income from sales, net of returns.")
V3 = _glossary("Income from sales, net of returns and discounts.")
REVENUE = "http://example.org/onto#Revenue"


def _parse(ttl: str) -> Graph:
    g = Graph()
    g.parse(data=ttl, format="turtle")
    return g


def _seed(manager: SemanticModelsManager, name: str, ttl: str):
    manager.create(
        SemanticModelCreate(
            name=name, format="skos", content_text=ttl, original_filename=name,
            content_type="text/turtle", size_bytes=len(ttl), enabled=True,
        ),
        created_by="tester",
    )
    manager.rebuild_graph_from_enabled()


def _context(name: str) -> str:
    return f"urn:semantic-model:{_sanitize_context_name(name)}"


def _upload(manager: SemanticModelsManager, ctx: str, ttl: str) -> dict:
    preview = manager.preview_upload(ctx, _parse(ttl))
    return manager.confirm_upload(preview["preview_token"], actor="tester")


def _setup_revenue_at_v2(manager: SemanticModelsManager) -> str:
    name = f"reupload_{uuid.uuid4().hex[:8]}.ttl"
    _seed(manager, name, V1)
    ctx = _context(name)
    summary = _upload(manager, ctx, V2)
    assert summary["modified"] == 1, summary
    return ctx


class TestModifyAlreadyVersionedConcept:
    def test_second_modification_confirms(self, semantic_models_manager, db_session):
        mgr = semantic_models_manager
        ctx = _setup_revenue_at_v2(mgr)
        assert concept_versions_repo.max_version(db_session, REVENUE) == 2

        # Revenue is at v2 and changes again: confirm must apply, not raise IntegrityError.
        summary = _upload(mgr, ctx, V3)
        assert summary["modified"] == 1, summary
        assert concept_versions_repo.max_version(db_session, REVENUE) == 3
        current = mgr.get_concept(REVENUE)
        assert "and discounts" in (current.get("definition") or current.get("comment") or "")


class TestUnchangedReuploadAfterVersioning:
    def test_unchanged_file_is_not_modified(self, semantic_models_manager, db_session):
        mgr = semantic_models_manager
        ctx = _setup_revenue_at_v2(mgr)

        # Re-upload the exact file that produced v2: nothing changed, so nothing is modified.
        preview = mgr.preview_upload(ctx, _parse(V2))
        assert preview["summary"]["modified"] == 0, preview["summary"]
        assert preview["summary"]["new"] == 0, preview["summary"]
        assert preview["summary"]["removed"] == 0, preview["summary"]
        assert concept_versions_repo.max_version(db_session, REVENUE) == 2


# ---------------------------------------------------------------------------
# 3. A modification's RDF/RDFS/OWL triples (domain, comment, ...) must land on the new version.
#    publish_concept_version copied the prior version's rows and rewrote only SKOS fields, so a changed
#    rdfs:domain or rdfs:comment kept its OLD value and the concept stayed "modified" on every upload.
# ---------------------------------------------------------------------------

_RDFS_PREFIXES = """@prefix ex: <http://example.org/onto#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
"""


def _rdfs_model(domain: str, a_comment: str) -> str:
    # SKOS mirrors included so only the RDFS change is under test.
    return _RDFS_PREFIXES + f"""
ex:A a rdfs:Class ; rdfs:label "A" ; rdfs:comment "{a_comment}" ; skos:prefLabel "A" ; skos:definition "{a_comment}" .
ex:B a rdfs:Class ; rdfs:label "B" ; rdfs:comment "B." ; skos:prefLabel "B" ; skos:definition "B." .
ex:name a rdf:Property ; rdfs:label "Name" ; rdfs:comment "A name." ; rdfs:domain ex:{domain} ; rdfs:range xsd:string ;
    skos:prefLabel "Name" ; skos:definition "A name." .
"""


class TestModifiedConceptTakesRdfsTriples:
    def test_domain_and_comment_follow_the_file(self, semantic_models_manager, db_session):
        mgr = semantic_models_manager
        name = f"reupload_rdfs_{uuid.uuid4().hex[:8]}.ttl"
        _seed(mgr, name, _rdfs_model("A", "A."))
        ctx = _context(name)

        summary = _upload(mgr, ctx, _rdfs_model("B", "A, revised."))
        assert summary["modified"] == 2, summary  # ex:name (domain) and ex:A (comment)

        prop = mgr.get_concept("http://example.org/onto#name")
        assert prop.get("domain") == "http://example.org/onto#B"
        cls = mgr.get_concept("http://example.org/onto#A")
        assert (cls.get("comment") or "") == "A, revised."

        again = mgr.preview_upload(ctx, _parse(_rdfs_model("B", "A, revised.")))
        assert again["summary"]["modified"] == 0, again["summary"]
