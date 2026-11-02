"""Two workers, one task. The loser retries and must not overwrite the winner."""

import asyncio

from a2human.a2a import dispatch_a2a
from a2human.clock import now_iso
from a2human.rules import claim_task, publish_agent, set_availability, submit_artifact
from a2human.store import read_store, update_store

counting = {"name": "count", "description": "Count what is actually there."}


def _send(text: str, message_id: str, task_id: str | None = None) -> dict:
    message = {"role": "ROLE_USER", "messageId": message_id, "parts": [{"text": text}]}
    if task_id:
        message["taskId"] = task_id
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "SendMessage",
        "params": {
            "message": message,
            "configuration": {"returnImmediately": True},
            "metadata": {"caller": "model", "skill": "count"},
        },
    }


async def test_parallel_claims_let_only_one_agent_take_the_task():
    agent = await update_store(lambda store: publish_agent(store, {"name": "Ada", "bio": "counts", "skills": [counting]}))

    def plant(store):
        task = {
            "id": "task-open",
            "title": "open",
            "brief": "unclaimed",
            "posterId": agent["id"],
            "posterName": agent["name"],
            "skills": [],
            "status": "submitted",
            "claimantId": None,
            "claimantName": None,
            "artifact": None,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
            "contextId": "ctx-open",
            "source": "direct",
        }
        store["tasks"].insert(0, task)
        return task["id"]

    task_id = await update_store(plant)

    async def claim() -> bool:
        return await update_store(lambda store: claim_task(store, task_id, agent["id"]))

    results = await asyncio.gather(claim(), claim())
    assert sorted(results) == [False, True]
    saved = await read_store()
    task = next(item for item in saved["tasks"] if item["id"] == task_id)
    assert task["claimantId"] == agent["id"]
    assert task["status"] == "working"


async def test_parallel_scores_keep_a_single_score():
    agent = await update_store(lambda store: publish_agent(store, {"name": "Ada", "bio": "counts", "skills": [counting]}))
    await update_store(lambda store: set_availability(store, agent["id"], True))
    opened = await update_store(
        lambda store: dispatch_a2a(store, {"kind": "human", "agentId": agent["id"]}, _send("count the dots", "open-1"))
    )
    task_id = opened["result"]["task"]["id"]
    await update_store(lambda store: submit_artifact(store, task_id, agent["id"], "7"))

    async def score(message_id: str, value: int):
        return await update_store(
            lambda store: dispatch_a2a(
                store,
                {"kind": "human", "agentId": agent["id"]},
                _send('{"score":%s}' % value, message_id, task_id),
            )
        )

    first, second = await asyncio.gather(score("score-a", 4), score("score-b", 5))
    bodies = [first, second]
    wins = [body for body in bodies if "error" not in body and body["result"]["task"]["status"]["state"] == "TASK_STATE_COMPLETED"]
    assert len(wins) == 1
    saved = await read_store()
    task = next(item for item in saved["tasks"] if item["id"] == task_id)
    assert task["status"] == "completed"
    assert task["workScore"] in {4, 5}


async def test_the_same_message_id_creates_one_task():
    agent = await update_store(lambda store: publish_agent(store, {"name": "Ada", "bio": "counts", "skills": [counting]}))
    await update_store(lambda store: set_availability(store, agent["id"], True))

    async def send():
        return await update_store(
            lambda store: dispatch_a2a(store, {"kind": "human", "agentId": agent["id"]}, _send("count the dots", "same-msg"))
        )

    first, second = await asyncio.gather(send(), send())
    assert first["result"]["task"]["id"] == second["result"]["task"]["id"]
    saved = await read_store()
    assert len([task for task in saved["tasks"] if task.get("a2aMessageId") == "same-msg"]) == 1


def test_rate_limit_rejects_the_extra_call(monkeypatch):
    from fastapi.testclient import TestClient

    from a2human.main import app

    monkeypatch.setenv("A2HUMAN_RATE_LIMIT", "2")
    monkeypatch.setenv("A2HUMAN_RATE_WINDOW", "30")
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.post("/api/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"}).status_code == 200
        assert client.post("/api/mcp", json={"jsonrpc": "2.0", "id": 2, "method": "ping"}).status_code == 200
        blocked = client.post("/api/mcp", json={"jsonrpc": "2.0", "id": 3, "method": "ping"})
        assert blocked.status_code == 429
        assert "error" in blocked.json()
