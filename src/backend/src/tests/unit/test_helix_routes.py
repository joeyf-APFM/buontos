"""Ask Helix routes: identity modes, SSE framing, audit and the enable setting."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from src.app import app
from src.common import dependencies
from src.common.helix_client import CONTEXT_MAX_CHARS, HelixEvent
from src.common.manager_dependencies import get_audit_manager
from src.repositories.app_settings_repository import app_settings_repo
from src.routes import helix_routes

QUESTION = "How many referrals came in last week?"


class FakeAudit:
    def __init__(self):
        self.calls = []

    def log_action(self, db=None, **kwargs):
        self.calls.append(kwargs)

    def log_action_background(self, **kwargs):
        self.calls.append(kwargs)


class FakeGenie:
    """Stands in for stream_answer; records each call."""

    def __init__(self, events=None):
        self.calls = []
        self.events = events or [
            HelixEvent("conversation", {"conversation_id": "c1"}),
            HelixEvent("text", {"text": "42 referrals."}),
            HelixEvent("done", {}),
        ]

    def __call__(self, host, auth_headers, body, **kwargs):
        self.calls.append({"host": host, "headers": auth_headers, "body": body})

        async def _gen():
            for ev in self.events:
                yield ev

        return _gen()


@pytest.fixture
def settings(test_settings):
    test_settings.HELIX_ENABLED = True
    return test_settings


@pytest.fixture
def audit():
    return FakeAudit()


@pytest.fixture
def genie(monkeypatch):
    fake = FakeGenie()
    monkeypatch.setattr(helix_routes, "stream_answer", fake)
    return fake


@pytest.fixture
def api(client, db_session, settings, audit, monkeypatch):
    """The test client on the test's session, with Helix reading the test settings.

    Building any Databricks client fails fast unless a test patches in a fake.
    """
    def _test_session():
        yield db_session

    def _no_client(*a, **k):
        raise AssertionError("unexpected Databricks client")

    monkeypatch.setattr(helix_routes, "get_workspace_client", _no_client)
    monkeypatch.setattr(helix_routes, "WorkspaceClient", _no_client)
    helix_routes._SHARED_CLIENTS.clear()
    app.dependency_overrides[dependencies.get_db] = _test_session
    app.dependency_overrides[helix_routes.get_helix_settings] = lambda: settings
    app.dependency_overrides[get_audit_manager] = lambda: audit
    yield client
    for dep in (dependencies.get_db, helix_routes.get_helix_settings, get_audit_manager):
        app.dependency_overrides.pop(dep, None)
    helix_routes._SHARED_CLIENTS.clear()


def ask(api, token="user-token", **body):
    headers = {"x-forwarded-access-token": token} if token else {}
    return api.post("/api/helix/ask", json={"question": QUESTION, **body}, headers=headers)


def test_disabled_returns_404(api, settings, genie):
    settings.HELIX_ENABLED = False
    assert ask(api).status_code == 404
    assert api.get("/api/settings/helix").status_code == 404
    assert genie.calls == []


def test_user_mode_without_token_is_403_and_never_calls_genie(api, genie):
    resp = ask(api, token=None)
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Helix needs your Databricks sign-in."
    assert genie.calls == []


def test_user_mode_ignores_sp_fallback_setting(api, settings, genie):
    settings.OBO_ALLOW_SP_FALLBACK = True  # the api fixture fails any app-client build
    assert ask(api, token=None).status_code == 403
    assert genie.calls == []

    assert ask(api, token="user-token").status_code == 200
    assert genie.calls[0]["headers"] == {"Authorization": "Bearer user-token"}


def test_user_mode_streams_events_as_sse_frames(api, genie, audit):
    resp = ask(api, conversation_id="conv_1-a")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert resp.headers["cache-control"] == "no-cache"
    assert resp.headers["x-accel-buffering"] == "no"
    assert resp.text == (
        'event: conversation\ndata: {"conversation_id": "c1"}\n\n'
        'event: text\ndata: {"text": "42 referrals."}\n\n'
        "event: done\ndata: {}\n\n"
    )
    assert genie.calls[0]["host"] == "https://test-databricks.com"
    assert genie.calls[0]["body"]["conversationId"] == "conv_1-a"

    assert len(audit.calls) == 1
    entry = audit.calls[0]
    assert (entry["feature"], entry["action"]) == ("helix", "ASK")
    assert entry["details"] == {"mode": "user", "conversation_id": "conv_1-a"}
    assert QUESTION not in json.dumps(entry)


def test_shared_mode_uses_the_shared_principal(api, settings, genie, monkeypatch):
    settings.HELIX_IDENTITY_MODE = "shared"
    settings.HELIX_SHARED_CLIENT_ID = "helix-sp"
    settings.HELIX_SHARED_CLIENT_SECRET = "helix-secret"
    built = []

    class FakeWorkspaceClient:
        def __init__(self, **kwargs):
            built.append(kwargs)
            self.config = SimpleNamespace(authenticate=lambda: {"Authorization": "Bearer shared-sp"})

    monkeypatch.setattr(helix_routes, "WorkspaceClient", FakeWorkspaceClient)

    assert ask(api, token="user-token").status_code == 200
    assert ask(api, token=None).status_code == 200
    assert [c["headers"] for c in genie.calls] == [{"Authorization": "Bearer shared-sp"}] * 2
    assert len(built) == 1  # cached per client id
    assert built[0]["host"] == "https://test-databricks.com"
    assert built[0]["client_id"] == "helix-sp"
    assert built[0]["client_secret"] == "helix-secret"


def test_shared_mode_unconfigured_is_503(api, settings, genie):
    settings.HELIX_IDENTITY_MODE = "shared"
    settings.HELIX_SHARED_CLIENT_ID = "helix-sp"
    settings.HELIX_SHARED_CLIENT_SECRET = None
    resp = ask(api)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Helix's shared identity isn't configured."
    assert genie.calls == []


def test_shared_mode_refuses_the_apps_own_principal(api, settings, genie, monkeypatch):
    settings.HELIX_IDENTITY_MODE = "shared"
    settings.HELIX_SHARED_CLIENT_ID = "app-sp"
    settings.HELIX_SHARED_CLIENT_SECRET = "app-secret"
    monkeypatch.setenv("DATABRICKS_CLIENT_ID", "app-sp")
    # The api fixture's WorkspaceClient raises AssertionError if a client is built.
    resp = ask(api)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Helix's shared identity must not be the app's own."
    assert helix_routes._SHARED_CLIENTS == {}
    assert genie.calls == []


def test_shared_client_build_failure_is_a_clean_503(api, settings, genie, monkeypatch, caplog):
    settings.HELIX_IDENTITY_MODE = "shared"
    settings.HELIX_SHARED_CLIENT_ID = "helix-sp"
    settings.HELIX_SHARED_CLIENT_SECRET = "helix-secret"

    def _bad_config(**kwargs):
        raise ValueError("bad config helix-secret")

    monkeypatch.setattr(helix_routes, "WorkspaceClient", _bad_config)
    resp = ask(api)
    assert resp.status_code == 503
    assert resp.json()["detail"] == "Helix couldn't sign in to Databricks."
    assert "helix-secret" not in resp.text and "helix-secret" not in caplog.text
    assert helix_routes._SHARED_CLIENTS == {}
    assert genie.calls == []


def test_local_env_uses_the_developer_profile(api, settings, genie, monkeypatch):
    settings.ENV = "LOCAL"
    dev = SimpleNamespace(config=SimpleNamespace(
        host="https://dev-workspace.cloud.databricks.com",
        authenticate=lambda: {"Authorization": "Bearer dev-cli"},
    ))
    monkeypatch.setattr(helix_routes, "get_workspace_client", lambda s: dev)

    assert ask(api, token=None).status_code == 200
    assert genie.calls[0]["host"] == "https://dev-workspace.cloud.databricks.com"
    assert genie.calls[0]["headers"] == {"Authorization": "Bearer dev-cli"}


def test_context_is_capped_and_plain(api, genie):
    context = ("Table insights.referrals.leads\n\twith columns\r\n" * 40)  # under the 2000 limit
    assert ask(api, context=context).status_code == 200
    content = genie.calls[0]["body"]["input"][0]["content"][0]["text"]
    prefix = "The user is looking at: "
    assert content.startswith(prefix) and content.endswith(f"\n\n{QUESTION}")
    sent_context = content[len(prefix):-len(f"\n\n{QUESTION}")]
    assert 0 < len(sent_context) <= CONTEXT_MAX_CHARS
    assert "\n" not in sent_context and "\r" not in sent_context and "\t" not in sent_context


def test_context_over_2000_characters_is_422(api, genie):
    assert ask(api, context="x" * 2001).status_code == 422
    assert ask(api, context="x" * 2000).status_code == 200
    assert len(genie.calls) == 1


@pytest.mark.parametrize("bad", ["../etc", "has space", "x" * 65, ""])
def test_bad_conversation_id_is_422(api, genie, bad):
    assert ask(api, conversation_id=bad).status_code == 422
    assert genie.calls == []


def test_settings_endpoint_reports_mode_and_host(api, settings):
    settings.HELIX_IDENTITY_MODE = "shared"
    resp = api.get("/api/settings/helix")
    assert resp.status_code == 200
    assert resp.json() == {
        "enabled": True, "mode": "shared", "workspace_host": "https://test-databricks.com",
    }


def test_put_settings_toggles_helix_enabled(api, settings, db_session):
    settings.HELIX_ENABLED = False  # the settings manager and Helix share this object
    assert api.get("/api/settings/helix").status_code == 404

    resp = api.put("/api/settings", json={"helix_enabled": True})
    assert resp.status_code == 200
    assert app_settings_repo.get_by_key(db_session, "HELIX_ENABLED") == "true"
    assert api.get("/api/settings/helix").json()["enabled"] is True
    assert api.get("/api/settings").json()["helix_enabled"] is True

    api.put("/api/settings", json={"helix_enabled": False})
    assert app_settings_repo.get_by_key(db_session, "HELIX_ENABLED") == "false"
    assert api.get("/api/settings/helix").status_code == 404
