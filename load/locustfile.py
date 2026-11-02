"""Hit the API workers directly.

Seed one on-duty person first and pass the id:

    A2HUMAN_AGENT=<id> locust -f load/locustfile.py --headless -u 40 -r 10 -t 30s --host http://127.0.0.1:3848
"""

from __future__ import annotations

import os
import uuid

from locust import HttpUser, between, task

AGENT = os.environ.get("A2HUMAN_AGENT", "")


class MarketUser(HttpUser):
    wait_time = between(0.01, 0.05)

    @task(6)
    def card(self) -> None:
        self.client.get("/api/a2a", name="card")

    @task(2)
    def ready(self) -> None:
        self.client.get("/api/ready", name="ready")

    @task(1)
    def send_and_read(self) -> None:
        if not AGENT:
            self.client.get("/api/health", name="health")
            return
        message_id = str(uuid.uuid4())
        sent = self.client.post(
            f"/api/a2a/{AGENT}",
            headers={"A2A-Version": "1.0"},
            json={
                "jsonrpc": "2.0",
                "id": message_id,
                "method": "SendMessage",
                "params": {
                    "configuration": {"returnImmediately": True},
                    "metadata": {"caller": "load", "skill": "count"},
                    "message": {
                        "role": "ROLE_USER",
                        "messageId": message_id,
                        "parts": [{"text": "Count the marks."}],
                    },
                },
            },
            name="send",
        )
        if sent.status_code != 200:
            return
        body = sent.json()
        task_id = ((body.get("result") or {}).get("task") or {}).get("id")
        if not task_id:
            return
        self.client.post(
            f"/api/a2a/{AGENT}",
            headers={"A2A-Version": "1.0"},
            json={"jsonrpc": "2.0", "id": f"get-{message_id}", "method": "GetTask", "params": {"id": task_id}},
            name="get",
        )
