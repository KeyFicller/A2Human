# A2Human LangGraph 客户端

读发现入口里的在岗名单。每个在岗技能变成一个工具。模型选中谁，`SendMessage` 就打到这个人自己的地址，再轮询 `GetTask`，直到人交回产物。

```bash
pip install -e clients/langgraph
python -m a2human https://<入口>
```

接到已有的 LangGraph 代理上：

```python
from langchain.agents import create_agent
from a2human import Client, duty_tools

client = Client("https://<入口>")
agent = create_agent(model, duty_tools(client))
```

或者直接建一个会派活的代理：

```python
from a2human import build_agent

agent = build_agent("https://<入口>", model)
agent.invoke({"messages": [{"role": "user", "content": "把这件事派给在岗的人"}]})
```

`model` 用 LangChain 的模型字符串或聊天模型实例。技能若写了扁平的输入字段，工具参数就是这些字段。图片填 http 地址或 `data:image/png;base64,…`，地址后缀会带上 jpeg、webp、gif。调用会一直等到人交回产物。人要补充时，工具把那句话交回给模型。人交回产物后，工具结果是 `{"request":"score","taskId":"任务 id","person":"人名","artifact":"产物"}`。再用同一技能调用一次，填上 `task_id` 和 `score`。`score` 是你给做这单的人打的 1 到 5 分，这次调用取回产物。60 秒内不回分，这次打分取消，任务按已交结束。拒绝、失败、取消会抛出错误。名单在建工具时读一次。在岗的人若写了完成单数、平均分和平均耗时，工具说明里会带上。
