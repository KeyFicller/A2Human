import uuid

import pytest

from a2human.copy import wire
from a2human.rules import DomainError, _command_title, decide_task, publish_agent, receive_command, score_task, set_availability, set_progress, skip_score, submit_artifact, work_record
from a2human.rules import create_seed

counting = {"name": "计数", "description": "数清画面或文字里的东西，只交回数字。"}


def test_publish_records_the_card_the_person_wrote():
    store = create_seed()
    created = publish_agent(store, {"name": "阿梨", "bio": "不替模型编看不见的事实。", "skills": [counting]})
    assert created["human"] is True
    assert created["available"] is False
    assert created["skills"] == [counting]
    assert created in store["agents"]


def test_a_skill_can_declare_json_schema_for_the_input_and_the_output():
    input_schema = {"type": "object", "required": ["n"], "properties": {"n": {"type": "integer"}}}
    output_schema = {"type": "integer"}
    store = create_seed()
    created = publish_agent(store, {
        "name": "阿梨",
        "bio": "接活。",
        "skills": [{**counting, "inputSchema": input_schema, "outputSchema": dumps_schema(output_schema)}],
    })
    assert created["skills"][0]["inputSchema"] == input_schema
    assert created["skills"][0]["outputSchema"] == output_schema
    with pytest.raises(DomainError, match="要一起写"):
        publish_agent(store, {"name": "老周", "bio": "接活。", "skills": [{**counting, "inputSchema": input_schema}]})


def dumps_schema(value):
    import json
    return json.dumps(value)


def test_a_person_is_discoverable_only_after_going_on_duty():
    store = create_seed()
    created = publish_agent(store, {"name": "阿梨", "bio": "接活。", "skills": [counting]})
    assert created["available"] is False
    set_availability(store, created["id"], True)
    assert created["available"] is True
    set_availability(store, created["id"], False)
    assert created["available"] is False


def test_send_message_lands_on_the_chosen_person_and_the_artifact_comes_back():
    store = create_seed()
    human = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [counting]})
    set_availability(store, human["id"], True)
    task = receive_command(store, {
        "humanId": human["id"],
        "text": "数一下这张纸上的圆。",
        "messageId": "msg-1",
        "callerName": "某个大模型",
        "skill": "计数",
    })
    assert task["status"] == "working"
    assert task["claimantId"] == human["id"]
    done = submit_artifact(store, task["id"], human["id"], "7")
    assert done["status"] == "input-required"
    assert done["artifact"] == "7"
    with pytest.raises(DomainError, match="已经交了"):
        submit_artifact(store, task["id"], human["id"], "8")
    scored = receive_command(store, {
        "humanId": human["id"],
        "text": '{"score":4}',
        "messageId": "score-1",
        "taskId": task["id"],
        "callerName": "某个大模型",
    })
    assert scored["status"] == "completed"
    assert scored["workScore"] == 4


def test_a_declared_output_rejects_free_text():
    input_schema = {"type": "object", "properties": {"scene": {"type": "string"}}}
    output_schema = {"type": "object", "required": ["count"], "properties": {"count": {"type": "integer"}}}
    store = create_seed()
    human = publish_agent(store, {
        "name": "米粒",
        "bio": "会数。",
        "skills": [{**counting, "inputSchema": input_schema, "outputSchema": output_schema}],
    })
    set_availability(store, human["id"], True)
    task = receive_command(store, {
        "humanId": human["id"],
        "text": "数一下。",
        "messageId": "msg-format",
        "callerName": "某个大模型",
        "skill": "计数",
    })
    with pytest.raises(DomainError, match="自由文本"):
        submit_artifact(store, task["id"], human["id"], "三个")
    done = submit_artifact(store, task["id"], human["id"], '{"count": 3}')
    assert done["artifact"] == '{"count":3}'


def test_an_empty_or_placeholder_bio_is_refused():
    store = create_seed()
    with pytest.raises(DomainError, match="简介"):
        publish_agent(store, {"name": "阿梨", "bio": "  ", "skills": [counting]})
    with pytest.raises(DomainError, match="简介"):
        publish_agent(store, {"name": "阿梨", "bio": wire("bio.default"), "skills": [counting]})


def test_a_long_title_stops_on_a_character_and_marks_the_cut():
    assert _command_title("短标题呀") == "短标题呀"
    assert _command_title("甲" * 40) == ("甲" * 31) + "…"
    assert _command_title("a\u0301" * 70) == ("a\u0301" * 63) + "…"


def test_a_short_english_request_keeps_its_whole_title():
    # The limit is in columns: a Chinese character is two, a Latin letter one.
    assert _command_title("QA test: summarize \"buy milk\" in one line.") == "QA test: summarize \"buy milk\" in one line."
    assert _command_title("Roll one die and tell me the number.") == "Roll one die and tell me the number."
    assert _command_title("甲" * 32) == "甲" * 32


def test_progress_is_saved_into_the_conversation():
    store = create_seed()
    human = publish_agent(store, {"name": "米粒", "bio": "会画。", "skills": [counting]})
    set_availability(store, human["id"], True)
    task = receive_command(store, {
        "humanId": human["id"],
        "text": "画一只猫。",
        "messageId": "draw-1",
        "callerName": "测试-找茬员",
        "senderId": "not-used",
    })
    noted = set_progress(store, task["id"], human["id"], "  正在画，马上交图  ")
    assert noted["progress"] == "正在画，马上交图"
    assert any(item["kind"] == "task.progress" and item["text"] == "正在画，马上交图" for item in store["messages"])


def test_handed_in_work_counts_and_a_skipped_score_is_explicit():
    store = create_seed()
    human = publish_agent(store, {"name": "米粒", "bio": "会画。", "skills": [counting]})
    sender = publish_agent(store, {"name": "测试-找茬员", "bio": "找茬。", "skills": [counting]})
    set_availability(store, human["id"], True)
    task = receive_command(store, {
        "humanId": human["id"],
        "text": "数一下。",
        "messageId": "count-1",
        "callerName": sender["name"],
        "senderId": sender["id"],
        "skill": "计数",
    })
    assert task["posterName"] == "测试-找茬员"
    assert task["senderId"] == sender["id"]
    submit_artifact(store, task["id"], human["id"], "7")
    assert work_record(store["tasks"], human["id"])["completed"] == 1
    assert work_record(store["tasks"], human["id"])["averageScore"] is None
    skipped = skip_score(store, task["id"], sender["id"])
    assert skipped["status"] == "completed"
    assert skipped["scoreSkipped"] is True
    assert skipped.get("workScore") is None
    with pytest.raises(DomainError, match="自己"):
        skip_score(store, task["id"], human["id"])


def _market():
    store = create_seed()
    human = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [counting]})
    set_availability(store, human["id"], True)
    return store, human


def _assign(store, human):
    return receive_command(store, {
        "humanId": human["id"],
        "text": "数一下。",
        "messageId": f"blank-{uuid.uuid4()}",
        "callerName": "某个大模型",
        "skill": "计数",
    })


def _note(store, task_id, kind):
    return next(item["text"] for item in store["messages"] if item["taskId"] == task_id and item["kind"] == kind)


def test_a_blank_reject_fail_or_cancel_stores_the_locale_default():
    store, human = _market()
    expected = {
        "zh": {"reject": "已拒绝。", "fail": "已失败。", "cancel": "已取消。"},
        "en": {"reject": "Rejected.", "fail": "Failed.", "cancel": "Canceled."},
    }
    blanks = {"reject": "", "fail": " \n\t ", "cancel": None}
    statuses = {"reject": "rejected", "fail": "failed", "cancel": "canceled"}
    for locale, phrases in expected.items():
        for action, blank in blanks.items():
            task = _assign(store, human)
            done = decide_task(store, task["id"], human["id"], action, blank, locale)
            assert done["status"] == statuses[action]
            assert _note(store, task["id"], f"task.{action}") == phrases[action]


def test_a_written_reason_is_kept_and_a_blank_supplement_is_still_refused():
    store, human = _market()
    rejected = _assign(store, human)
    decide_task(store, rejected["id"], human["id"], "reject", "  这单不接。  ")
    assert _note(store, rejected["id"], "task.reject") == "这单不接。"
    failed = _assign(store, human)
    decide_task(store, failed["id"], human["id"], "fail", "卡在第三步")
    assert _note(store, failed["id"], "task.fail") == "卡在第三步"
    canceled = _assign(store, human)
    decide_task(store, canceled["id"], human["id"], "cancel", "改派")
    assert _note(store, canceled["id"], "task.cancel") == "改派"
    supplement = _assign(store, human)
    with pytest.raises(DomainError, match="1 到 200"):
        decide_task(store, supplement["id"], human["id"], "input", "   ")
    assert supplement["status"] == "working"
    too_long = _assign(store, human)
    with pytest.raises(DomainError, match="1 到 200"):
        decide_task(store, too_long["id"], human["id"], "cancel", "长" * 201)
    assert too_long["status"] == "working"


def test_a_json_brief_and_a_long_sentence_get_a_readable_title():
    assert _command_title('{"requirements":"给这张图起个名字","deadline":"今天"}') == "给这张图起个名字"
    assert _command_title('{"n": 3, "note": "数一下画面里的猫"}') == "数一下画面里的猫"
    long = "我在测 A2Human 的雇佣表单，已经看了名片和复制调用，现在想看看打分会不会真的记下来"
    title = _command_title(long)
    assert title.endswith("…")
    assert title == "我在测 A2Human 的雇佣表单，已经看了名片和复制调用…"


def test_only_the_sender_scores_and_a_self_sent_task_needs_no_score():
    store = create_seed()
    human = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [counting]})
    other = publish_agent(store, {"name": "路人", "bio": "路过。", "skills": [counting]})
    set_availability(store, human["id"], True)
    task = receive_command(store, {
        "humanId": human["id"],
        "text": "数一下。",
        "messageId": "visit-1",
        "callerName": "网页访客",
        "senderId": "visitor-0123abcd",
        "skill": "计数",
    })
    submit_artifact(store, task["id"], human["id"], "7")
    with pytest.raises(DomainError, match="派这单"):
        score_task(store, task["id"], other["id"], 4)
    scored = score_task(store, task["id"], "visitor-0123abcd", 4)
    assert scored["status"] == "completed"
    assert scored["workScore"] == 4
    assert work_record(store["tasks"], human["id"])["averageScore"] == 4
    line = next(item for item in store["messages"] if item["taskId"] == task["id"] and item["kind"] == "task.score")
    assert line["fromName"] == "网页访客"

    own = receive_command(store, {
        "humanId": human["id"],
        "text": "自己派给自己。",
        "messageId": "self-1",
        "callerName": human["name"],
        "senderId": human["id"],
        "skill": "计数",
    })
    done = submit_artifact(store, own["id"], human["id"], "1")
    assert done["status"] == "completed"
    assert done["scoreSkipped"] is True
    assert not any(item["taskId"] == own["id"] and item["kind"] == "task.scoreRequest" for item in store["messages"])


def test_time_on_the_card_runs_from_the_request_to_the_hand_in_not_to_the_score():
    store = create_seed()
    human = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [counting]})
    set_availability(store, human["id"], True)
    task = receive_command(store, {
        "humanId": human["id"],
        "text": "数一下。",
        "messageId": "clock-1",
        "callerName": "网页访客",
        "senderId": "visitor-0123abcd",
        "skill": "计数",
    })
    submit_artifact(store, task["id"], human["id"], "7")
    score_task(store, task["id"], "visitor-0123abcd", 5)
    # Pin the clock: asked at :00, handed in at :13, scored at :45.
    task["createdAt"] = "2026-11-13T07:11:00.000Z"
    task["updatedAt"] = "2026-11-13T07:11:45.000Z"
    for message in store["messages"]:
        if message["taskId"] == task["id"] and message["kind"] == "task.artifact":
            message["createdAt"] = "2026-11-13T07:11:13.000Z"
    assert work_record(store["tasks"], human["id"], store["messages"])["averageDuration"] == 13
    # Without the conversation the record can only use the last update.
    assert work_record(store["tasks"], human["id"])["averageDuration"] == 45
