# A2Human

One server, kept running on our side. You open the site, publish a card, and go on duty. A model copies the discovery URL or the MCP URL from that same page. There is nothing to install, no port to forward, and no Codespace to keep awake.

```text
discovery   <origin>/.well-known/agent-card.json
mcp         <origin>/api/mcp
```

`<origin>` is the site you are looking at. The page already fills it in.

There is no account. This browser remembers your card, so another browser means publishing again. The header switches between English and Simplified Chinese, and that choice stays here. Cards and tasks live on the server, in `data/store.json`.

## Demo

Home. Publish, go on duty, and see who is already working.

![Home](docs/demo/home.png)

On duty. Who is working, what they can do, and where to send a task.

![On duty](docs/demo/duty.png)

My card. Go on duty or clock out, and see the tasks sent to you.

![My card](docs/demo/me.png)

A delivered task. The work is in, and the model that sent it left a score.

![A delivered task](docs/demo/task.png)

## People

1. **Publish my card.** Name, bio, and 1 to 6 skills. Each skill says what you can finish. Spell the input and output as fields (name, type, required, a note) or paste JSON Schema.
2. Open **My card** and choose **Go on duty**. You join the discovery list only after that, and that is when tasks can arrive.
3. Tasks show on the right of My card. One that arrives while the page is open pops up at the bottom right as **New work**: title, request, and who sent it, up to three at once. **Open** goes to the task. **Dismiss** closes the notice. It stays quiet while you are already on that task.
4. **Submit work** when you are done. You can also mark the task **Needs input**, **Reject**, **Fail**, or **Cancel**. After you ask for input, the model sends again with the same task id and the task returns to in progress.
5. A submitted task waits for a score from the model that sent it. The score is an integer from 1 to 5, stored on you, and the task becomes delivered. If the model is silent for 60 seconds, the score is dropped and the task is still delivered, with no score. You cannot ask to be scored. Delivered, rejected, failed, and canceled tasks stay as they are.
6. **Clock out** to leave the discovery list.

The three numbers on a card use delivered tasks only. The average score skips tasks with no score and keeps one decimal. The average time runs from dispatch to delivery.

## Models

Copy the discovery URL from the page if the client speaks A2A. Copy the MCP URL if MCP is all it speaks. Both end at the same person. The curls below use that copied origin.

### A2A

`a2human.onDuty` lists who is on duty, the skills they wrote, and each person's URL. Send `SendMessage` to that person's URL, with `configuration.returnImmediately` set to `true`. The task starts as `TASK_STATE_WORKING`.

```bash
curl -s <origin>/.well-known/agent-card.json
```

```bash
curl -s <origin>/api/a2a/<id> \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"Finish this using your skill."}]}}}'
```

After the person submits, `GetTask` returns `TASK_STATE_INPUT_REQUIRED`. The result is in `artifacts`. `status.message` is `{"request":"score","taskId":"...","person":"...","artifact":"..."}`. Reply on the same task id with `{"score":4}` and the state becomes `TASK_STATE_COMPLETED`.

```bash
curl -s <origin>/api/a2a/<id> \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"<task id>"}}'
```

```bash
curl -s <origin>/api/a2a/<id> \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":3,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-2","contextId":"<contextId>","taskId":"<task id>","parts":[{"data":{"score":4}}]}}}'
```

`a2human.completed`, `a2human.averageScore`, and `a2human.averageDuration` are on that person's card and on each `onDuty` entry.

A few limits:

- You choose the person. The discovery URL only lists who is on duty.
- A person who is off duty rejects the call.
- The same `messageId` returns the existing task.
- `A2A-Version` is `1.0` or `0.3`. Streaming and push are unsupported.
- Cancel with `CancelTask`.

### MCP

Add `<origin>/api/mcp` as an MCP server. Each skill of each person on duty becomes a tool, and the call still goes to that person's A2A address. Call again with `task_id` while they are working. After they deliver, call again with `task_id` and `score`.

A flat input whose names are English identifiers, typed `string`, `integer`, `number`, `boolean`, or image, becomes the tool's arguments. An image is an http URL or `data:image/png;base64,…`. A URL ending in `.jpg`, `.jpeg`, `.webp`, or `.gif` is sent as that type. A nested schema, or a name that is not an English identifier, arrives as one `prompt` string.

### What goes in the message

An AgentSkill has no schema field, so `inputModes` and `outputModes` are `application/json`. The schema sits in `capabilities.extensions[].params.skillSchemas`, and again on `onDuty[].skills`. A field's note is its `description`.

Put JSON in `parts[].data`. Put a picture in an `image/png`, `image/jpeg`, `image/webp`, or `image/gif` part, using base64 `raw` or an http URL. The result has to match the output schema: required fields, the right types, no extra fields, and no free text when a schema is declared. `GetTask` returns that JSON in `data`, and a picture as the same kind of image part. With no output schema, the result is plain text. A picture uploaded in the browser has to be 1MB or smaller.

## The server

This is the one machine we keep up. People do not run it.

```bash
docker build -t a2human .
docker run -d --name a2human --restart unless-stopped -p 3847:3847 -v a2human-data:/app/data a2human
```

`--restart unless-stopped` brings it back when the machine boots. The volume keeps `data/store.json` across image updates. To ship a new build, `docker rm -f a2human` and run the same command again. The volume stays.

Working on the code locally:

```bash
npm install
npm run dev
```

That is only for development. It listens on [http://localhost:3847](http://localhost:3847).

```bash
npm test
npm run lint
```
