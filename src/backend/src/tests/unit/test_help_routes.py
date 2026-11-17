"""Help routes: article list/detail, section search, and authentication."""

from pathlib import Path

import pytest
from fastapi import HTTPException

from src.app import app
from src.common import dependencies
from src.controller.help_manager import HelpManager

ALPHA = """---
title: Alpha Guide
summary: About alpha.
order: 2
---
Intro to alpha.

## Zebra Care
Feeding zebras requires patience.
"""

BETA = """---
title: Beta Guide
order: 1
---
Beta intro.
"""


@pytest.fixture
def help_api(client, tmp_path: Path):
    (tmp_path / "alpha.md").write_text(ALPHA, encoding="utf-8")
    (tmp_path / "beta.md").write_text(BETA, encoding="utf-8")
    missing = object()
    previous = getattr(app.state, "help_manager", missing)
    app.state.help_manager = HelpManager(content_dir=tmp_path)
    yield client
    if previous is missing:
        del app.state.help_manager
    else:
        app.state.help_manager = previous


def test_list_articles_ok(help_api):
    resp = help_api.get("/api/help/articles")
    assert resp.status_code == 200
    assert [a["slug"] for a in resp.json()] == ["beta", "alpha"]
    assert "body" not in resp.json()[0]


def test_get_article_ok_and_404(help_api):
    resp = help_api.get("/api/help/articles/alpha")
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Alpha Guide"
    assert "Feeding zebras" in data["body"]
    assert [s["anchor"] for s in data["sections"]][0] == "overview"

    missing = help_api.get("/api/help/articles/nope")
    assert missing.status_code == 404
    assert missing.json() == {"detail": "Help article not found"}


def test_search_returns_section_items(help_api):
    resp = help_api.get("/api/help/search", params={"q": "zebras"})
    assert resp.status_code == 200
    items = resp.json()
    assert items and items[0]["type"] == "help"
    assert items[0]["id"] == "help::alpha#zebra-care"
    assert items[0]["link"] == "/help/alpha#zebra-care"


def test_search_empty_and_blank_q_return_empty_list_200(help_api):
    for params in ({}, {"q": ""}, {"q": "   "}):
        resp = help_api.get("/api/help/search", params=params)
        assert resp.status_code == 200
        assert resp.json() == []


def test_search_limit_validation(help_api):
    assert help_api.get("/api/help/search", params={"q": "alpha", "limit": 0}).status_code == 422
    assert help_api.get("/api/help/search", params={"q": "alpha", "limit": 51}).status_code == 422
    assert help_api.get("/api/help/search", params={"q": "alpha", "limit": 1}).status_code == 200
    assert len(help_api.get("/api/help/search", params={"q": "alpha", "limit": 1}).json()) <= 1


def test_missing_manager_returns_503(client):
    previous = getattr(app.state, "help_manager", None)
    app.state.help_manager = None
    try:
        assert client.get("/api/help/articles").status_code == 503
    finally:
        if previous is None:
            del app.state.help_manager
        else:
            app.state.help_manager = previous


def test_routes_require_authenticated_user(help_api):
    def _deny():
        raise HTTPException(status_code=401, detail="Not authenticated")

    app.dependency_overrides[dependencies.get_current_user] = _deny
    try:
        for url in ("/api/help/articles", "/api/help/articles/alpha", "/api/help/search?q=alpha"):
            assert help_api.get(url).status_code == 401, url
    finally:
        app.dependency_overrides.pop(dependencies.get_current_user, None)
