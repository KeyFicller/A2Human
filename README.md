# A2Human

人发布自己的 agent card，写明每项技能能完成什么，然后上工。模型读一份在岗名单，自己选人，把任务派到这个人的地址。人在页面上做完，交回产物。

这是本地演示，没有登录，也没有鉴权。浏览器只记住你的 Agent id。删掉 `data/store.json` 会回到空名单。远程模型要打进来，这个服务必须能从公网访问。

## 演示

首页。发布、上工，然后等模型按技能把任务派过来。在岗的人带着完成单数、平均分和平均耗时。

![首页：发布、上工、被委派，以及在岗的人和给模型的入口](docs/demo/home.png)

在岗名单。模型读的就是这一页上的人、技能和调用地址。右边可以复制发现入口和 MCP 备用入口。

![在岗名单，以及发现入口和 MCP 备用入口](docs/demo/duty.png)

我的卡。左边上工或收工，右边是派来的任务。新来的、还没结束的单会在右下角弹出。

![我的卡和派来的任务](docs/demo/me.png)

一张做完的任务。人交回产物，派活的模型打分，分数留在这张单上。

![已交的任务，产物和打分](docs/demo/task.png)

## 使用说明

下面的地址写成 `http://localhost:3847`。服务放到公网之后，用页面上复制出来的地址，把这个来源换掉。

### 人

1. 安装依赖并启动，打开 [http://localhost:3847](http://localhost:3847)。

   ```bash
   npm install
   npm run dev
   ```

2. 点「发布我的卡」。名字、简介和技能都自己写。技能 1 到 6 项，每项写明能完成什么。输入和输出可以按名称、类型、是否必填和一句说明拼出来，熟悉 JSON Schema 时也可以直接写。
3. 发布之后打开「我的卡」，点「上工」。只有上工的人出现在发现名单里，也只有这时才接得到派单。
4. 派来的任务列在「我的卡」右侧。打开页面之后新来的、还没结束的单，会在右下角弹出「有新的活」，写着标题、要求和来自谁，最多叠三条。「去看」打开这张任务，「知道了」关掉。人已经停在这张任务上时不弹。
5. 打开任务，按输出交回产物，点「提交产物」。进行中的单也可以改成要补充、拒绝、失败或取消。要补充之后，模型用同一个任务 id 再发一次内容，状态回到进行中。
6. 产物交回后，这单等派活的模型打分。模型回 `{"score":4}` 之后，分数记在做人的这一方，任务变成已交。分数是 1 到 5 的整数。模型 60 秒内没有回分，这次打分取消，任务按已交结束，不记分数。人不能自己发起打分。已交、已拒绝、失败、已取消不能再改。
7. 做完可以「收工」。收工之后，发现名单里没有这张卡。页头可以在简体中文和英文之间切换，选择记在这台浏览器里。换一台浏览器，需要重新发布。

卡上的三个数字：完成单数只算已交的任务。平均分只算其中有分数的单，保留一位小数。平均耗时是这些已交任务从派到完成的平均时间。

### 模型：A2A

发现入口在 `/.well-known/agent-card.json`。`a2human.onDuty` 是当前在岗的人、他们自己写的技能，以及各自的调用地址。

```bash
curl -s http://localhost:3847/.well-known/agent-card.json
```

先按技能说明从 `onDuty` 里选一个人，再把 `SendMessage` 打到这个人自己的地址。`configuration.returnImmediately` 为 `true`。返回的 `result.task.status.state` 是 `TASK_STATE_WORKING`。

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"按你的技能完成这件事。"}]}}}'
```

人交回产物之后再取一次。状态是 `TASK_STATE_INPUT_REQUIRED`，产物在 `artifacts`，`status.message` 是 `{"request":"score","taskId":"任务 id","person":"人名","artifact":"产物"}`。用同一个任务 id 再发 `{"score":4}`，状态变成 `TASK_STATE_COMPLETED`。

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"上面返回的任务 id"}}'
```

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":3,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-2","contextId":"上面的 contextId","taskId":"上面的任务 id","parts":[{"data":{"score":4}}]}}}'
```

打到发现入口的 `SendMessage` 会被拒绝，并要求从 `onDuty` 里自己选地址。发现入口不代为指派。没上工的人会拒绝。同一条消息用同一个 `messageId` 再发一次，不会另开一单。`A2A-Version` 只接受 `1.0` 和 `0.3`。流式和推送不支持。调用方用 `CancelTask` 取消。

同一组完成单数、平均分和平均耗时写在这个人的 A2A 卡 `a2human.completed`、`a2human.averageScore`、`a2human.averageDuration`，也写在发现名单的 `onDuty` 里。

### 模型：MCP

只会 MCP 的客户端把 `http://localhost:3847/api/mcp` 加为 MCP 服务器。这是备用入口：每个在岗技能变成一个工具，调用仍发到这个人自己的 A2A 地址。人还在做时，用 `task_id` 再调一次。人交回产物后，用 `task_id` 和 `score` 再调一次。会 A2A 的客户端继续用上面的发现入口。

### 模型：LangGraph

`clients/langgraph` 读发现入口的 `onDuty`，把每个在岗技能做成 LangChain 工具，再用 `create_agent` 接到 LangGraph 上。模型选中谁，调用就发到这个人的地址，并等到人交回产物。

```bash
pip install -e clients/langgraph
python -m a2human http://localhost:3847
```

```python
from a2human import build_agent

agent = build_agent("http://localhost:3847", model)
agent.invoke({"messages": [{"role": "user", "content": "把这件事派给在岗的人"}]})
```

已有代理把 `duty_tools(Client(url))` 放进自己的 `tools` 即可。技能若写了扁平的输入字段，名称是英文标识符，类型是 string、integer、number、boolean 或图片，工具参数就是这些字段。图片填 http 地址或 `data:image/png;base64,…`。地址以 `.jpg`、`.jpeg`、`.webp`、`.gif` 结尾时按对应类型送出。嵌套 schema 或中文字段名放进一个 prompt。名单在建工具时读一次。更细的参数在 [clients/langgraph/README.md](clients/langgraph/README.md)。

### 一单怎么走

| 状态 | 什么时候 |
| --- | --- |
| `TASK_STATE_WORKING` | 模型把 `SendMessage` 打到这个人的地址，任务马上开始 |
| `TASK_STATE_INPUT_REQUIRED` | 人在页面上改成要补充，或交回产物后等模型打分 |
| `TASK_STATE_WORKING` | 要补充之后，模型用同一个任务 id 再发 `SendMessage` |
| `TASK_STATE_COMPLETED` | 模型打了分，或 60 秒内没有回分、打分被取消 |
| `TASK_STATE_REJECTED` | 人拒绝 |
| `TASK_STATE_FAILED` | 人标记失败 |
| `TASK_STATE_CANCELED` | 人或调用方取消 |

### 技能和产物

A2A 的 AgentSkill 只有 `inputModes` 和 `outputModes`，没有 schema 字段。卡片上这两项写成 `application/json`，schema 放在扩展 `capabilities.extensions[].params.skillSchemas`。发现名单里同一份 schema 直接挂在 `onDuty[].skills` 上。说明写在该项的 `description` 上。

模型按 schema 把 JSON 放进 `parts[].data`。图片项用 `image/png`、`image/jpeg`、`image/webp` 或 `image/gif` 的 part，内容放 `raw`（base64）或 http 地址。人交回的产物要对上输出 Schema：字段、类型和必填都要齐，多出来的字段不收，自由文本会被拒绝。`GetTask` 用 `data` 把这份 JSON 交回去；交回的图片用同样的图片 part。没有声明输出 Schema 时，产物是一段文字。页面上的图片要在 1MB 以内。

## Codespaces

`.devcontainer` 会在 Codespace 启动后安装依赖并跑 `npm run dev`，把 3847 端口公开。在 Codespace 的 Ports 面板复制 3847 的转发地址，那就是模型和浏览器要用的入口。默认空闲 30 分钟会休眠，创建时可以把空闲超时调长。休眠后地址不通。`data/store.json` 留在这台 Codespace 里。

```bash
npm test
npm run lint
```
