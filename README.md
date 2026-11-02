# A2Human

**Put a person on the tool list.**

A human-as-tool market. Publish a card, go on duty, and a model hires that person over A2A or MCP.

- One origin stays up. No account, no install, no port to forward.
- The skill on the card is the job. Off duty, you leave the list.
- Score is an integer 1–5 from the model that sent the task. Silent 60s, the score drops and the task is still delivered.
- Header: English / 中文. This browser remembers your card.

**Live market: https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev**

This demo currently runs on a GitHub Codespace public port, so the URL can change if the Codespace is rebuilt or sleeps.

```text
discovery   https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev/.well-known/agent-card.json
mcp         https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev/api/mcp
```

`A2A 1.0 · 0.3` · `MCP fallback` · `score 1–5` · `60s` · `EN / 中文`

```text
you      publish a card  →  go on duty
model    read onDuty     →  SendMessage to that url      A2A
         or call a tool  →  same person, same address    MCP
you      submit the work
model    score 1–5 within 60s
```

## See it

<table>
<tr>
<td width="50%">

![Home. Publish, go on duty, see who is working.](docs/demo/home.png)

**Home.** Publish and see who is on duty.

</td>
<td width="50%">

![On duty. Skills and where a task goes.](docs/demo/duty.png)

**On duty.** Skills, and the address.

</td>
</tr>
<tr>
<td width="50%">

![My card. Clock in or out. Tasks on the right.](docs/demo/me.png)

**My card.** Duty switch. Tasks on the right.

</td>
<td width="50%">

![Delivered. The model left a score.](docs/demo/task.png)

**Delivered.** Work in. Score on it.

</td>
</tr>
</table>

## 1. 加入：假装成 agent 上工

You are the tool. This browser is the client. Another browser means publishing again. Cards and tasks live in `data/store.json`.

1. **Publish my card.** Name, bio, 1–6 skills. Each skill says what you can finish. Input and output: fields (name, type, required, a note) or JSON Schema.
2. **Go on duty** on My card. You join discovery only then.
3. Tasks sit on the right. **New work** pops up (title, request, sender, up to three). **Open** or **Dismiss**. Already on that task, it stays quiet.
4. **Submit work**, or **Needs input** / **Reject** / **Fail** / **Cancel**. Needs input: the model sends the same task id and it returns to in progress.
5. The model scores 1–5. You cannot ask. 60s of silence drops the score; the task is still delivered. Delivered, rejected, failed, and canceled stay as they are.
6. **Clock out** to leave the list.

Card numbers use delivered tasks only. Average score skips unscored tasks and keeps one decimal. Average time is seconds from dispatch to delivery.

## 2. 接入方式使用说明

You are the caller. Two doors, one person. You pick who. Discovery only lists people on duty.

### A2A

`a2human.onDuty` has the skills and each person's URL. `SendMessage` with `configuration.returnImmediately: true` starts `TASK_STATE_WORKING`.

```bash
ORIGIN=https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev

curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"Finish this using your skill."}]}}}'
```

After submit, `GetTask` is `TASK_STATE_INPUT_REQUIRED`. The result is in `artifacts`. `status.message` is `{"request":"score","taskId":"...","person":"...","artifact":"..."}`. Reply on the same task id with `{"score":4}` only. The state becomes `TASK_STATE_COMPLETED`.

```bash
ORIGIN=https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev

curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"<task id>"}}'

curl -s "$ORIGIN/api/a2a/<id>" \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":3,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-2","contextId":"<contextId>","taskId":"<task id>","parts":[{"data":{"score":4}}]}}}'
```

`a2human.completed`, `averageScore`, and `averageDuration` (seconds) are on the card and on each `onDuty` entry.

- Off duty rejects the call. The same `messageId` returns the existing task.
- `A2A-Version` is `1.0` or `0.3`. Streaming and push are unsupported. Cancel with `CancelTask`.

### MCP

Add `https://special-chainsaw-96w7vv6jjpwp26gg-3847.app.github.dev/api/mcp`. Each on-duty skill is a tool. The call still goes to that person's A2A address. It waits up to 15 seconds.

- Still working: call again with `task_id`.
- Delivered: call again with `task_id` and `score` (integer 1–5).
- A flat object of English identifiers (a letter or `_`, then letters, digits, or `_`), each `string`, `integer`, `number`, `boolean`, or image, becomes the arguments. Anything else arrives as one `prompt` string.
- An image is an http or https URL, or `data:image/png;base64,…` (`jpeg`, `webp`, `gif` too). A URL ending in `.jpg`, `.jpeg`, `.webp`, or `.gif` uses that type. Any other URL is `image/png`.

### Payload

- Schemas sit in `capabilities.extensions[].params.skillSchemas` and on `onDuty[].skills`. A field note is `description`. AgentSkill has no schema field.
- With both schemas set, modes are `application/json` for data, plus `image/png`, `image/jpeg`, `image/webp`, `image/gif` when a field is an image.
- JSON goes in `parts[].data`. A picture is one of those image parts: base64 `raw`, or an http or https URL.
- Output must match the schema: required fields, right types, no extras, no free text when a schema is declared.
- `GetTask` returns JSON in `data` and a picture as the same image part. No output schema: plain text. A browser upload is 1MB or smaller.

## Server ops

People do not run this. One machine stays up.

```bash
docker build -t a2human .
docker run -d --name a2human --restart unless-stopped -p 3847:3847 -v a2human-data:/app/data a2human
```

The volume keeps `data/store.json`. To ship a new image: `docker rm -f a2human`, then the same `docker run`. The volume stays.

```bash
npm install
npm run dev
```

Development only. It listens on port 3847.

```bash
npm test
npm run lint
```
