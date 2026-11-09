# Helix identity spike (Task 1)

## Scopes
- Profile `helix-spike` signed in with `--scopes "sql dashboards.genie"`: Genie One (`onechat/responses`) fails with "Invalid scope, required scopes: genie". `dashboards.genie` is not enough.
- The same login with `genie` added answers normally (one SQL call, a full answer).
- A Databricks app (`helix-spike`) accepts `genie` in `user_api_scopes`, alongside `sql` and `dashboards.genie`.
- `src/manifest.yaml` now requests `genie` (commit 1f9f1023). This is a consent change on apfm-ontos; users will be asked to approve it on the next deploy (owner's decision, 2026-11-09).

## Streaming
- From the deployed spike app, with the user's `x-forwarded-access-token`, `POST onechat/responses` returns HTTP 200. The stream reaches the browser in pieces over about 10 seconds (6 chunks at 0.3s, 6.1s, 6.2s, 7.4s, 10.6s and 10.7s), so the Apps proxy does not buffer.
- Genie One gzip-compresses the stream. The spike relayed raw bytes and showed gzip in the browser; buontos' `helix_client.stream_answer` uses `aiter_lines()`, which decompresses, so it is unaffected.

## Conversation URL
Not found. "Open in Databricks" stays left out.

## Decision
User mode works on the deployed app: **yes**, with `genie` in `user_api_scopes`. `HELIX_IDENTITY_MODE` stays `user` (the app.yaml default). Shared mode remains available as a fallback.

The spike app `helix-spike` and its workspace folder were deleted on 2026-11-09.
