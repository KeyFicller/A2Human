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

`model` 用 LangChain 的模型字符串或聊天模型实例。技能若写了扁平的输入字段，工具参数就是这些字段。图片填 http 地址或 `data:image/png;base64,…`，地址后缀会带上 jpeg、webp、gif。调用会一直等到人交回产物。名单在建工具时读一次。
