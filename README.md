# A2Human

A person publishes an agent card, writes what each skill can finish, and goes on duty. A model reads one on-duty list, picks someone, and sends the task to that person's address. The person does the work on the page and hands the artifact back.

This is a local demo. There is no login and no authentication. The browser only remembers your agent id. Deleting `data/store.json` returns the roster to empty. A remote model can call in only when this service is reachable from the public internet.

The screenshots below use the English interface. Names, bios, and task text stay in whatever language the person wrote.

## Demo

The home page. Publish, go on duty, then wait for a model to send a task that matches a skill. Each person on duty shows completed tasks, average score, and average time.

![Home: publish, go on duty, get delegated, plus the people on duty and the URLs for models](docs/demo/home.png)

The on-duty list. This is the page a model reads: the people, their skills, and each person's address. The panel on the right copies the discovery URL and the MCP fallback.

![On-duty list, with the discovery URL and the MCP fallback](docs/demo/duty.png)

My card. Clock in or out on the left. Tasks sent to you are on the right. A new task that is still open pops up in the corner.

![My card and the tasks sent to you](docs/demo/me.png)

A finished task. The person handed the artifact back, the dispatching model scored it, and the score stays on the task.

![A delivered task, with the artifact and the score](docs/demo/task.png)

## How to use it

The examples use `http://localhost:3847`. After the service is on the public internet, replace that origin with the address copied from the page.

### A person

1. Install, start, and open [http://localhost:3847](http://localhost:3847).

   ```bash
   npm install
   npm run dev
   ```

2. Choose **Publish my card**. You write the name, bio, and skills. Add 1 to 6 skills, and say what each one can finish. Build the input and output from a name, a type, whether it is required, and a short note, or write JSON Schema directly.
3. After publishing, open **My card** and choose **Go on duty**. Only people on duty appear in the discovery list, and only then can they receive a task.
4. Tasks sent to you are listed on the right of **My card**. A task that arrives after the page is open, and is still unfinished, pops up at the bottom right as **New work**, with the title, the request, and who sent it. Up to three stack. **Open** opens the task. **Dismiss** closes the notice. The notice stays down while you are already on that task.
5. Open the task, hand back work that matches the output, and choose **Submit work**. A task in progress can also be marked **Needs input**, **Reject**, **Fail**, or **Cancel**. After you ask for input, the model sends another `SendMessage` with the same task id and the task returns to in progress.
6. After the artifact is in, the task waits for the dispatching model to score it. When the model replies with `{"score":4}`, the score is recorded for the person who did the work and the task becomes delivered. The score is an integer from 1 to 5. If the model does not reply within 60 seconds, that score request is dropped, the task ends as delivered, and no score is recorded. A person cannot start a score request. Delivered, rejected, failed, and canceled tasks stay as they are.
7. Choose **Clock out** when you are done. The card leaves the discovery list. The header switches between Simplified Chinese and English, and the choice stays in this browser. On another browser, publish again.

The three numbers on a card: completed counts only delivered tasks. The average score uses only the delivered tasks that have a score, to one decimal place. The average time is how long those delivered tasks took from dispatch to completion.

### A model: A2A

The discovery URL is `/.well-known/agent-card.json`. `a2human.onDuty` is the people currently on duty, the skills they wrote, and each person's address.

```bash
curl -s http://localhost:3847/.well-known/agent-card.json
```

Read the skill descriptions, pick one person from `onDuty`, and send `SendMessage` to that person's own address. Set `configuration.returnImmediately` to `true`. The returned `result.task.status.state` is `TASK_STATE_WORKING`.

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"Finish this using your skill."}]}}}'
```

After the person submits the artifact, fetch the task again. The state is `TASK_STATE_INPUT_REQUIRED`, the artifact is in `artifacts`, and `status.message` is `{"request":"score","taskId":"<task id>","person":"<name>","artifact":"<artifact>"}`. Send `{"score":4}` with the same task id and the state becomes `TASK_STATE_COMPLETED`.

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"<task id from the response above>"}}'
```

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":3,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-2","contextId":"<contextId from above>","taskId":"<task id from above>","parts":[{"data":{"score":4}}]}}}'
```

`SendMessage` to the discovery URL is rejected and tells the caller to pick an address from `onDuty`. The discovery URL does not assign work for you. A person who is off duty rejects the call. Sending the same `messageId` again does not open a second task. `A2A-Version` accepts only `1.0` and `0.3`. Streaming and push are not supported. The caller cancels with `CancelTask`.

The same completed count, average score, and average time are on that person's A2A card as `a2human.completed`, `a2human.averageScore`, and `a2human.averageDuration`, and on `onDuty` in the discovery list.

### A model: MCP

A client that only speaks MCP adds `http://localhost:3847/api/mcp` as an MCP server. This is the fallback. Each on-duty skill becomes a tool, and the call still goes to that person's own A2A address. While the person is still working, call again with `task_id`. After the person hands the artifact back, call again with `task_id` and `score`. A client that speaks A2A keeps using the discovery URL above.

When a skill declares flat input fields whose names are English identifiers and whose types are string, integer, number, boolean, or image, those fields are the tool arguments. An image is an http URL or `data:image/png;base64,…`. A URL ending in `.jpg`, `.jpeg`, `.webp`, or `.gif` is sent as that type. A nested schema, or a field name that is not an English identifier, is one `prompt` argument. The tool list follows the people who are on duty.

### How one task moves

| State | When |
| --- | --- |
| `TASK_STATE_WORKING` | The model sends `SendMessage` to this person's address, and the task starts immediately |
| `TASK_STATE_INPUT_REQUIRED` | The person asks for more input, or has delivered and is waiting for a score |
| `TASK_STATE_WORKING` | After a request for input, the model sends `SendMessage` again with the same task id |
| `TASK_STATE_COMPLETED` | The model scored the work, or 60 seconds passed with no score and the score request was dropped |
| `TASK_STATE_REJECTED` | The person rejected it |
| `TASK_STATE_FAILED` | The person marked it failed |
| `TASK_STATE_CANCELED` | The person or the caller canceled it |

### Skills and artifacts

An A2A AgentSkill has `inputModes` and `outputModes`, and no schema field. On the card those two are `application/json`, and the schema lives in the extension `capabilities.extensions[].params.skillSchemas`. The discovery list hangs the same schema on `onDuty[].skills`. The note for a field is that field's `description`.

The model puts JSON that matches the schema in `parts[].data`. An image field uses an `image/png`, `image/jpeg`, `image/webp`, or `image/gif` part, with the bytes in `raw` (base64) or an http URL. The artifact a person hands back has to match the output schema: every field, type, and required value must be present. Extra fields are refused, and free text is refused. `GetTask` returns that JSON in `data`. A returned image uses the same kind of image part. With no output schema, the artifact is a piece of text. An image uploaded on the page must be 1MB or smaller.

## Codespaces

`.devcontainer` installs dependencies when the Codespace starts and runs `npm run dev`, with port 3847 published. Copy the forwarded address for 3847 from the Codespace Ports panel. That address is what the browser and the model use. The default idle timeout is 30 minutes; you can make it longer when you create the Codespace. After it sleeps, the address stops answering. `data/store.json` stays on that Codespace.

```bash
npm test
npm run lint
```
