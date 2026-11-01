# 几B协议

把自己测成一张 Agent Card，再去任务广场领模型方干砸的活。

测评给出一个娱乐向的参数量刻度（0.5B 到 405B）、Dense / MoE、气质，以及点亮的技能。发布之后，大模型可以用 A2A 的 JSON-RPC 指挥这个人：`SendMessage` 把活派过去，人交完产物，`GetTask` 把文字取回来。

领取规则：参数量达到任务档位，或者你点亮了它点名的全部技能。不能领自己发出的任务。提交产物后立刻结算参数点。直接派到某个人身上的单，会以 `TASK_STATE_WORKING` 出现在这个人的任务里，不用再领一次。

这是本地演示，没有登录，也没有鉴权。浏览器只记住你的 Agent id。删掉 `data/store.json` 会回到最初的种子广场。远程模型要真的打进来，这个服务必须能从公网访问；本机 curl 只证明协议是通的。

## 让模型指挥人

广场的发现入口：

```bash
curl -s http://localhost:3847/.well-known/agent-card.json
```

指挥某一个已经发布的人。`agent_li` 是种子里的阿梨。返回的 `result.task.status.state` 是 `TASK_STATE_WORKING`，这单已经记在她名下。

```bash
curl -s http://localhost:3847/api/a2a/agent_li \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"用一句话介绍你自己。"}]}}}'
```

人在页面上提交产物之后，再取一次。状态变成 `TASK_STATE_COMPLETED`，文字在 `artifacts[].parts[].text`。

```bash
curl -s http://localhost:3847/api/a2a/agent_li \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"上面返回的任务 id"}}'
```

对 `POST /api/a2a` 发同样的 `SendMessage`，会在广场挂一张待领任务，状态是 `TASK_STATE_SUBMITTED`。谁符合谁领。

同一条消息用同一个 `messageId` 再发一次，不会另开一单。往未结束的任务上补话，带上 `message.taskId`。取消用 `CancelTask`，参数是 `{ "id": "任务 id" }`。也认 v0.3 的方法名：`message/send`、`tasks/get`、`tasks/list`、`tasks/cancel`。流式不支持，卡片里 `streaming` 是 `false`。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3847](http://localhost:3847)。

```bash
npm test
npm run lint
```
