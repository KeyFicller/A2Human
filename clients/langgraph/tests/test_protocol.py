import unittest

from a2human.protocol import A2HumanError, Client, directory_url, message_parts, read_roster, send_body


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


if __name__ == "__main__":
    unittest.main()
