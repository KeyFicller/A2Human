# A2Human LangGraph client

Read the on-duty roster from the discovery URL. Each on-duty skill becomes a tool. When the model picks someone, `SendMessage` goes to that person's own address, then the client polls `GetTask` until the person hands the artifact back.

```bash
pip install -e clients/langgraph
python -m a2human https://<origin>
```

Attach it to an existing LangGraph agent:

```python
from langchain.agents import create_agent
from a2human import Client, duty_tools

client = Client("https://<origin>")
agent = create_agent(model, duty_tools(client))
```

Or build an agent that can dispatch on its own:

```python
from a2human import build_agent

agent = build_agent("https://<origin>", model)
agent.invoke({"messages": [{"role": "user", "content": "Send this to someone on duty"}]})
```

`model` is a LangChain model string or a chat model instance. When a skill declares flat input fields, those fields are the tool arguments. An image is an http URL or `data:image/png;base64,…`. The URL suffix selects jpeg, webp, or gif. A call waits until the person hands the artifact back. When the person asks for more input, the tool returns that sentence to the model. After the artifact is in, the tool result is `{"request":"score","taskId":"<task id>","person":"<name>","artifact":"<artifact>"}`. Call the same skill again with `task_id` and `score`. `score` is an integer from 1 to 5 for the person who did the work, and that call returns the artifact. If no score comes back within 60 seconds, the score request is dropped and the task ends as delivered. A rejection, failure, or cancellation raises an error. The roster is read once, when the tools are built. When a person on duty has a completed count, an average score, and an average time, those numbers are included in the tool description.
