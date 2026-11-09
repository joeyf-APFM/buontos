import asyncio
import json

import httpx

from src.common.helix_client import (
    CONTEXT_MAX_CHARS,
    HelixEvent,
    build_request,
    parse_events,
    stream_answer,
)


def _events():
    return [
        {"type": "response.created", "conversation_id": "conv-1", "response_id": "r1"},
        {
            "type": "response.output_item.added",
            "item": {
                "type": "function_call",
                "name": "run_sql",
                "metadata": {"query": "SELECT a, b FROM t"},
            },
        },
        {
            "type": "response.output_item.added",
            "item": {"type": "function_call_output", "metadata": {"warehouse_id": "w1"}},
        },
        {
            "type": "response.output_item.done",
            "item": {
                "type": "function_call_output",
                "metadata": {
                    "warehouse_id": "w1",
                    "result_data": {
                        "preview_rows": [["x", "1"], ["y", "2"]],
                        "columns": [
                            {"name": "a", "type_text": "STRING"},
                            {"name": "b", "type_text": "INT"},
                        ],
                        "total_row_count": "2",
                    },
                },
            },
        },
        {
            "type": "response.output_item.added",
            "item": {"type": "message", "content": [{"type": "output_text", "text": "partial"}]},
        },
        {
            "type": "response.output_item.done",
            "item": {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": "Two rows."}],
            },
        },
        {"type": "response.done", "response": {"status": "completed", "output": []}},
    ]


def _lines(prefix=""):
    return [prefix + json.dumps(e) for e in _events()]


def test_request_puts_plain_context_first():
    body = build_request("How many?", context="Table\nfoo " + "x" * 1000, conversation_id=None)
    content = body["input"][0]["content"]
    assert content.startswith("The user is looking at: Table foo ")
    assert content.endswith("\n\nHow many?")
    ctx = content[len("The user is looking at: ") : -len("\n\nHow many?")]
    assert len(ctx) == CONTEXT_MAX_CHARS and "\n" not in ctx
    assert body["input"][0]["type"] == "message" and body["input"][0]["role"] == "user"
    assert body["enable_viz"] is False and body["source"] == "apfm_helix"
    assert "conversationId" not in body


def test_request_without_context_is_just_the_question():
    assert build_request("Hi", context=None, conversation_id=None)["input"][0]["content"] == "Hi"


def test_follow_up_sends_conversation_id():
    body = build_request("More?", context=None, conversation_id="conv-1")
    assert body["conversationId"] == "conv-1"


def test_parses_conversation_sql_result_text_done_in_order():
    events = list(parse_events(_lines()))
    assert [e.kind for e in events] == ["conversation", "sql", "result", "text", "done"]
    assert events[0].data == {"conversation_id": "conv-1"}
    assert events[1].data == {"sql": "SELECT a, b FROM t"}
    assert events[2].data == {
        "columns": ["a", "b"],
        "rows": [["x", "1"], ["y", "2"]],
        "total": "2",
        "warehouse_id": "w1",
    }
    assert events[3].data == {"text": "Two rows."}


def test_sse_data_lines_are_accepted():
    lines = ["", "event: message", ": comment", "not json"] + _lines("data: ")
    assert [e.kind for e in parse_events(lines)] == [
        "conversation", "sql", "result", "text", "done",
    ]


def test_error_event_becomes_error():
    lines = [
        json.dumps({"type": "error", "error": {"message": "boom"}}),
        json.dumps({"type": "response.done", "response": {"status": "failed"}}),
    ]
    events = list(parse_events(lines))
    assert [e.kind for e in events] == ["error", "error"]
    assert events[0].data["message"] == "boom"
    assert events[1].data["message"]


def _collect(transport):
    async def run():
        return [
            e
            async for e in stream_answer(
                "example.cloud.databricks.com/",
                {"Authorization": "Bearer secret"},
                {"q": 1},
                transport=transport,
            )
        ]

    return asyncio.run(run())


def test_http_403_becomes_one_error_event():
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        return httpx.Response(403, text="secret-body")

    events = _collect(httpx.MockTransport(handler))
    assert seen["url"] == "https://example.cloud.databricks.com/api/2.0/data-rooms/tools/onechat/responses"
    assert events == [HelixEvent("error", {"message": "Genie One didn't answer (HTTP 403)."})]


def test_successful_stream_yields_parsed_events():
    body = "\n".join("data: " + json.dumps(e) for e in _events()).encode()
    events = _collect(httpx.MockTransport(lambda r: httpx.Response(200, content=body)))
    assert [e.kind for e in events] == ["conversation", "sql", "result", "text", "done"]


def test_dropped_stream_ends_with_error():
    class Dropping(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield (json.dumps(_events()[0]) + "\n").encode()
            raise httpx.ReadError("connection reset")

    events = _collect(httpx.MockTransport(lambda r: httpx.Response(200, stream=Dropping())))
    assert [e.kind for e in events] == ["conversation", "error"]
    assert events[-1].data == {"message": "Genie One stopped answering."}
