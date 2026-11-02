# A2Human

**Put a person on the tool list.**

A model hires someone who is on duty, over A2A or MCP. You pick the person. Discovery only lists who is on duty. Score is 1–5 from the sending model. Silence for 60 seconds drops the score; the task is still delivered.

## Deployments

**Live market: https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev**

This demo is a GitHub Codespace public port. The URL can change if the Codespace is rebuilt or sleeps.

```text
discovery   https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev/.well-known/agent-card.json
mcp         https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev/api/mcp
```

Set `ORIGIN` to that host, or to your own market, and use it in the calls below.

```bash
ORIGIN=https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev
```

## Go on duty

1. Open the market. **Publish my card**: name, bio, 1–6 skills.
2. On **My card**, **Go on duty**. You are absent from `onDuty` until then.
3. When work arrives, submit it, or mark **Needs input** / **Reject** / **Fail** / **Cancel**.
4. **Clock out** to leave the list. Calls to an off-duty person are rejected.

The card URL is `$ORIGIN/api/a2a/<id>`. `onDuty[].url` is the same address.

## Connect with A2A

Versions `1.0` and `0.3`. Header `A2A-Version`. No streaming, no push. The same `messageId` replays the first result.

1. Read who is on duty.

```bash
curl -s "$ORIGIN/.well-known/agent-card.json"
```

```json
{
  "supportedInterfaces": [{ "url": "https://example/api/a2a", "protocolBinding": "JSONRPC", "protocolVersion": "1.0" }],
  "a2human": {
    "onDuty": [{ "name": "Ada", "url": "https://example/api/a2a/<id>", "skills": [{ "name": "count" }] }]
  }
}
```

Skill schemas, when present, are under `capabilities.extensions[].params.skillSchemas` and `onDuty[].skills`, not inside `AgentSkill`.

2. Send the task. `returnImmediately` must be `true`. Put JSON in `parts[].data`. Images are `image/png`, `jpeg`, `webp`, or `gif` (`raw` base64 or an http URL).

```bash
curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"metadata":{"skill":"count"},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"Finish this using your skill."}]}}}'
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "task": {
      "id": "<task>",
      "status": { "state": "TASK_STATE_WORKING" },
      "metadata": { "claimantName": "Ada" }
    }
  }
}
```

3. Poll until the person submits. `GetTask` then asks for a score (`TASK_STATE_INPUT_REQUIRED`). The status text is JSON: `{"request":"score","taskId":"<task>","person":"Ada","artifact":"..."}`.

```bash
curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"<task>"}}'
```

4. Score within 60 seconds. Send `{"score":4}` on the **same task id** (integer 1–5, only key `score`). The state becomes `TASK_STATE_COMPLETED`. If you never reply, the score is dropped and the task still completes with the artifact.

```bash
curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":3,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"score-1","taskId":"<task>","parts":[{"mediaType":"application/json","data":{"score":4}}]}}}'
```

5. Cancel while the task is still open.

```bash
curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":4,"method":"CancelTask","params":{"id":"<task>"}}'
```

`TASK_STATE_CANCELED` comes back. A second cancel is `-32002`.

## Connect with MCP

One URL, `POST $ORIGIN/api/mcp`. `GET` is `405`. Each on-duty skill is a tool named `a2h_...`. Flat English fields (`string`, `integer`, `number`, `boolean`, image) are arguments. Anything else is one `prompt`. The call still goes to that person's A2A address.

List tools after initialize (legacy) or with the stateless headers below:

```bash
curl -s "$ORIGIN/api/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`a2h_score` is always on the list. Its arguments are `taskId` and `score`.

### Legacy: initialize, then optional Tasks

No `MCP-Protocol-Version` header. Handshake first.

```bash
curl -s "$ORIGIN/api/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"cursor","version":"1"}}}'
```

```json
{
  "jsonrpc": "2.0",
  "id": "init",
  "result": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "tools": { "listChanged": false },
      "tasks": { "list": {}, "cancel": {}, "requests": { "tools": { "call": {} } } }
    },
    "serverInfo": { "name": "a2human", "version": "0.1.0" }
  }
}
```

`2024-11-05`, `2025-03-26`, and `2025-06-18` negotiate, but they do not advertise `capabilities.tasks` (tools only). An unknown version falls back to `2025-11-25`.

**2025-11-25 Tasks.** Pass `params.task` on `tools/call`. The call returns immediately. `pollInterval` is 5000 ms. `ttl` is 7 days.

```bash
curl -s "$ORIGIN/api/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"a2h_<tool>","arguments":{"scene":"three circles"},"task":{}}}'
```

```json
{
  "result": {
    "task": {
      "taskId": "<task>",
      "status": "working",
      "ttl": 604800000,
      "pollInterval": 5000
    }
  }
}
```

Poll `tasks/get` with `{"taskId":"<task>"}`. When the person delivers, `status` is `input_required` and `statusMessage` tells you to call `a2h_score`. Then `tasks/result` returns the ask or, after a score, the artifact.

```bash
curl -s "$ORIGIN/api/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tasks/get","params":{"taskId":"<task>"}}'
```

Score within 60 seconds. Do not pass `task` to `a2h_score`.

```bash
curl -s "$ORIGIN/api/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"a2h_score","arguments":{"taskId":"<task>","score":4}}}'
```

```json
{ "result": { "content": [{ "type": "text", "text": "{\"count\":3}" }] } }
```

`tasks/list` pages tasks. `tasks/cancel` with `{"taskId":"<task>"}` calls A2A `CancelTask`. A second cancel of a finished task is `-32602`.

**Tools only** (no `params.task`, or an older protocol). `tools/call` waits up to 15 seconds. If the person is still working, the text says to call the same tool again with `task_id`. After delivery, call it with `task_id` and `score`.

### Stateless: 2026-07-28

No `initialize`. Every request needs these headers, and the same version inside `_meta`. `Mcp-Method` must equal the JSON-RPC method. `Mcp-Name` is the tool name on `tools/call`, and the `taskId` on `tasks/get`, `tasks/update`, and `tasks/cancel`.

```text
MCP-Protocol-Version: 2026-07-28
Mcp-Method: tools/call
Mcp-Name: a2h_<tool>
content-type: application/json
```

```json
"_meta": {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {
    "extensions": { "io.modelcontextprotocol/tasks": {} }
  }
}
```

A header that does not match `_meta` is `-32020`. An unknown version is `-32022`.

1. Discover (optional).

```bash
curl -s "$ORIGIN/api/mcp" \
  -H 'content-type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"extensions":{"io.modelcontextprotocol/tasks":{}}}}}}'
```

`resultType` is `complete`. `supportedVersions` includes `2026-07-28` and `2025-11-25`. `capabilities.extensions["io.modelcontextprotocol/tasks"]` is `{}`.

2. Send. A client that declares the tasks extension gets `resultType: "task"` at once. Do not send `params.task`. `ttlMs` is 7 days. `pollIntervalMs` is 5000.

```bash
curl -s "$ORIGIN/api/mcp" \
  -H 'content-type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: a2h_<tool>' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"a2h_<tool>","arguments":{"scene":"three circles"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"extensions":{"io.modelcontextprotocol/tasks":{}}}}}}'
```

```json
{
  "result": {
    "resultType": "task",
    "taskId": "<task>",
    "status": "working",
    "ttlMs": 604800000,
    "pollIntervalMs": 5000
  }
}
```

3. Poll `tasks/get`. Set `Mcp-Method: tasks/get` and `Mcp-Name: <task>`. While working, `resultType` is `complete` and `status` is `working`. After delivery, `status` is `input_required` and `inputRequests.score` asks for 1–5. There is no `tasks/result` and no `tasks/list` (`-32601`).

4. Score within 60 seconds. Either call `a2h_score` (`Mcp-Name: a2h_score`, arguments `taskId` and `score`) or `tasks/update`:

```bash
curl -s "$ORIGIN/api/mcp" \
  -H 'content-type: application/json' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: tasks/update' \
  -H 'Mcp-Name: <task>' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tasks/update","params":{"taskId":"<task>","inputResponses":{"score":{"action":"accept","content":{"score":4}}},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"extensions":{"io.modelcontextprotocol/tasks":{}}}}}}'
```

```json
{ "result": { "resultType": "complete" } }
```

The next `tasks/get` is `status: "completed"` and `result.content[0].text` is the artifact. If you never score, the task still completes and the artifact is still there.

5. Cancel. `Mcp-Method: tasks/cancel`, `Mcp-Name: <task>`, params `{"taskId":"<task>"}`. The ack is `{ "resultType": "complete" }` with no `status`. A later `tasks/get` is `cancelled`.

A 2026-07-28 client that omits `io.modelcontextprotocol/tasks` keeps the 15-second tools fallback (`resultType: "complete"` and a `task_id` in the text). `tasks/get` without that extension is `-32021`.

## Run your own market

Port 3847. Postgres stores the market. Redis wakes pollers and caches cards.

```bash
docker compose up --build -d
```

`/api/health` is liveness. `/api/ready` checks Postgres and Redis. Copy an old `store.json` once with `python -m a2human.import_store data/store.json`.

A Codespace on this repo starts Postgres and Redis and forwards port 3847.
