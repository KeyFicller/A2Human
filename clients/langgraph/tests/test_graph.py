import unittest

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from a2human.graph import build_agent


CARD = {
    "a2human": {
        "onDuty": [
            {
                "name": "米粒",
                "url": "https://example.test/api/a2a/person",
                "skills": [{"name": "计数", "description": "数清画面里的东西。"}],
            }
        ]
    }
}


class Scripted(BaseChatModel):
    replies: list
    index: int = 0

    def bind_tools(self, tools, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        message = self.replies[self.index]
        self.index += 1
        return ChatResult(generations=[ChatGeneration(message=message)])

    @property
    def _llm_type(self):
        return "scripted"


class StructuredToolTest(unittest.TestCase):
    def test_a_flat_schema_is_the_tool_arguments(self):
        card = {
            "a2human": {
                "onDuty": [
                    {
                        "name": "米粒",
                        "url": "https://example.test/api/a2a/person",
                        "skills": [
                            {
                                "name": "计数",
                                "description": "数清画面里的东西。",
                                "inputSchema": {
                                    "type": "object",
                                    "required": ["scene"],
                                    "properties": {"scene": {"type": "string", "description": "画面"}},
                                },
                            }
                        ],
                    }
                ]
            }
        }
        seen = {}

        def transport(method, url, payload, headers, timeout):
            if payload is None:
                return card
            seen["data"] = payload["params"]["message"]["parts"][0]["data"]
            return {"result": {"task": {"id": "task-9", "status": {"state": "TASK_STATE_COMPLETED"}, "artifacts": [{"parts": [{"text": "3"}]}]}}}

        from a2human.graph import duty_tools
        from a2human.protocol import Client

        tool = duty_tools(Client("https://example.test", transport=transport, interval=0))[0]
        self.assertIn("scene", tool.args_schema.model_fields)
        self.assertEqual(tool.invoke({"scene": "三个圆"}), "3")
        self.assertEqual(seen["data"], {"scene": "三个圆"})


class GraphTest(unittest.TestCase):
    def test_agent_calls_the_person_and_returns_the_artifact(self):
        calls = []

        def transport(method, url, payload, headers, timeout):
            if payload is None:
                return CARD
            calls.append(payload["method"])
            if payload["method"] == "SendMessage":
                self.assertEqual(payload["params"]["metadata"]["skill"], "计数")
                self.assertTrue(payload["params"]["configuration"]["returnImmediately"])
                return {"result": {"task": {"id": "task-1", "status": {"state": "TASK_STATE_WORKING"}}}}
            return {
                "result": {
                    "id": "task-1",
                    "status": {"state": "TASK_STATE_COMPLETED"},
                    "artifacts": [{"parts": [{"text": "3"}]}],
                }
            }

        from a2human.graph import duty_tools
        from a2human.protocol import Client

        client = Client("https://example.test", transport=transport, interval=0)
        tool = duty_tools(client)[0]
        model = Scripted(
            replies=[
                AIMessage(content="", tool_calls=[{"name": tool.name, "args": {"prompt": "数一下"}, "id": "call-1", "type": "tool_call"}]),
                AIMessage(content="数完了，是 3。"),
            ]
        )
        graph = build_agent("https://example.test", model, transport=transport, interval=0)
        result = graph.invoke({"messages": [{"role": "user", "content": "数一下画面里的圆"}]})
        self.assertEqual(calls, ["SendMessage", "GetTask"])
        self.assertIn("3", result["messages"][-1].content)


if __name__ == "__main__":
    unittest.main()
