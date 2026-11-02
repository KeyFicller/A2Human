# A2Human

人发布自己的 agent card。技能里写明能完成什么。模型发现在岗的人，自己选一个，把任务派过来。

没上工的人不会出现在发现名单里，也接不到派单。名字、简介、技能都是人自己写的。

模型先读发现入口里的在岗名单，按技能说明选人，再把 `SendMessage` 打到那个人的地址。任务马上是 `TASK_STATE_WORKING`。人交完产物，`GetTask` 把文字取回来。`configuration.returnImmediately` 必须为 `true`。发现入口不代为指派。

技能的输入和输出可以在发布页用名称、类型和是否必填拼出来，也可以直接写 JSON Schema。A2A 的 AgentSkill 只有 `inputModes` 和 `outputModes`，没有 schema 字段，多出来的字段也过不了官方卡片 schema。所以卡片上这两项写成 `application/json`，schema 放在扩展 `capabilities.extensions[].params.skillSchemas`。发现名单里同一份 schema 直接挂在 `onDuty[].skills` 上。模型按 schema 把 JSON 放进 `parts[].data`。图片项用 `image/png`、`image/jpeg`、`image/webp` 或 `image/gif` 的 part，内容放 `raw`（base64）或 http 地址。人交回的文字如果能解析成 JSON，`GetTask` 用 `data` 把产物交回去；交回的图片用同样的图片 part。

这是本地演示，没有登录，也没有鉴权。浏览器只记住你的 Agent id。删掉 `data/store.json` 会回到空名单。远程模型要真的打进来，这个服务必须能从公网访问。

## 让模型发现并委派

发现入口。`a2human.onDuty` 是当前在岗的人、他们自己写的技能，以及各自的调用地址：

```bash
curl -s http://localhost:3847/.well-known/agent-card.json
```

把 `SendMessage` 打到选中的人。返回的 `result.task.status.state` 是 `TASK_STATE_WORKING`。

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -H 'A2A-Version: 1.0' \
  -d '{"jsonrpc":"2.0","id":1,"method":"SendMessage","params":{"configuration":{"returnImmediately":true},"message":{"role":"ROLE_USER","messageId":"msg-1","parts":[{"text":"按你的技能完成这件事。"}]}}}'
```

人在页面上提交产物之后，再取一次。状态变成 `TASK_STATE_COMPLETED`，文字在 `artifacts[].parts[].text`。

```bash
curl -s http://localhost:3847/api/a2a/<id> \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"GetTask","params":{"id":"上面返回的任务 id"}}'
```

打到发现入口的 `SendMessage` 会被拒绝，并要求从 `onDuty` 里自己选地址。没上工的人会拒绝。同一条消息用同一个 `messageId` 再发一次，不会另开一单。`A2A-Version` 只接受 `1.0` 和 `0.3`。流式和推送不支持。

## 本地运行

```bash
npm install
npm run dev
```

打开 [http://localhost:3847](http://localhost:3847)。

## Codespaces

`.devcontainer` 会在 Codespace 启动后安装依赖并跑 `npm run dev`，把 3847 端口公开。在 Codespace 的 Ports 面板复制 3847 的转发地址，那就是模型和浏览器要用的入口。默认空闲 30 分钟会休眠，创建时可以把空闲超时调长。休眠后地址不通。`data/store.json` 留在这台 Codespace 里。

```bash
npm test
npm run lint
```
