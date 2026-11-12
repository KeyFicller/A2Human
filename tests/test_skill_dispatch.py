"""Everyday skill catalog, publish validation, and skill-based dispatch."""

import json

import pytest
from fastapi.testclient import TestClient

from a2human.a2a import dispatch_a2a
from a2human.main import app
from a2human.rules import DomainError, create_seed, publish_agent, receive_command, set_availability
from a2human.skill_catalog import CATALOG_IDS, skill_catalog

EVERYDAY = [
    ("translate", "中英互译"),
    ("summarize", "长文/会议纪要压缩"),
    ("rewrite", "改语气、改得更顺"),
    ("proofread", "错别字和病句"),
    ("brainstorm", "点子、标题、活动方案"),
    ("schedule", "约时间、排日程"),
    ("research", "查公开资料并给出处"),
    ("coach", "简历/面试口头陪练"),
    ("customer_reply", "客服式礼貌回复"),
    ("plan_trip", "行程与清单建议"),
]


def person(store, name, skills, available=True):
    agent = publish_agent(store, {"name": name, "bio": "接日常的活。", "skills": skills})
    if available:
        set_availability(store, agent["id"], True)
    return agent


def send(text, message_id, skill=None, agent_id=None, caller="某个大模型"):
    metadata = {"caller": caller}
    if skill is not None:
        metadata["skill"] = skill
    if agent_id is not None:
        metadata["agentId"] = agent_id
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "SendMessage",
        "params": {
            "configuration": {"returnImmediately": True},
            "metadata": metadata,
            "message": {"role": "ROLE_USER", "messageId": message_id, "parts": [{"text": text}]},
        },
    }


def result_of(response):
    assert "error" not in response, json.dumps(response, ensure_ascii=False)
    return response["result"]


def test_catalog_lists_the_everyday_skills_with_paired_schemas():
    catalog = skill_catalog()
    assert [(item["name"], item["description"]) for item in catalog] == EVERYDAY
    assert CATALOG_IDS == {name for name, _description in EVERYDAY}
    for item in catalog:
        assert 1 <= len(item["description"]) <= 120
        assert item["inputSchema"]["type"] == "object"
        assert item["outputSchema"]["type"] == "object"
        assert item["inputSchema"]["properties"]
        assert item["outputSchema"]["properties"]


def test_a_catalog_skill_publishes_and_the_description_can_be_edited():
    store = create_seed()
    created = publish_agent(store, {
        "name": "阿梨",
        "bio": "",
        "skills": [{"name": "translate", "description": "只做中文译成英文"}],
    })
    assert created["skills"] == [{"name": "translate", "description": "只做中文译成英文"}]


def test_a_custom_name_cannot_shadow_a_catalog_id():
    store = create_seed()
    with pytest.raises(DomainError, match="预置技能"):
        publish_agent(store, {"name": "阿梨", "bio": "", "skills": [{"name": "Translate", "description": "自己起的名"}]})
    kept = publish_agent(store, {"name": "老周", "bio": "", "skills": [{"name": "neighborhood", "description": "邻里通知写顺。"}]})
    assert kept["skills"][0]["name"] == "neighborhood"
    with pytest.raises(DomainError, match="预置技能"):
        from a2human.rules import update_agent

        update_agent(store, kept["id"], {"name": "老周", "bio": "", "skills": [{"name": "Plan_Trip", "description": "自己起的名"}]})


def test_custom_skills_share_the_six_skill_cap():
    store = create_seed()
    mixed = publish_agent(store, {
        "name": "阿梨",
        "bio": "",
        "skills": [
            {"name": "translate", "description": "中英互译"},
            {"name": "neighborhood", "description": "邻里通知写顺。"},
            {"name": "do_anything", "description": "接目录外的活。"},
            {"name": "计数", "description": "数清楚。"},
        ],
    })
    assert [item["name"] for item in mixed["skills"]] == ["translate", "neighborhood", "do_anything", "计数"]
    six = [{"name": f"custom_{index}", "description": "一项自定义技能。"} for index in range(6)]
    full = publish_agent(store, {"name": "老周", "bio": "", "skills": six})
    assert [item["name"] for item in full["skills"]] == [item["name"] for item in six]


def test_existing_length_and_count_rules_still_apply():
    store = create_seed()
    publish_agent(store, {"name": "阿梨", "bio": "", "skills": [{"name": "计数", "description": "数清楚。"}]})
    with pytest.raises(DomainError, match="最多 6"):
        publish_agent(store, {
            "name": "老周",
            "bio": "",
            "skills": [{"name": name, "description": description} for name, description in EVERYDAY[:6]]
            + [{"name": "extra_note", "description": "多出来的一项。"}],
        })
    with pytest.raises(DomainError, match="不能重复"):
        publish_agent(store, {
            "name": "小北",
            "bio": "",
            "skills": [
                {"name": "translate", "description": "中英互译"},
                {"name": "translate", "description": "再写一次"},
            ],
        })


def test_dispatch_assigns_an_on_duty_person_and_keeps_the_direct_path():
    store = create_seed()
    on = person(store, "米粒", [{"name": "translate", "description": "中英互译"}])
    off = person(store, "阿梨", [{"name": "translate", "description": "中英互译"}], available=False)
    sent = dispatch_a2a(store, {"kind": "dispatch"}, send("把这段译成英文。", "disp-1", skill="translate"))
    task = result_of(sent)["task"]
    stored = next(item for item in store["tasks"] if item["id"] == task["id"])
    assert stored["claimantId"] == on["id"]
    assert stored["source"] == "dispatch"
    assert stored["skills"] == ["translate"]
    assert task["metadata"]["claimantName"] == "米粒"
    direct = receive_command(store, {
        "humanId": on["id"],
        "text": "再译一句。",
        "messageId": "direct-1",
        "callerName": "某个大模型",
        "skill": "translate",
    })
    assert direct["source"] == "direct"
    assert direct["claimantId"] == on["id"]
    pooled = dispatch_a2a(store, {"kind": "pool"}, send("广场不要派。", "pool-1", skill="translate"))
    assert pooled["error"]["code"] == -32004
    refused = dispatch_a2a(store, {"kind": "human", "agentId": off["id"]}, send("你没上工。", "off-1", skill="translate"))
    assert "没上工" in refused["error"]["message"]


def test_dispatch_requires_a_skill_and_refuses_when_nobody_is_on_duty():
    store = create_seed()
    person(store, "米粒", [{"name": "translate", "description": "中英互译"}], available=False)
    missing = dispatch_a2a(store, {"kind": "dispatch"}, send("译一下。", "need-skill"))
    assert missing["error"]["code"] == -32602
    assert "metadata.skill" in missing["error"]["message"]
    nobody = dispatch_a2a(store, {"kind": "dispatch"}, send("译一下。", "nobody", skill="translate"))
    assert nobody["error"]["code"] == -32004
    assert "没有在岗" in nobody["error"]["message"]
    assert store["tasks"] == []
    unknown = dispatch_a2a(store, {"kind": "dispatch"}, send("做一下。", "unknown", skill="not_a_skill"))
    assert unknown["error"]["code"] == -32004


def test_dispatch_prefers_agent_id_then_sticky_then_least_open_tasks():
    store = create_seed()
    first = person(store, "米粒", [{"name": "summarize", "description": "长文/会议纪要压缩"}])
    opening = result_of(dispatch_a2a(store, {"kind": "dispatch"}, send("压一下。", "stick-1", skill="summarize")))["task"]
    assert opening["metadata"]["claimantName"] == "米粒"
    second = person(store, "小北", [{"name": "summarize", "description": "长文/会议纪要压缩"}])
    stuck = result_of(dispatch_a2a(
        store,
        {"kind": "dispatch"},
        send("再压一下。", "stick-2", skill="summarize"),
    ))["task"]
    assert stuck["metadata"]["claimantName"] == "米粒"
    pinned = result_of(dispatch_a2a(
        store,
        {"kind": "dispatch"},
        send("给小北。", "pin-1", skill="summarize", agent_id=second["id"]),
    ))["task"]
    assert pinned["metadata"]["claimantName"] == "小北"
    blocked = dispatch_a2a(
        store,
        {"kind": "dispatch"},
        send("给不存在的人。", "pin-bad", skill="summarize", agent_id=first["id"] + "-nope"),
    )
    assert blocked["error"]["code"] == -32004
    other = person(store, "老周", [{"name": "rewrite", "description": "改语气、改得更顺"}])
    receive_command(store, {
        "humanId": other["id"],
        "text": "先占一单。",
        "messageId": "busy-1",
        "callerName": "别的模型",
        "skill": "rewrite",
    })
    idle = person(store, "阿梨", [{"name": "rewrite", "description": "改语气、改得更顺"}])
    least = result_of(dispatch_a2a(
        store,
        {"kind": "dispatch"},
        send("改顺一点。", "least-1", skill="rewrite", caller="新来的"),
    ))["task"]
    assert least["metadata"]["claimantName"] == idle["name"]


def test_dispatch_breaks_least_open_ties_with_the_chooser(monkeypatch):
    store = create_seed()
    left = person(store, "米粒", [{"name": "coach", "description": "简历/面试口头陪练"}])
    right = person(store, "小北", [{"name": "coach", "description": "简历/面试口头陪练"}])
    picked = {}

    def choose(items):
        picked["ids"] = [item["id"] for item in items]
        return items[-1]

    monkeypatch.setattr("a2human.dispatch.default_choose", choose)
    sent = result_of(dispatch_a2a(
        store,
        {"kind": "dispatch"},
        send("练一下自我介绍。", "tie-1", skill="coach", caller="第一次"),
    ))["task"]
    ordered = sorted((left, right), key=lambda agent: agent["id"])
    assert picked["ids"] == [agent["id"] for agent in ordered]
    assert sent["metadata"]["claimantName"] == ordered[-1]["name"]


def test_http_catalog_and_dispatch_routes():
    with TestClient(app) as client:
        catalog = client.get("/api/skill-catalog")
        assert catalog.status_code == 200
        body = catalog.json()
        assert [(item["name"], item["description"]) for item in body["skills"]] == EVERYDAY
        created = client.post("/api/agents", json={
            "name": "米粒",
            "bio": "会译。",
            "skills": [{"name": "translate", "description": "中英互译"}],
        })
        assert created.status_code == 201
        agent = created.json()
        duty = client.post(f"/api/agents/{agent['id']}", json={"available": True})
        assert duty.status_code == 200
        shadowed = client.post("/api/agents", json={
            "name": "阿梨",
            "bio": "",
            "skills": [{"name": "Translate", "description": "不行"}],
        })
        assert shadowed.status_code == 400
        assert "预置技能" in shadowed.json()["error"]
        sent = client.post("/api/a2a/dispatch", json={
            "jsonrpc": "2.0",
            "id": "http-dispatch",
            "method": "SendMessage",
            "params": {
                "configuration": {"returnImmediately": True},
                "metadata": {"caller": "某个大模型", "skill": "translate"},
                "message": {"role": "ROLE_USER", "messageId": "http-dispatch", "parts": [{"text": "译成英文。"}]},
            },
        })
        assert sent.status_code == 200
        payload = sent.json()
        assert "error" not in payload
        assert payload["result"]["task"]["metadata"]["claimantName"] == "米粒"
        listed = client.get("/api/tasks")
        assert listed.json()[0]["source"] == "dispatch"
        assert listed.json()[0]["claimantId"] == agent["id"]
