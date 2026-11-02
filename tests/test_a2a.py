import json

import pytest

from a2human.a2a import dispatch_a2a
from a2human.card import dispatcher_card, to_agent_card
from a2human.clock import now_iso, parse_ms
from a2human.format import record_line
from a2human.rules import (
    SCORE_WAIT_MS,
    DomainError,
    create_seed,
    decide_task,
    expire_scores,
    publish_agent,
    set_availability,
    submit_artifact,
    work_record,
)

counting = {"name": "计数", "description": "数清画面或文字里的东西，只交回数字。"}
physical = {"name": "物理世界", "description": "只回答自己真实看到的现场。"}
png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="


def world():
    store = create_seed()
    on = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [counting]})
    off = publish_agent(store, {"name": "阿梨", "bio": "还没上工。", "skills": [physical]})
    set_availability(store, on["id"], True)
    return store, on, off


def send(text, message_id, extra=None):
    extra = extra or {}
    immediate = extra.get("immediate", True)
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "SendMessage",
        "params": {
            "message": {
                "role": "ROLE_USER",
                "messageId": message_id,
                **({"taskId": extra["taskId"]} if extra.get("taskId") else {}),
                "parts": [{"text": text}],
            },
            "configuration": {} if immediate is False else {"returnImmediately": True},
            "metadata": {"caller": "某个大模型", **({"skill": extra["skill"]} if extra.get("skill") else {})},
        },
    }


def result_of(response):
    assert "error" not in response, json.dumps(response, ensure_ascii=False)
    return response["result"]


def test_human_card_advertises_the_skills_the_person_wrote():
    store, on, off = world()
    card = to_agent_card(on, "http://localhost:3847")
    assert card["supportedInterfaces"][0]["protocolBinding"] == "JSONRPC"
    assert card["supportedInterfaces"][0]["protocolVersion"] == "1.0"
    assert card["supportedInterfaces"][0]["url"] == f"http://localhost:3847/api/a2a/{on['id']}"
    assert card["capabilities"]["streaming"] is False
    assert card["a2human"]["available"] is True
    assert card["a2human"]["completed"] == 0
    assert card["a2human"]["averageScore"] is None
    assert card["a2human"]["averageDuration"] is None
    assert record_line(0, None, None) == "完成 0 单 · 还没有得分 · 还没有耗时"
    assert card["skills"][0]["name"] == "计数"
    assert card["skills"][0]["description"] == counting["description"]
    assert "inputModes" not in card["skills"][0]
    assert "inputSchema" not in card["skills"][0]
    assert "现在在岗" in card["description"]
    hidden = to_agent_card(off, "http://localhost:3847")
    assert hidden["a2human"]["available"] is False
    dispatcher = dispatcher_card("http://localhost:3847", store["agents"])
    assert dispatcher["supportedInterfaces"][0]["url"] == "http://localhost:3847/api/a2a"
    assert len(dispatcher["a2human"]["onDuty"]) == 1
    assert dispatcher["a2human"]["onDuty"][0]["url"] == f"http://localhost:3847/api/a2a/{on['id']}"
    assert dispatcher["a2human"]["onDuty"][0]["skills"][0]["name"] == "计数"
    assert dispatcher["a2human"]["onDuty"][0]["completed"] == 0
    assert dispatcher["a2human"]["onDuty"][0]["averageScore"] is None
    assert dispatcher["a2human"]["onDuty"][0]["averageDuration"] is None


def test_a_skill_schema_stays_beside_the_official_modes():
    input_schema = {"type": "object", "required": ["scene"], "properties": {"scene": {"type": "string"}}}
    output_schema = {"type": "object", "required": ["count"], "properties": {"count": {"type": "integer"}}}
    store = create_seed()
    on = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [{**counting, "inputSchema": input_schema, "outputSchema": output_schema}]})
    set_availability(store, on["id"], True)
    card = to_agent_card(on, "http://localhost:3847")
    assert card["skills"][0]["inputModes"] == ["application/json"]
    assert card["skills"][0]["outputModes"] == ["application/json"]
    assert "inputSchema" not in card["skills"][0]
    params = card["capabilities"]["extensions"][0]["params"]
    assert params["skillSchemas"]["计数"] == {"inputSchema": input_schema, "outputSchema": output_schema}
    dispatcher = dispatcher_card("http://localhost:3847", store["agents"])
    assert dispatcher["a2human"]["onDuty"][0]["skills"][0]["inputSchema"] == input_schema
    assert dispatcher["a2human"]["onDuty"][0]["skills"][0]["outputSchema"] == output_schema


def test_an_image_part_stays_on_the_task_and_comes_back_as_raw():
    input_schema = {"type": "object", "properties": {"照片": {"type": "string", "contentMediaType": "image/*"}}, "required": ["照片"]}
    output_schema = {"type": "object", "properties": {"结果": {"type": "string", "contentMediaType": "image/*"}}, "required": ["结果"]}
    store = create_seed()
    on = publish_agent(store, {"name": "米粒", "bio": "会看图。", "skills": [{"name": "看图", "description": "看一张图，交回另一张。", "inputSchema": input_schema, "outputSchema": output_schema}]})
    set_availability(store, on["id"], True)
    card = to_agent_card(on, "http://localhost:3847")
    assert card["skills"][0]["inputModes"] == ["image/png", "image/jpeg", "image/webp", "image/gif"]
    assert card["skills"][0]["outputModes"] == ["image/png", "image/jpeg", "image/webp", "image/gif"]
    sent = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {
        "jsonrpc": "2.0",
        "id": "img-1",
        "method": "SendMessage",
        "params": {
            "configuration": {"returnImmediately": True, "acceptedOutputModes": ["image/png"]},
            "metadata": {"skill": "看图"},
            "message": {"role": "ROLE_USER", "messageId": "img-1", "parts": [{"mediaType": "image/png", "filename": "dot.png", "raw": png}]},
        },
    })
    task = result_of(sent)["task"]
    stored = next(item for item in store["tasks"] if item["id"] == task["id"])
    assert stored["images"][0]["raw"] == png
    assert png not in stored["brief"]
    submit_artifact(store, task["id"], on["id"], "", {"mediaType": "image/png", "raw": png, "filename": "out.png"})
    got = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-img", "method": "GetTask", "params": {"id": task["id"]}})
    assert "error" not in got
    part = got["result"]["artifacts"][0]["parts"][0]
    assert part["mediaType"] == "image/png"
    assert part["raw"] == png
    assert part["filename"] == "out.png"


def test_send_message_assigns_the_chosen_person_and_get_task_returns_the_artifact():
    store, on, _off = world()
    sent = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("数一下这张纸上的圆。", "msg-1", {"skill": "计数"}))
    task = result_of(sent)["task"]
    assert task["status"]["state"] == "TASK_STATE_WORKING"
    assert task["metadata"]["claimantName"] == "米粒"
    submit_artifact(store, task["id"], on["id"], "7")
    got = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-1", "method": "GetTask", "params": {"id": task["id"]}})
    assert "error" not in got
    loaded = got["result"]
    assert loaded["status"]["state"] == "TASK_STATE_INPUT_REQUIRED"
    assert json.loads(loaded["status"]["message"]["parts"][0]["text"]) == {"request": "score", "taskId": task["id"], "person": "米粒", "artifact": "7"}
    assert loaded["artifacts"][0]["parts"][0]["text"] == "7"
    finished = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send('{"score":5}', "score-7", {"taskId": task["id"]}))
    assert result_of(finished)["task"]["status"]["state"] == "TASK_STATE_COMPLETED"


def test_a_task_can_be_refused_ask_for_input_fail_or_be_canceled():
    store, on, _off = world()
    opened = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("数一下。", "state-1", {"skill": "计数"}))
    task = result_of(opened)["task"]
    decide_task(store, task["id"], on["id"], "input", "画面里是几个圆？")
    asked = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-input", "method": "GetTask", "params": {"id": task["id"]}})
    assert asked["result"]["status"]["state"] == "TASK_STATE_INPUT_REQUIRED"
    assert asked["result"]["status"]["message"]["parts"][0]["text"] == "画面里是几个圆？"
    resumed = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("三个圆。", "state-2", {"taskId": task["id"]}))
    assert result_of(resumed)["task"]["status"]["state"] == "TASK_STATE_WORKING"
    decide_task(store, task["id"], on["id"], "fail", "数不清。")
    failed = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-fail", "method": "GetTask", "params": {"id": task["id"]}})
    assert failed["result"]["status"]["state"] == "TASK_STATE_FAILED"
    assert failed["result"]["status"]["message"]["parts"][0]["text"] == "数不清。"
    refused = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("再数一次。", "state-3", {"skill": "计数"}))
    second = result_of(refused)["task"]
    decide_task(store, second["id"], on["id"], "reject", "这单不接。")
    rejected = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-reject", "method": "GetTask", "params": {"id": second["id"]}})
    assert rejected["result"]["status"]["state"] == "TASK_STATE_REJECTED"
    blocked = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("补一句。", "state-4", {"taskId": second["id"]}))
    assert blocked["error"]["code"] == -32004
    third = result_of(dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("最后一单。", "state-5", {"skill": "计数"})))["task"]
    canceled = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "cancel-1", "method": "CancelTask", "params": {"id": third["id"]}})
    assert "error" not in canceled
    assert canceled["result"]["status"]["state"] == "TASK_STATE_CANCELED"
    again = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "cancel-2", "method": "CancelTask", "params": {"id": third["id"]}})
    assert again["error"]["code"] == -32002


def test_delivery_asks_the_dispatcher_to_score_and_the_score_completes_the_task():
    store, on, _off = world()
    opened = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("数一下。", "score-1", {"skill": "计数"}))
    task = result_of(opened)["task"]
    early = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send('{"score":4}', "score-early", {"taskId": task["id"]}))
    assert result_of(early)["task"]["status"]["state"] == "TASK_STATE_WORKING"
    assert next(item for item in store["tasks"] if item["id"] == task["id"]).get("workScore") is None
    submit_artifact(store, task["id"], on["id"], "3")
    with pytest.raises(DomainError, match="已经交了"):
        decide_task(store, task["id"], on["id"], "input", "再补一句。")
    asked = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-score", "method": "GetTask", "params": {"id": task["id"]}})
    body = asked["result"]
    assert body["status"]["state"] == "TASK_STATE_INPUT_REQUIRED"
    assert json.loads(body["status"]["message"]["parts"][0]["text"]) == {"request": "score", "taskId": task["id"], "person": "米粒", "artifact": "3"}
    assert body["artifacts"][0]["parts"][0]["text"] == "3"
    rejected = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send('{"score":6}', "score-bad", {"taskId": task["id"]}))
    assert "1 到 5" in rejected["error"]["message"]
    assert next(item for item in store["tasks"] if item["id"] == task["id"])["status"] == "input-required"
    scored = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send('{"score":4}', "score-ok", {"taskId": task["id"]}))
    assert result_of(scored)["task"]["status"]["state"] == "TASK_STATE_COMPLETED"
    saved = next(item for item in store["tasks"] if item["id"] == task["id"])
    assert saved["workScore"] == 4
    again = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-score-kept", "method": "GetTask", "params": {"id": task["id"]}})
    kept = again["result"]
    assert kept["status"]["state"] == "TASK_STATE_COMPLETED"
    assert kept["metadata"]["score"] == 4
    assert kept["metadata"]["scoredBy"] == "某个大模型"
    assert kept["metadata"]["person"] == "米粒"
    assert kept["artifacts"][0]["parts"][0]["text"] == "3"


def test_a_card_shows_completed_tasks_and_the_average_score():
    store, on, _off = world()
    first = result_of(dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("第一单。", "record-1", {"skill": "计数"})))["task"]
    second = result_of(dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("第二单。", "record-2", {"skill": "计数"})))["task"]
    third = result_of(dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("第三单。", "record-3", {"skill": "计数"})))["task"]
    submit_artifact(store, first["id"], on["id"], "1")
    dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send('{"score":5}', "record-score-1", {"taskId": first["id"]}))
    submit_artifact(store, second["id"], on["id"], "2")
    dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send('{"score":4}', "record-score-2", {"taskId": second["id"]}))
    submit_artifact(store, third["id"], on["id"], "3")
    request = next(item for item in store["messages"] if item["taskId"] == third["id"] and item["kind"] == "task.scoreRequest")
    expire_scores(store, parse_ms(request["createdAt"]) + SCORE_WAIT_MS)
    started = "2026-11-02T06:00:00.000Z"
    for task_id, seconds in ((first["id"], 120), (second["id"], 60), (third["id"], 180)):
        task = next(item for item in store["tasks"] if item["id"] == task_id)
        task["createdAt"] = started
        task["updatedAt"] = now_iso(parse_ms(started) + seconds * 1000)
    record = work_record(store["tasks"], on["id"])
    assert record == {"completed": 3, "averageScore": 4.5, "averageDuration": 120}
    assert record_line(record["completed"], record["averageScore"], record["averageDuration"]) == "完成 3 单 · 平均 4.5 分 · 平均 2 分钟"
    assert record_line(2, None, 45) == "完成 2 单 · 还没有得分 · 平均 45 秒"
    card = to_agent_card(on, "http://localhost:3847", store["tasks"])
    assert card["a2human"]["completed"] == 3
    assert card["a2human"]["averageScore"] == 4.5
    assert card["a2human"]["averageDuration"] == 120
    roster = dispatcher_card("http://localhost:3847", store["agents"], store["tasks"])
    assert roster["a2human"]["onDuty"][0]["completed"] == 3
    assert roster["a2human"]["onDuty"][0]["averageScore"] == 4.5
    assert roster["a2human"]["onDuty"][0]["averageDuration"] == 120


def test_a_score_request_is_dropped_when_the_model_does_not_reply_in_time():
    store, on, _off = world()
    opened = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("数一下。", "expire-1", {"skill": "计数"}))
    task = result_of(opened)["task"]
    submit_artifact(store, task["id"], on["id"], "3")
    request = next(item for item in store["messages"] if item["taskId"] == task["id"] and item["kind"] == "task.scoreRequest")
    asked = parse_ms(request["createdAt"])
    assert expire_scores(store, asked + SCORE_WAIT_MS - 1) is False
    assert next(item for item in store["tasks"] if item["id"] == task["id"])["status"] == "input-required"
    assert expire_scores(store, asked + SCORE_WAIT_MS) is True
    saved = next(item for item in store["tasks"] if item["id"] == task["id"])
    assert saved["status"] == "completed"
    assert saved.get("workScore") is None
    assert saved["artifact"] == "3"
    late = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send('{"score":4}', "expire-late", {"taskId": task["id"]}))
    assert late["error"]["code"] == -32004
    got = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "expire-get", "method": "GetTask", "params": {"id": task["id"]}})
    body = got["result"]
    assert body["status"]["state"] == "TASK_STATE_COMPLETED"
    assert body["metadata"].get("score") is None
    assert body["artifacts"][0]["parts"][0]["text"] == "3"


def test_application_json_input_is_kept_and_returned_as_data():
    input_schema = {"type": "object", "required": ["scene"], "properties": {"scene": {"type": "string"}}}
    output_schema = {"type": "object", "required": ["count"], "properties": {"count": {"type": "integer"}}}
    store = create_seed()
    on = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [{**counting, "inputSchema": input_schema, "outputSchema": output_schema}]})
    set_availability(store, on["id"], True)
    sent = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {
        "jsonrpc": "2.0",
        "id": "msg-json",
        "method": "SendMessage",
        "params": {
            "configuration": {"returnImmediately": True, "acceptedOutputModes": ["application/json"]},
            "metadata": {"skill": "计数"},
            "message": {"role": "ROLE_USER", "messageId": "msg-json", "parts": [{"mediaType": "application/json", "data": {"scene": "三个圆"}}]},
        },
    })
    task = result_of(sent)["task"]
    assert next(item for item in store["tasks"] if item["id"] == task["id"])["brief"] == '{"scene":"三个圆"}'
    submit_artifact(store, task["id"], on["id"], '{"count":3}')
    got = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "get-json", "method": "GetTask", "params": {"id": task["id"]}})
    part = got["result"]["artifacts"][0]["parts"][0]
    assert part["mediaType"] == "application/json"
    assert part["data"] == {"count": 3}


def test_the_directory_does_not_assign_and_an_off_duty_person_rejects_the_call():
    store, _on, off = world()
    pooled = dispatch_a2a(store, {"kind": "pool"}, send("数一下。", "pool-1", {"skill": "计数"}))
    assert pooled["error"]["code"] == -32004
    assert "onDuty" in pooled["error"]["message"]
    direct = dispatch_a2a(store, {"kind": "human", "agentId": off["id"]}, send("灯开着吗？", "off-1"))
    assert "没上工" in direct["error"]["message"]


def test_blocking_send_message_is_refused_until_return_immediately():
    store, on, _off = world()
    blocked = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("数一下。", "block-1", {"immediate": False}))
    assert blocked["error"]["code"] == -32004


def test_context_id_is_preserved_and_a_mismatch_is_rejected():
    store, on, _off = world()
    base = send("数一下。", "ctx-1")
    sent = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {
        **base,
        "params": {**base["params"], "message": {**base["params"]["message"], "contextId": "ctx-keep"}},
    })
    task = result_of(sent)["task"]
    assert task["contextId"] == "ctx-keep"
    mismatch = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {
        "jsonrpc": "2.0",
        "id": "ctx-2",
        "method": "SendMessage",
        "params": {
            "configuration": {"returnImmediately": True},
            "message": {"role": "ROLE_USER", "messageId": "ctx-2", "taskId": task["id"], "contextId": "other", "parts": [{"text": "再补一句。"}]},
        },
    })
    assert mismatch["error"]["code"] == -32602


def test_unsupported_version_push_and_streaming_use_a2a_error_codes():
    store, on, _off = world()
    version = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, send("数一下。", "ver-1"), {"a2aVersion": "9"})
    assert version["error"]["code"] == -32009
    stream = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "stream-1", "method": "SendStreamingMessage", "params": {}})
    assert stream["error"]["code"] == -32004
    push = dispatch_a2a(store, {"kind": "human", "agentId": on["id"]}, {"jsonrpc": "2.0", "id": "push-1", "method": "tasks/pushNotificationConfig/set", "params": {}})
    assert push["error"]["code"] == -32003
