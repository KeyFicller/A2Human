"""Everyday skill catalog, publish validation, and skill-based dispatch."""

import base64
import json

import pytest
from fastapi.testclient import TestClient

from a2human.a2a import dispatch_a2a
from a2human.main import app
from a2human.rules import DomainError, create_seed, publish_agent, receive_command, set_availability, submit_artifact
from a2human.schema_fields import canonical_output, describe_schema
from a2human.skill_catalog import CATALOG_IDS, skill_catalog

PRESETS = [
    ("hand_draw", "碳基图像生成"),
    ("paper_think", "物理深度思考"),
    ("human_roll", "人肉随机数"),
    ("wetware_run", "碳基气象台"),
    ("offline_lookup", "离线知识检索"),
    ("human_check", "人类兼容性测试"),
    ("open_mic", "一展歌喉"),
]
OFFICE = {
    "translate",
    "summarize",
    "rewrite",
    "proofread",
    "brainstorm",
    "schedule",
    "research",
    "coach",
    "customer_reply",
    "plan_trip",
}


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


def test_catalog_lists_the_carbon_presets_and_not_the_office_catalog():
    catalog = skill_catalog()
    assert [(item["name"], item["title"]) for item in catalog] == PRESETS
    assert CATALOG_IDS == {name for name, _title in PRESETS}
    assert OFFICE.isdisjoint(CATALOG_IDS)
    for item in catalog:
        assert 1 <= len(item["title"]) <= 32
        assert 1 <= len(item["description"]) <= 320
        english = item.get("en")
        assert isinstance(english, dict)
        assert 1 <= len(english["title"]) <= 32
        assert 1 <= len(english["description"]) <= 320
        assert english["sample"].strip()
        assert item["sample"].strip()
        assert item["inputSchema"]["required"] == ["task"]
        assert list(item["inputSchema"]["properties"]) == ["task"]
        assert item["inputSchema"]["properties"]["task"]["type"] == "string"
        assert item["inputSchema"]["properties"]["task"]["description"] == "任务描述"
        assert item["outputSchema"]["type"] == "object"
        assert item["outputSchema"]["properties"]


def test_catalog_delivery_uses_the_duty_output_check():
    by_name = {item["name"]: item for item in skill_catalog()}
    image = by_name["hand_draw"]["outputSchema"]
    assert canonical_output(image, "", True) == ""
    assert canonical_output(image, "{}", True) == ""
    with pytest.raises(ValueError):
        canonical_output(image, "", False)
    with pytest.raises(ValueError) as missing:
        canonical_output(by_name["paper_think"]["outputSchema"], "", False)
    assert "算出来的答案" in str(missing.value)
    assert "要交一张图片" in str(missing.value)
    both = by_name["paper_think"]["outputSchema"]
    assert canonical_output(both, '{"answer":"42"}', True) == '{"answer":"42"}'
    with pytest.raises(ValueError):
        canonical_output(both, '{"answer":"42"}', False)
    rolled = by_name["human_roll"]["outputSchema"]
    assert by_name["human_roll"]["description"] == "需要一个无法被模型预测或复现的随机结果时调用。真人掷骰或抽签，只交文字结果即可，也可附上现场照片。这不是伪随机函数，是手气本身。"
    assert rolled["required"] == ["answer"]
    assert "picture" in rolled["properties"] and "answer" in rolled["properties"]
    assert describe_schema(rolled) == "answer 文字，必填：掷出或抽到的结果；picture 图片，可选：骰子或签条的照片"
    assert canonical_output(rolled, '{"answer":"4"}', False) == '{"answer":"4"}'
    assert canonical_output(rolled, '{"answer":"4"}', True) == '{"answer":"4"}'
    with pytest.raises(ValueError, match="掷出或抽到的结果"):
        canonical_output(rolled, "{}", False)
    assert by_name["paper_think"]["outputSchema"]["required"] == ["answer", "picture"]
    sung = by_name["open_mic"]["outputSchema"]
    assert canonical_output(sung, '{"answer":"副歌"}', False, True) == '{"answer":"副歌"}'
    with pytest.raises(ValueError):
        canonical_output(sung, '{"answer":"副歌"}', False, False)
    assert canonical_output(by_name["wetware_run"]["outputSchema"], '{"answer":"正在下雨"}', False) == '{"answer":"正在下雨"}'
    text = by_name["human_check"]["outputSchema"]
    assert canonical_output(text, '{"answer":"第二句"}', False) == '{"answer":"第二句"}'
    with pytest.raises(ValueError):
        canonical_output(text, '{"answer":"第二句"}', True)


def test_human_roll_handover_accepts_text_alone_and_text_with_a_photo():
    rolled = next(item for item in skill_catalog() if item["name"] == "human_roll")
    store = create_seed()
    human = person(store, "米粒", [{
        "name": "human_roll",
        "title": rolled["title"],
        "description": rolled["description"],
        "inputSchema": rolled["inputSchema"],
        "outputSchema": rolled["outputSchema"],
    }])
    text_only = receive_command(store, {
        "humanId": human["id"],
        "text": rolled["sample"],
        "messageId": "roll-text",
        "callerName": "某个大模型",
        "skill": "human_roll",
    })
    handed = submit_artifact(store, text_only["id"], human["id"], '{"answer":"4"}')
    assert handed["artifact"] == '{"answer":"4"}'
    assert handed["artifactImage"] is None
    missing = receive_command(store, {
        "humanId": human["id"],
        "text": rolled["sample"],
        "messageId": "roll-empty",
        "callerName": "某个大模型",
        "skill": "human_roll",
    })
    with pytest.raises(DomainError, match="掷出或抽到的结果"):
        submit_artifact(store, missing["id"], human["id"], "{}")
    pictured = receive_command(store, {
        "humanId": human["id"],
        "text": rolled["sample"],
        "messageId": "roll-photo",
        "callerName": "某个大模型",
        "skill": "human_roll",
    })
    png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    shown = submit_artifact(
        store,
        pictured["id"],
        human["id"],
        '{"answer":"6"}',
        {"mediaType": "image/png", "raw": png, "filename": "dice.png"},
    )
    assert shown["artifact"] == '{"answer":"6"}'
    assert shown["artifactImage"]["filename"] == "dice.png"


def test_open_mic_accepts_text_with_a_recording_and_text_alone_is_not_enough():
    store = create_seed()
    preset = next(item for item in skill_catalog() if item["name"] == "open_mic")
    human = person(store, "阿梨", [{
        "name": "open_mic",
        "title": "一展歌喉",
        "description": preset["description"],
        "play": "open_mic",
        "inputSchema": preset["inputSchema"],
        "outputSchema": preset["outputSchema"],
    }])
    sung = receive_command(store, {
        "humanId": human["id"],
        "text": "唱一段副歌。",
        "messageId": "mic-1",
        "callerName": "某个大模型",
        "skill": "open_mic",
    })
    webm = base64.b64encode(b"\x1a\x45\xdf\xa3" + b"\x00" * 12).decode()
    with pytest.raises(DomainError):
        submit_artifact(store, sung["id"], human["id"], '{"answer":"副歌"}')
    handed = submit_artifact(
        store,
        sung["id"],
        human["id"],
        '{"answer":"副歌"}',
        None,
        {"mediaType": "audio/webm", "raw": webm, "filename": "take.webm"},
    )
    assert handed["artifact"] == '{"answer":"副歌"}'
    assert handed["artifactAudio"]["mediaType"] == "audio/webm"
    assert handed["artifactImage"] is None


def test_a_catalog_skill_publishes_and_the_description_can_be_edited():
    store = create_seed()
    created = publish_agent(store, {
        "name": "阿梨",
        "bio": "接活。",
        "skills": [{"name": "hand_draw", "title": "碳基图像生成", "description": "只交一张手绘。"}],
    })
    assert created["skills"] == [{"name": "hand_draw", "description": "只交一张手绘。", "title": "碳基图像生成"}]


def test_publish_stores_the_display_name_apart_from_the_tool_id():
    store = create_seed()
    created = publish_agent(store, {
        "name": "阿梨",
        "bio": "接活。",
        "skills": [{"name": "carbon_reason", "title": "碳基推理引擎", "description": "在纸上推完再交。"}],
    })
    assert created["skills"][0]["name"] == "carbon_reason"
    assert created["skills"][0]["title"] == "碳基推理引擎"
    kept = publish_agent(store, {"name": "老周", "bio": "接活。", "skills": [{"name": "计数", "description": "数清楚。"}]})
    assert "title" not in kept["skills"][0]
    with pytest.raises(DomainError, match="显示名"):
        publish_agent(store, {"name": "小北", "bio": "接活。", "skills": [{"name": "note", "title": "名" * 33, "description": "太长了。"}]})


def test_a_custom_name_cannot_shadow_a_catalog_id():
    store = create_seed()
    with pytest.raises(DomainError, match="预置技能"):
        publish_agent(store, {"name": "阿梨", "bio": "接活。", "skills": [{"name": "Hand_Draw", "description": "自己起的名"}]})
    kept = publish_agent(store, {"name": "老周", "bio": "接活。", "skills": [{"name": "neighborhood", "description": "邻里通知写顺。"}]})
    assert kept["skills"][0]["name"] == "neighborhood"
    with pytest.raises(DomainError, match="预置技能"):
        from a2human.rules import update_agent

        update_agent(store, kept["id"], {"name": "老周", "bio": "接活。", "skills": [{"name": "Paper_Think", "description": "自己起的名"}]})


def test_custom_skills_share_the_six_skill_cap():
    store = create_seed()
    mixed = publish_agent(store, {
        "name": "阿梨",
        "bio": "接活。",
        "skills": [
            {"name": "translate", "description": "中英互译"},
            {"name": "neighborhood", "description": "邻里通知写顺。"},
            {"name": "do_anything", "description": "接目录外的活。"},
            {"name": "计数", "description": "数清楚。"},
        ],
    })
    assert [item["name"] for item in mixed["skills"]] == ["translate", "neighborhood", "do_anything", "计数"]
    six = [{"name": f"custom_{index}", "description": "一项自定义技能。"} for index in range(6)]
    full = publish_agent(store, {"name": "老周", "bio": "接活。", "skills": six})
    assert [item["name"] for item in full["skills"]] == [item["name"] for item in six]


def test_existing_length_and_count_rules_still_apply():
    store = create_seed()
    publish_agent(store, {"name": "阿梨", "bio": "接活。", "skills": [{"name": "计数", "description": "数清楚。"}]})
    with pytest.raises(DomainError, match="最多 6"):
        publish_agent(store, {
            "name": "老周",
            "bio": "接活。",
            "skills": [{"name": name, "description": title} for name, title in PRESETS[:7]]
            + [{"name": "extra_note", "description": "多出来的一项。"}],
        })
    with pytest.raises(DomainError, match="不能重复"):
        publish_agent(store, {
            "name": "小北",
            "bio": "接活。",
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
        assert [(item["name"], item["title"]) for item in body["skills"]] == PRESETS
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
            "bio": "接活。",
            "skills": [{"name": "Hand_Draw", "description": "不行"}],
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
