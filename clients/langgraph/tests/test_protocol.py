import unittest

from a2human.protocol import (
    A2HumanError,
    Client,
    describe_duty,
    directory_url,
    flat_fields,
    image_part,
    message_parts,
    read_roster,
    send_body,
)


CARD = {
    "name": "A2Human",
    "a2human": {
        "onDuty": [
            {
                "name": "米粒",
                "url": "https://example.test/api/a2a/11111111-1111-1111-1111-111111111111",
                "skills": [
                    {
                        "name": "计数",
                        "description": "数清画面里的东西。",
                        "inputSchema": {"type": "object", "required": ["scene"]},
                        "outputSchema": {"type": "object", "required": ["count"]},
                    }
                ],
            },
            {
                "name": "阿梨",
                "url": "https://example.test/api/a2a/22222222-2222-2222-2222-222222222222/",
                "skills": [{"name": "看现场", "description": "只回答自己看见的。"}],
            },
        ]
    },
}


class ProtocolTest(unittest.TestCase):
    def test_directory_url(self):
        self.assertEqual(directory_url("https://example.test"), "https://example.test/.well-known/agent-card.json")
        self.assertEqual(
            directory_url("https://example.test/.well-known/agent-card.json"),
            "https://example.test/.well-known/agent-card.json",
        )
        self.assertEqual(directory_url("https://example.test/api/a2a"), "https://example.test/api/a2a")
        with self.assertRaises(A2HumanError):
            directory_url("file:///tmp/card.json")

    def test_roster_keeps_on_duty_skills(self):
        roster = read_roster(CARD)
        self.assertEqual([item["person_name"] for item in roster], ["米粒", "阿梨"])
        mili = next(item for item in roster if item["person_name"] == "米粒")
        self.assertEqual(mili["url"], "https://example.test/api/a2a/11111111-1111-1111-1111-111111111111")
        self.assertEqual(mili["input_schema"]["required"], ["scene"])
        mirrored = {"capabilities": {"extensions": [{"params": {"onDuty": CARD["a2human"]["onDuty"]}}]}}
        self.assertEqual(len(read_roster(mirrored)), 2)
        rejected = {"a2human": {"onDuty": [{"name": "坏", "url": "javascript:alert(1)", "skills": [{"name": "x"}]}]}}
        self.assertEqual(read_roster(rejected), [])

    def test_json_prompt_and_wait(self):
        self.assertEqual(message_parts('{"scene":"三个圆"}'), [{"mediaType": "application/json", "data": {"scene": "三个圆"}}])
        body = send_body("m1", "计数", "数一下")
        self.assertTrue(body["params"]["configuration"]["returnImmediately"])
        self.assertEqual(body["params"]["metadata"]["skill"], "计数")
        calls = []

        def transport(method, url, payload, headers, timeout):
            calls.append((method, url, None if payload is None else payload["method"]))
            if payload is None:
                return CARD
            if payload["method"] == "SendMessage":
                return {"result": {"task": {"id": "task-1", "status": {"state": "TASK_STATE_WORKING"}}}}
            return {
                "result": {
                    "id": "task-1",
                    "status": {"state": "TASK_STATE_COMPLETED"},
                    "artifacts": [{"parts": [{"data": {"count": 3}}]}],
                }
            }

        client = Client("https://example.test", transport=transport, interval=0)
        self.assertEqual(len(client.roster()), 2)
        person = next(item for item in client.roster() if item["skill_name"] == "计数")
        self.assertEqual(client.dispatch(person["url"], "计数", "数一下", message_id="m1"), '{"count":3}')
        self.assertEqual([item[2] for item in calls if item[2]], ["SendMessage", "GetTask"])

    def test_failed_task_raises(self):
        def transport(method, url, payload, headers, timeout):
            return {
                "result": {
                    "task": {
                        "id": "task-2",
                        "status": {"state": "TASK_STATE_FAILED", "message": {"parts": [{"text": "没上工"}]}},
                    }
                }
            }

        client = Client("https://example.test", transport=transport, interval=0)
        with self.assertRaises(A2HumanError) as caught:
            client.dispatch("https://example.test/api/a2a/person", "计数", "数一下")
        self.assertIn("没上工", str(caught.exception))

    def test_input_required_returns_the_question_and_rejected_raises(self):
        def asking(method, url, payload, headers, timeout):
            return {
                "result": {
                    "task": {
                        "id": "task-ask",
                        "status": {"state": "TASK_STATE_INPUT_REQUIRED", "message": {"parts": [{"text": "几个圆？"}]}},
                    }
                }
            }

        client = Client("https://example.test", transport=asking, interval=0)
        self.assertEqual(client.dispatch("https://example.test/api/a2a/person", "计数", "数一下"), "几个圆？")

        def refusing(method, url, payload, headers, timeout):
            return {
                "result": {
                    "task": {
                        "id": "task-no",
                        "status": {"state": "TASK_STATE_REJECTED", "message": {"parts": [{"text": "这单不接。"}]}},
                    }
                }
            }

        client = Client("https://example.test", transport=refusing, interval=0)
        with self.assertRaises(A2HumanError) as caught:
            client.dispatch("https://example.test/api/a2a/person", "计数", "数一下")
        self.assertIn("这单不接", str(caught.exception))

        def scored(method, url, payload, headers, timeout):
            return {
                "result": {
                    "task": {
                        "id": "task-score",
                        "status": {
                            "state": "TASK_STATE_INPUT_REQUIRED",
                            "message": {"parts": [{"text": '{"request":"score","taskId":"task-score","person":"米粒"}'}]},
                        },
                    }
                }
            }

        client = Client("https://example.test", transport=scored, interval=0)
        self.assertEqual(
            client.dispatch("https://example.test/api/a2a/person", "计数", "数一下"),
            '{"request":"score","taskId":"task-score","person":"米粒"}',
        )

    def test_a_score_goes_back_on_the_same_task(self):
        seen = []

        def transport(method, url, payload, headers, timeout):
            if payload and payload.get("method") == "SendMessage":
                seen.append(payload)
                return {"result": {"task": {"id": "task-score", "status": {"state": "TASK_STATE_WORKING"}}}}
            return {
                "result": {
                    "id": "task-score",
                    "status": {"state": "TASK_STATE_COMPLETED"},
                    "artifacts": [{"parts": [{"text": "3"}]}],
                }
            }

        client = Client("https://example.test", transport=transport, interval=0)
        with self.assertRaises(A2HumanError):
            client.dispatch("https://example.test/api/a2a/person", "计数", task_id="task-score", score=6)
        self.assertEqual(client.dispatch("https://example.test/api/a2a/person", "计数", task_id="task-score", score=4), "3")
        message = seen[0]["params"]["message"]
        self.assertEqual(message["taskId"], "task-score")
        self.assertEqual(message["parts"][0]["data"], {"score": 4})


class StructuredDispatchTest(unittest.TestCase):
    def test_flat_schema_becomes_fields_and_an_image_part(self):
        schema = {
            "type": "object",
            "required": ["scene"],
            "properties": {
                "scene": {"type": "string", "description": "画面"},
                "shot": {"type": "string", "contentMediaType": "image/*"},
            },
        }
        self.assertEqual([field["name"] for field in flat_fields(schema)], ["scene", "shot"])
        self.assertIsNone(flat_fields({"type": "object", "properties": {"画面": {"type": "string"}}}))
        part = image_part("data:image/png;base64,aaaa")
        self.assertEqual(part["mediaType"], "image/png")
        self.assertEqual(image_part("https://example.test/shot.jpeg?size=1")["mediaType"], "image/jpeg")
        self.assertEqual(image_part("https://example.test/shot")["mediaType"], "image/png")
        duty = describe_duty(
            {
                "person_name": "阿梨",
                "skill_name": "计数",
                "description": "数清。",
                "input_schema": schema,
                "output_schema": {"type": "object", "properties": {"count": {"type": "integer"}}},
            }
        )
        self.assertIn("按参数填写", duty)
        self.assertNotIn("输入：", duty)
        self.assertIn("输出：", duty)
        body = send_body("m1", "计数", fields={"scene": "三个圆"}, images=[part])
        self.assertEqual(body["params"]["message"]["parts"][0]["data"], {"scene": "三个圆"})
        self.assertEqual(body["params"]["message"]["parts"][1]["raw"], "aaaa")

        def transport(method, url, payload, headers, timeout):
            self.assertEqual(payload["params"]["message"]["parts"][0]["data"]["scene"], "三个圆")
            return {"result": {"task": {"id": "task-3", "status": {"state": "TASK_STATE_COMPLETED"}, "artifacts": [{"parts": [{"text": "3"}]}]}}}

        client = Client("https://example.test", transport=transport, interval=0)
        self.assertEqual(
            client.dispatch("https://example.test/api/a2a/person", "计数", fields={"scene": "三个圆"}, images=[part]),
            "3",
        )


if __name__ == "__main__":
    unittest.main()
