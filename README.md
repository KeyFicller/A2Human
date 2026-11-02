# A2Human

**Put a person on the tool list.**

A human-as-tool market. Publish a card, go on duty, and a model hires that person over A2A or MCP.

- One origin stays up. No account, no install, no port to forward.
- The skill on the card is the job. Off duty, you leave the list.
- Score is 1–5 from the sending model. Silent 60s drops the score; the task is still delivered.
- English / Chinese. This browser remembers your card.

**Live market: https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev**

This demo currently runs on a GitHub Codespace public port, so the URL can change if the Codespace is rebuilt or sleeps.

```text
discovery   https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev/.well-known/agent-card.json
mcp         https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev/api/mcp
```

`A2A 1.0 · 0.3` · `MCP fallback` · `score 1–5` · `60s` · `EN / ZH`

```text
you      publish  →  on duty
model    onDuty   →  SendMessage        A2A
         or a tool → same person        MCP
you      submit
model    score 1–5 within 60s
```

## 1. Join: go on duty as an agent

1. **Publish my card.** Name, bio, 1–6 skills (fields or JSON Schema).
2. **Go on duty** on My card. You join the list only then.
3. **New work** (up to 3): **Open** or **Dismiss**.
4. **Submit work**, or **Needs input** / **Reject** / **Fail** / **Cancel**.
5. **Clock out** to leave the list.

## 2. Connect: A2A and MCP

You pick the person. Discovery only lists who is on duty.

Schemas: `capabilities.extensions[].params.skillSchemas` and `onDuty[].skills`. JSON goes in `parts[].data`. Images are `image/png`, `jpeg`, `webp`, or `gif`. Output must match the schema. A browser upload is 1MB or smaller.

### A2A

- `onDuty` lists skills and each URL. `SendMessage` with `returnImmediately: true` starts the task.
- After submit, `GetTask` asks for a score. Reply `{"score":4}` on the same task id.
- Off duty rejects. Same `messageId` replays. Version `1.0` or `0.3`. No streaming or push. `CancelTask` cancels.

```bash
ORIGIN=https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev
curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"Finish this using your skill."}]}}}'
```

### MCP

Same URL, two modes. The call still goes to that person's A2A address. Flat English identifiers (`string`, `integer`, `number`, `boolean`, image) are arguments. Anything else is one `prompt`.

- Legacy handshake: `initialize`. `2025-11-25` advertises `capabilities.tasks`. `tools/call` with `params.task` returns a handle (`pollInterval` 5000, `ttl` 7 days). Poll `tasks/get`, then `tasks/result`. `tasks/list` and `tasks/cancel` (A2A `CancelTask`) are supported. Older versions are tools-only.
- Stateless `2026-07-28`: no `initialize`. Send `MCP-Protocol-Version: 2026-07-28` and the same value in `_meta["io.modelcontextprotocol/protocolVersion"]`, plus `clientCapabilities`. `server/discover` lists versions. Tasks are the `io.modelcontextprotocol/tasks` extension: a client that declares it gets `resultType: "task"` from `tools/call` (no `params.task`). Poll `tasks/get` (`ttlMs`, `pollIntervalMs`; `result` is inline when completed; `inputRequests` when `input_required`). `tasks/update` answers those requests. `tasks/cancel` acks. There is no `tasks/result` or `tasks/list`.
- Both modes: delivery sets `input_required`. Call `a2h_score` with `taskId` and a 1–5 `score` within 60s. Silence drops the score; the task still completes. A call that does not opt into tasks waits up to 15s, then uses `task_id` and `score` on the same tool.

## Run your own market

One public port, 3847. Next.js serves the pages and proxies `/api` to the Python API. Data is `/app/data/store.json`.

- Docker.

```bash
docker build -t a2human .
docker run -d --name a2human --restart unless-stopped -p 3847:3847 -v a2human-data:/app/data a2human
```

- Local. Python 3.12 and Node.

```bash
pip install -e ".[dev]"
npm ci && npm run build && npm start
```

- Codespace: open the repo. `.devcontainer` installs both and forwards port 3847 publicly.
