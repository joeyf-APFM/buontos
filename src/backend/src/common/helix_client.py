"""Client for Databricks Genie One streaming responses, used by Ask Helix.

Messages never include response bodies or headers (they may carry tokens).
"""

import json
from dataclasses import dataclass
from typing import AsyncIterator, Iterable, Iterator, Literal, Optional

import httpx

ONECHAT_PATH = "/api/2.0/data-rooms/tools/onechat/responses"
CONTEXT_MAX_CHARS = 500

_STOPPED = "Genie One stopped answering."
_FAILED = "Genie One reported an error."


@dataclass(frozen=True)
class HelixEvent:
    kind: Literal["conversation", "text", "sql", "result", "done", "error"]
    data: dict


def build_request(question: str, *, context: Optional[str], conversation_id: Optional[str]) -> dict:
    content = question
    if context:
        flat = " ".join(context.split())[:CONTEXT_MAX_CHARS]
        if flat:
            content = f"The user is looking at: {flat}\n\n{question}"
    body: dict = {
        "input": [{"type": "message", "role": "user", "content": content}],
        "enable_viz": False,
        "source": "apfm_helix",
    }
    if conversation_id:
        body["conversationId"] = conversation_id
    return body


def _error_message(event: dict) -> str:
    err = event.get("error")
    if isinstance(err, dict) and isinstance(err.get("message"), str):
        return err["message"]
    if isinstance(err, str):
        return err
    if isinstance(event.get("message"), str):
        return event["message"]
    return _FAILED


def _map_event(event: dict) -> Iterator[HelixEvent]:
    etype = str(event.get("type") or "")
    if "error" in etype:
        yield HelixEvent("error", {"message": _error_message(event)})
        return
    response = event.get("response") if isinstance(event.get("response"), dict) else {}
    if etype == "response.created":
        cid = event.get("conversation_id")
        if cid:
            yield HelixEvent("conversation", {"conversation_id": cid})
    elif etype == "response.done":
        if response.get("status") == "failed":
            yield HelixEvent("error", {"message": _error_message(response)})
        else:
            yield HelixEvent("done", {})
    elif etype in ("response.output_item.added", "response.output_item.done"):
        item = event.get("item") if isinstance(event.get("item"), dict) else {}
        itype = item.get("type")
        meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        if itype == "function_call" and meta.get("query") and etype.endswith(".added"):
            yield HelixEvent("sql", {"sql": meta["query"]})
        elif itype == "function_call_output" and etype.endswith(".done"):
            rd = meta.get("result_data")
            if isinstance(rd, dict):
                yield HelixEvent(
                    "result",
                    {
                        "columns": [c.get("name") for c in rd.get("columns") or [] if isinstance(c, dict)],
                        "rows": rd.get("preview_rows") or [],
                        "total": rd.get("total_row_count"),
                        "warehouse_id": meta.get("warehouse_id"),
                    },
                )
        elif itype == "message" and etype.endswith(".done"):
            text = "".join(
                p.get("text") or ""
                for p in item.get("content") or []
                if isinstance(p, dict) and p.get("type") == "output_text"
            )
            if text:
                yield HelixEvent("text", {"text": text})


def parse_events(lines: Iterable[str]) -> Iterator[HelixEvent]:
    for raw in lines:
        line = raw.strip()
        if line.startswith("data:"):
            line = line[5:].strip()
        if not line.startswith("{"):
            continue
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if isinstance(event, dict):
            yield from _map_event(event)


def _base_url(host: str) -> str:
    host = host.strip().rstrip("/")
    if not host.startswith(("https://", "http://")):
        host = f"https://{host}"
    return host


async def stream_answer(
    host: str,
    auth_headers: dict,
    body: dict,
    *,
    timeout_s: float = 600,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> AsyncIterator[HelixEvent]:
    """Stream parsed events; any failure becomes one final error event."""
    url = _base_url(host) + ONECHAT_PATH
    try:
        async with httpx.AsyncClient(timeout=timeout_s, transport=transport) as client:
            async with client.stream("POST", url, headers=auth_headers, json=body) as resp:
                if resp.status_code >= 400:
                    yield HelixEvent(
                        "error", {"message": f"Genie One didn't answer (HTTP {resp.status_code})."}
                    )
                    return
                async for line in resp.aiter_lines():
                    for ev in parse_events([line]):
                        yield ev
    except httpx.HTTPError:
        yield HelixEvent("error", {"message": _STOPPED})
