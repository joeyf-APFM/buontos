"""Owner, concepts and the concept filter on the asset list."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event

from src.controller.assets_manager import assets_manager
from src.db_models.assets import AssetDb, AssetTypeDb
from src.db_models.business_owners import BusinessOwnerDb
from src.db_models.business_roles import BusinessRoleDb
from src.db_models.semantic_links import EntitySemanticLinkDb

CUSTOMER = "http://example.com/glossary#Customer"
ORDER = "http://example.com/glossary/Order"


@pytest.fixture
def world(db_session):
    table_type = AssetTypeDb(name="Table", category="data")
    role = BusinessRoleDb(name="Owner-" + uuid.uuid4().hex[:6])
    db_session.add_all([table_type, role])
    db_session.flush()
    assets = {}
    for name in ("alpha", "beta", "gamma"):
        assets[name] = AssetDb(id=uuid.uuid4(), name=name, asset_type_id=table_type.id, status="active")
        db_session.add(assets[name])
    assets["alpha"].properties = {"schema": {"column_count": 7}}
    db_session.flush()
    return SimpleWorld(db_session, assets, role)


class SimpleWorld:
    def __init__(self, db, assets, role):
        self.db, self.assets, self.role = db, assets, role
        self.t0 = datetime(2026, 1, 1)

    def owner(self, asset, email, name=None, minutes=0, active=True):
        self.db.add(BusinessOwnerDb(
            object_type="asset", object_id=str(asset.id), user_email=email, user_name=name,
            role_id=self.role.id, is_active=active, assigned_at=self.t0 + timedelta(minutes=minutes)))
        self.db.flush()

    def link(self, asset, iri, label=None):
        self.db.add(EntitySemanticLinkDb(entity_id=str(asset.id), entity_type="asset", iri=iri, label=label))
        self.db.flush()

    def page(self, **kw):
        return {i.name: i for i in assets_manager.get_all_assets(self.db, **kw).items}


def test_owner_is_earliest_active_with_extra_count(world):
    a = world.assets["alpha"]
    world.owner(a, "late@x.com", "Late", minutes=10)
    world.owner(a, "early@x.com", None, minutes=1)
    world.owner(a, "gone@x.com", "Gone", minutes=0, active=False)
    items = world.page()
    assert items["alpha"].owner_display == "early@x.com"
    assert items["alpha"].owner_extra_count == 1
    assert items["beta"].owner_display is None
    assert items["beta"].owner_extra_count == 0


def test_owner_prefers_user_name(world):
    world.owner(world.assets["beta"], "b@x.com", "Bea")
    assert world.page()["beta"].owner_display == "Bea"


def test_concepts_use_label_then_iri_local_name_sorted(world):
    a = world.assets["alpha"]
    world.link(a, ORDER)
    world.link(a, CUSTOMER, "Customer")
    assert world.page()["alpha"].concepts == ["Customer", "Order"]
    assert world.page()["beta"].concepts == []


def test_column_count_from_schema_properties(world):
    items = world.page()
    assert items["alpha"].column_count == 7
    assert items["beta"].column_count is None


def test_concept_iri_filters_list_and_total(world):
    world.link(world.assets["alpha"], CUSTOMER, "Customer")
    world.link(world.assets["gamma"], CUSTOMER, "Customer")
    world.link(world.assets["beta"], ORDER)
    result = assets_manager.get_all_assets(world.db, concept_iri=CUSTOMER)
    assert sorted(i.name for i in result.items) == ["alpha", "gamma"]
    assert result.total == 2


def test_owners_and_links_load_in_two_extra_queries(world, monkeypatch):
    for a in world.assets.values():
        world.owner(a, f"{a.name}@x.com")
        world.link(a, CUSTOMER, "Customer")
    engine = world.db.get_bind()
    baseline, with_page = [], []

    def count_into(bucket):
        def listener(conn, cursor, statement, *args):
            bucket.append(statement)
        return listener

    # Baseline: the same page without the owner/link loads.
    l1 = count_into(baseline)
    event.listen(engine, "before_cursor_execute", l1)
    try:
        with monkeypatch.context() as m:
            m.setattr(assets_manager, "_attach_owners_and_concepts", lambda *a, **k: None)
            assets_manager.get_all_assets(world.db)
    finally:
        event.remove(engine, "before_cursor_execute", l1)
    l2 = count_into(with_page)
    event.listen(engine, "before_cursor_execute", l2)
    try:
        assets_manager.get_all_assets(world.db)
    finally:
        event.remove(engine, "before_cursor_execute", l2)
    assert len(with_page) - len(baseline) == 2
