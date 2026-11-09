"""Ask Helix: stream Databricks Genie One answers to the signed-in user.

Helix answers as the asking user (their on-behalf-of token) or, only in shared
mode, as one dedicated service principal. It never uses the app's own service
principal outside ENV=LOCAL, and never falls back from one identity to another.
Tokens, headers and the shared secret are never logged.
"""

import json
from typing import Annotated, Dict, Optional, Tuple

from databricks.sdk import WorkspaceClient
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.common.config import Settings, get_settings
from src.common.dependencies import AuditCurrentUserDep, AuditManagerDep, CurrentUserDep, DBSessionDep
from src.common.helix_client import build_request, stream_answer
from src.common.logging import get_logger
from src.common.workspace_client import get_workspace_client

logger = get_logger(__name__)

FEATURE_ID = "helix"
NO_USER_TOKEN = "Helix needs your Databricks sign-in."
SHARED_UNCONFIGURED = "Helix's shared identity isn't configured."
NO_HOST = "Helix has no Databricks workspace configured."
SIGN_IN_FAILED = "Helix couldn't sign in to Databricks."

router = APIRouter(prefix="/api", tags=["Helix"])

# Shared-mode clients, one per client id (the SDK refreshes their OAuth tokens).
_SHARED_CLIENTS: Dict[str, WorkspaceClient] = {}


class HelixAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    context: Optional[str] = None
    conversation_id: Optional[str] = Field(None, pattern=r"^[A-Za-z0-9_-]{1,64}$")


def get_helix_settings() -> Settings:
    return get_settings()


HelixSettingsDep = Annotated[Settings, Depends(get_helix_settings)]


def _is_local(settings: Settings) -> bool:
    return str(settings.ENV or "").upper().startswith("LOCAL")


def _require_enabled(settings: Settings) -> None:
    if not settings.HELIX_ENABLED:
        raise HTTPException(status_code=404, detail="Not Found")


def _shared_client(settings: Settings) -> WorkspaceClient:
    client_id = settings.HELIX_SHARED_CLIENT_ID
    secret = settings.HELIX_SHARED_CLIENT_SECRET
    if not client_id or not secret:
        raise HTTPException(status_code=503, detail=SHARED_UNCONFIGURED)
    if not settings.DATABRICKS_HOST:
        raise HTTPException(status_code=503, detail=NO_HOST)
    client = _SHARED_CLIENTS.get(client_id)
    if client is None:
        # auth_type pins M2M OAuth so no other credential in the environment is used.
        client = WorkspaceClient(
            host=settings.DATABRICKS_HOST,
            client_id=client_id,
            client_secret=secret,
            auth_type="oauth-m2m",
        )
        _SHARED_CLIENTS[client_id] = client
    return client


def _authenticate(ws: WorkspaceClient) -> Dict[str, str]:
    try:
        return ws.config.authenticate()
    except Exception as e:
        logger.warning("Helix sign-in failed (%s)", type(e).__name__)
        raise HTTPException(status_code=503, detail=SIGN_IN_FAILED) from None


def _identity(request: Request, settings: Settings) -> Tuple[str, str, Dict[str, str]]:
    """(mode, host, auth headers) for this ask; raises before any streaming."""
    if _is_local(settings):
        ws = get_workspace_client(settings)  # the developer's own CLI profile
        return "local", ws.config.host, _authenticate(ws)
    host = settings.DATABRICKS_HOST
    if settings.HELIX_IDENTITY_MODE == "shared":
        headers = _authenticate(_shared_client(settings))
        return "shared", host, headers
    # User mode: the user's own token or nothing. OBO_ALLOW_SP_FALLBACK is not consulted.
    token = request.headers.get("x-forwarded-access-token")
    if not token:
        raise HTTPException(status_code=403, detail=NO_USER_TOKEN)
    if not host:
        raise HTTPException(status_code=503, detail=NO_HOST)
    return "user", host, {"Authorization": f"Bearer {token}"}


async def _sse(host: str, headers: Dict[str, str], body: dict):
    async for event in stream_answer(host, headers, body):
        yield f"event: {event.kind}\ndata: {json.dumps(event.data)}\n\n"


@router.post("/helix/ask")
def ask_helix(
    request: Request,
    payload: HelixAskRequest,
    settings: HelixSettingsDep,
    db: DBSessionDep,
    audit_manager: AuditManagerDep,
    current_user: AuditCurrentUserDep,
):
    """Stream a Genie One answer as server-sent events."""
    _require_enabled(settings)
    details = {"mode": settings.HELIX_IDENTITY_MODE, "conversation_id": payload.conversation_id}
    success = False
    try:
        mode, host, headers = _identity(request, settings)
        details["mode"] = mode
        body = build_request(
            payload.question, context=payload.context, conversation_id=payload.conversation_id
        )
        success = True
    finally:
        audit_manager.log_action(
            db=db, username=current_user.username,
            ip_address=request.client.host if request.client else None,
            feature=FEATURE_ID, action="ASK", success=success, details=details,
        )
    return StreamingResponse(
        _sse(host, headers, body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/settings/helix")
def get_helix_config(settings: HelixSettingsDep, _current_user: CurrentUserDep):
    """Helix's state for the frontend (any authenticated user)."""
    _require_enabled(settings)
    host = settings.DATABRICKS_HOST
    if not host and _is_local(settings):
        host = get_workspace_client(settings).config.host
    return {
        "enabled": settings.HELIX_ENABLED,
        "mode": settings.HELIX_IDENTITY_MODE,
        "workspace_host": host or "",
    }


def register_routes(app):
    app.include_router(router)
    logger.info("Helix routes registered")
