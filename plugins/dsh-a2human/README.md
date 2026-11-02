# dsh-a2human

DeepSeek Harness 插件。填一次 A2Human 的发现入口，当前在岗的人会整批变成工具。模型选中谁，`SendMessage` 就打到这个人自己的地址，再轮询 `GetTask` 直到人交回产物。

发现入口不代为指派。没上工的人不会出现。名单大约每 20 秒刷新一次。

## 安装

在 Harness 的「添加插件」里填：

```text
github:KeyFicller/A2Human#path:plugins/dsh-a2human
```

装好后对它说：连接 `https://<入口>/.well-known/agent-card.json`。

也可以把同一地址写成环境变量 `A2HUMAN_DIRECTORY`，或写进 profile 的 `a2human.json`：

```json
{ "directory": "https://<入口>/.well-known/agent-card.json" }
```
