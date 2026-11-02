# A2Human

Hire someone who is on duty over A2A or MCP.

## Deployments

**UI: https://keyficller.github.io/A2Human/**

Static GitHub Pages. Enable once: Settings → Pages → Build and deployment → Source: GitHub Actions.

**API host (Aliyun):** http://39.107.44.85:3847

Pages uses the Actions variable `NEXT_PUBLIC_API_ORIGIN`. That variable is already set on the repo to `http://39.107.44.85:3847`.

```bash
ORIGIN=http://39.107.44.85:3847
```

## Go on duty

Publish a card, then **Go on duty**. You show up on `onDuty` only then. Clock out to leave the list. Off duty rejects the call. The person URL is `$ORIGIN/api/a2a/<id>`.

## A2A

Header `A2A-Version: 1.0` or `0.3`. `returnImmediately` must be `true`. The same `messageId` replays. No streaming or push.

1. `GET $ORIGIN/.well-known/agent-card.json` and pick `a2human.onDuty[].url`.
2. `SendMessage` to that URL. Poll `GetTask` until `TASK_STATE_INPUT_REQUIRED`.
3. Within 60s, `SendMessage` again with `taskId` and `{"score":4}` (only key `score`).
4. `CancelTask` with `{"id":"<task>"}` while the task is open.

```bash
curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"metadata":{"skill":"count"},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"Finish this using your skill."}]}}}'
```

`result.task.id` is the task. Score by adding `"taskId":"<task>"` and `"parts":[{"mediaType":"application/json","data":{"score":4}}]`.

## MCP

`POST $ORIGIN/api/mcp`. Tool names are `a2h_...` from `tools/list`. After delivery, call `a2h_score` with `{taskId, score}` within 60s. Do not pass `task` on that call.

### Legacy initialize + 2025-11-25 Tasks

No protocol header. `initialize` with `"protocolVersion":"2025-11-25"` returns `capabilities.tasks`. `2024-11-05`, `2025-03-26`, and `2025-06-18` are tools only.

```bash
curl -s "$ORIGIN/api/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"a2h_<tool>","arguments":{"scene":"three circles"},"task":{}}}'
```

Reply is `result.task`: `{taskId, status:"working", pollInterval:5000, ttl:604800000}`. Poll `tasks/get` `{"taskId":"<task>"}` until `input_required`, then `a2h_score`. `tasks/result` returns the artifact. `tasks/cancel` takes `{"taskId":"<task>"}`.

Without `params.task`, the call waits 15s, then tells you to retry with `task_id` (and `score` after delivery).

### 2026-07-28 stateless

No `initialize`. On every call set `MCP-Protocol-Version: 2026-07-28`, `Mcp-Method` equal to the method, and `Mcp-Name` to the tool name (`tools/call`) or the `taskId` (`tasks/get`, `tasks/update`, `tasks/cancel`). Put the same version in `_meta`, plus the tasks extension:

```json
{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{"extensions":{"io.modelcontextprotocol/tasks":{}}}}
```

`tools/call` (no `params.task`) returns `resultType:"task"`, `taskId`, `pollIntervalMs:5000`. Poll `tasks/get` until `input_required`, then `a2h_score` or `tasks/update` (`inputResponses.score.content.score`). `tasks/cancel` acks `{resultType:"complete"}`. There is no `tasks/result` or `tasks/list`.

Omit `io.modelcontextprotocol/tasks` and the call waits 15s (`resultType:"complete"`).

## Run your own market

```bash
docker compose up --build -d
```

Port 3847. `/api/health` is liveness. `/api/ready` checks Postgres and Redis. Copy an old file once: `python -m a2human.import_store data/store.json`.
