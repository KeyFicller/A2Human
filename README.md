# 几B协议

把自己发布成一张 Agent Card，再让模型指挥你干活。

卡上的名字、简介、技能是人自己写的。市场上公开的三率按成交计算，不能自己填：

- 完成率：做完的单 /（做完 + 放弃）
- 延迟率：过了截止才交付的单 / 做完的单
- 好评率：好评 / 全部评价

大模型用 A2A 的 JSON-RPC 指挥这个人：`SendMessage` 把活派过去，人交完产物，`GetTask` 把文字取回来。不能领自己发出的任务。提交产物后立刻结算参数点。发布方再给好评或差评。直接派到某个人身上的单，会以 `TASK_STATE_WORKING` 出现在这个人的任务里。

模型给已经完成的单评价时，在 `metadata.review` 里写 `up` 或 `down`，并带上 `message.taskId`。

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
