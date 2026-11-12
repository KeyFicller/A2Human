from fastapi.testclient import TestClient

from a2human.main import app


def test_publish_duty_and_discovery_keep_the_old_urls():
    with TestClient(app) as client:
        created = client.post("/api/agents", json={"name": "米粒", "bio": "会数。", "skills": [{"name": "计数", "description": "数清楚。"}]})
        assert created.status_code == 201
        agent = created.json()
        assert agent["available"] is False
        duty = client.post(f"/api/agents/{agent['id']}", json={"available": True})
        assert duty.status_code == 200
        assert duty.json()["available"] is True
        roster = client.get("/api/agents")
        assert roster.status_code == 200
        assert roster.json()[0]["completed"] == 0
        assert roster.headers["cache-control"] == "no-store"
        card = client.get("/api/a2a", headers={"x-forwarded-host": "market.example", "x-forwarded-proto": "https"})
        assert card.status_code == 200
        body = card.json()
        assert body["a2human"]["onDuty"][0]["url"] == f"https://market.example/api/a2a/{agent['id']}"
        pinned = client.get("/.well-known/agent-card.json", headers={"x-a2human-origin": "https://market.example"})
        assert pinned.json()["supportedInterfaces"][0]["url"] == "https://market.example/api/a2a"
        sent = client.post(
            f"/api/a2a/{agent['id']}",
            headers={"A2A-Version": "1.0"},
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "SendMessage",
                "params": {
                    "configuration": {"returnImmediately": True},
                    "metadata": {"caller": "某个大模型", "skill": "计数"},
                    "message": {"role": "ROLE_USER", "messageId": "http-1", "parts": [{"text": "数一下。"}]},
                },
            },
        )
        assert sent.status_code == 200
        task_id = sent.json()["result"]["task"]["id"]
        handed = client.post(f"/api/tasks/{task_id}", json={"action": "artifact", "agentId": agent["id"], "text": "7"})
        assert handed.status_code == 200
        assert handed.json()["status"] == "input-required"
        listed = client.get("/api/tasks")
        assert listed.json()[0]["id"] == task_id
        noted = client.post(f"/api/tasks/{task_id}", json={"action": "progress", "agentId": agent["id"], "text": "  正在搜索脑内知识库  "})
        assert noted.status_code == 400
        working = client.post(
            f"/api/a2a/{agent['id']}",
            headers={"A2A-Version": "1.0"},
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": "SendMessage",
                "params": {
                    "configuration": {"returnImmediately": True},
                    "metadata": {"caller": "某个大模型", "skill": "计数"},
                    "message": {"role": "ROLE_USER", "messageId": "http-2", "parts": [{"text": "再数一下。"}]},
                },
            },
        )
        open_id = working.json()["result"]["task"]["id"]
        noted = client.post(f"/api/tasks/{open_id}", json={"action": "progress", "agentId": agent["id"], "text": "  正在搜索脑内知识库  "})
        assert noted.status_code == 200
        assert noted.json()["progress"] == "正在搜索脑内知识库"
        detail = client.get(f"/api/tasks/{open_id}")
        assert any(item["kind"] == "task.progress" and item["text"] == "正在搜索脑内知识库" for item in detail.json()["messages"])
        cleared = client.post(f"/api/tasks/{open_id}", json={"action": "progress", "agentId": agent["id"], "text": "   "})
        assert cleared.status_code == 200
        assert "progress" not in cleared.json()
        missing = client.get("/api/mcp")
        assert missing.status_code == 405
        assert missing.json()["error"]["code"] == -32004
        opened = client.post("/api/mcp", json={"jsonrpc": "2.0", "id": "init", "method": "initialize", "params": {"protocolVersion": "2025-11-25"}})
        assert opened.status_code == 200
        assert opened.json()["result"]["protocolVersion"] == "2025-11-25"
        assert client.get("/api/health").json()["status"] == "ok"
        assert client.get("/api/ready").status_code == 200


def test_pages_and_local_origins_can_call_the_api():
    with TestClient(app) as client:
        preflight = client.options(
            "/api/agents",
            headers={
                "origin": "https://keyficller.github.io",
                "access-control-request-method": "GET",
            },
        )
        assert preflight.status_code == 200
        assert preflight.headers["access-control-allow-origin"] == "https://keyficller.github.io"
        listed = client.get("/api/agents", headers={"origin": "https://keyficller.github.io"})
        assert listed.status_code == 200
        assert listed.headers["access-control-allow-origin"] == "https://keyficller.github.io"
        local = client.get("/api/agents", headers={"origin": "http://127.0.0.1:4173"})
        assert local.headers["access-control-allow-origin"] == "http://127.0.0.1:4173"
        host = client.get("/api/agents", headers={"origin": "http://localhost:3000"})
        assert host.headers["access-control-allow-origin"] == "http://localhost:3000"
        denied = client.get("/api/agents", headers={"origin": "https://evil.example"})
        assert "access-control-allow-origin" not in denied.headers


def test_an_empty_reject_fail_or_cancel_is_accepted():
    with TestClient(app) as client:
        created = client.post("/api/agents", json={"name": "米粒", "bio": "会数。", "skills": [{"name": "计数", "description": "数清楚。"}]})
        assert created.status_code == 201
        agent_id = created.json()["id"]
        assert client.post(f"/api/agents/{agent_id}", json={"available": True}).status_code == 200

        def assign(number):
            sent = client.post(
                f"/api/a2a/{agent_id}",
                headers={"A2A-Version": "1.0"},
                json={
                    "jsonrpc": "2.0",
                    "id": number,
                    "method": "SendMessage",
                    "params": {
                        "configuration": {"returnImmediately": True},
                        "metadata": {"caller": "某个大模型", "skill": "计数"},
                        "message": {"role": "ROLE_USER", "messageId": f"blank-http-{number}", "parts": [{"text": "数一下。"}]},
                    },
                },
            )
            assert sent.status_code == 200
            return sent.json()["result"]["task"]["id"]

        cases = [
            ("reject", "", "zh", "已拒绝。", "rejected", "task.reject"),
            ("fail", "   ", "zh", "已失败。", "failed", "task.fail"),
            ("cancel", None, "en", "Canceled.", "canceled", "task.cancel"),
        ]
        for index, (action, text, locale, expected, status, kind) in enumerate(cases, start=1):
            task_id = assign(index)
            body = {"action": action, "agentId": agent_id, "locale": locale}
            if text is not None:
                body["text"] = text
            decided = client.post(f"/api/tasks/{task_id}", json=body)
            assert decided.status_code == 200
            assert decided.json()["status"] == status
            detail = client.get(f"/api/tasks/{task_id}")
            assert any(item["kind"] == kind and item["text"] == expected for item in detail.json()["messages"])

        written_id = assign(4)
        written = client.post(f"/api/tasks/{written_id}", json={"action": "reject", "agentId": agent_id, "text": "  这单不接。  "})
        assert written.status_code == 200
        written_detail = client.get(f"/api/tasks/{written_id}")
        assert any(item["kind"] == "task.reject" and item["text"] == "这单不接。" for item in written_detail.json()["messages"])

        supplement_id = assign(5)
        supplement = client.post(f"/api/tasks/{supplement_id}", json={"action": "input", "agentId": agent_id, "text": "  "})
        assert supplement.status_code == 400
        assert "1 到 200" in supplement.json()["error"]
