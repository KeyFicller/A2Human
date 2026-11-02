import pytest

from a2human.rules import DomainError, publish_agent, receive_command, set_availability, submit_artifact
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
        "bio": "",
        "skills": [{**counting, "inputSchema": input_schema, "outputSchema": dumps_schema(output_schema)}],
    })
    assert created["skills"][0]["inputSchema"] == input_schema
    assert created["skills"][0]["outputSchema"] == output_schema
    with pytest.raises(DomainError, match="要一起写"):
        publish_agent(store, {"name": "老周", "bio": "", "skills": [{**counting, "inputSchema": input_schema}]})


def dumps_schema(value):
    import json
    return json.dumps(value)


def test_a_person_is_discoverable_only_after_going_on_duty():
    store = create_seed()
    created = publish_agent(store, {"name": "阿梨", "bio": "", "skills": [counting]})
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
