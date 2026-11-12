import re

import pytest

from a2human.clock import now_iso, now_ms
from a2human.mcp import MCP_TASK_POLL_MS, MCP_TASK_TTL_MS, McpIo, TASKS_EXTENSION, duty_step, handle_mcp, list_duty_tools
from a2human.rules import create_seed, decide_task, publish_agent, set_availability, submit_artifact

counting = {
    "name": "计数",
    "description": "数清画面或文字里的东西，只交回数字。",
    "inputSchema": {
        "type": "object",
        "properties": {
            "scene": {"type": "string", "description": "要数的画面"},
            "photo": {"type": "string", "contentMediaType": "image/png"},
        },
        "required": ["scene"],
    },
    "outputSchema": {"type": "object", "properties": {"count": {"type": "integer"}}, "required": ["count"]},
}
physical = {"name": "物理世界", "description": "只回答自己真实看到的现场。"}
TASKS = {"extensions": {TASKS_EXTENSION: {}}}


def world():
    store = create_seed()
    on = publish_agent(store, {"name": "米粒", "bio": "会数。", "skills": [counting, physical]})
    publish_agent(store, {"name": "阿梨", "bio": "还没上工。", "skills": [physical]})
    set_availability(store, on["id"], True)
    return store, on


def memory(store) -> McpIo:
    return McpIo(read=lambda: store, update=lambda fn: fn(store), max_wait_ms=0)


def body_of(response):
    return response["body"]


def task_of(response):
    result = body_of(response)["result"]
    return result.get("task") or result


def schema_accepts(schema, instance):
    """The slice of JSON Schema that duty tool inputSchemas use."""
    expected = schema.get("type")
    object_like = expected == "object" or (
        expected is None and any(key in schema for key in ("properties", "required", "additionalProperties", "anyOf", "oneOf"))
    )
    if object_like:
        if not isinstance(instance, dict):
            return False
        properties = schema.get("properties") or {}
        if schema.get("additionalProperties") is False and any(key not in properties for key in instance):
            return False
        for key, value in instance.items():
            prop = properties.get(key)
            if isinstance(prop, dict) and not schema_accepts(prop, value):
                return False
        if any(name not in instance for name in schema.get("required") or []):
            return False
    elif expected == "string":
        if not isinstance(instance, str):
            return False
    elif expected == "integer":
        if isinstance(instance, bool) or not isinstance(instance, int):
            return False
    elif expected == "number":
        if isinstance(instance, bool) or not isinstance(instance, (int, float)):
            return False
    elif expected == "boolean":
        if not isinstance(instance, bool):
            return False
    if "anyOf" in schema and not any(schema_accepts(branch, instance) for branch in schema["anyOf"]):
        return False
    if "oneOf" in schema and sum(schema_accepts(branch, instance) for branch in schema["oneOf"]) != 1:
        return False
    return True


async def test_an_enum_is_advertised_and_a_value_outside_it_is_refused():
    store = create_seed()
    skill = {
        "name": "方向",
        "description": "只接受列出的方向。",
        "inputSchema": {
            "type": "object",
            "properties": {"direction": {"type": "string", "enum": ["zh", "en"]}},
            "required": ["direction"],
        },
        "outputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
    }
    on = publish_agent(store, {"name": "米粒", "bio": "会译。", "skills": [skill]})
    set_availability(store, on["id"], True)
    tool = list_duty_tools(store)[0]
    assert tool["inputSchema"]["properties"]["direction"]["enum"] == ["zh", "en"]
    refused = await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"direction": "fr"}}},
        memory(store),
    )
    assert body_of(refused)["result"]["isError"] is True
    assert store["tasks"] == []


def test_mcp_lists_one_tool_per_on_duty_skill_and_keeps_a2a_as_the_path():
    store, on = world()
    tools = list_duty_tools(store)
    assert len(tools) == 2
    assert all(re.fullmatch(r"a2h_[A-Za-z0-9_-]{1,60}", tool["name"]) for tool in tools)
    assert len({tool["name"] for tool in tools}) == 2
    count = tools[0]
    assert "米粒" in count["description"]
    assert "计数" in count["description"]
    assert "完成 0 单" in count["description"]
    assert "A2A" in count["description"]
    schema = count["inputSchema"]
    assert schema["properties"]["scene"]["type"] == "string"
    assert schema["properties"]["photo"]["type"] == "string"
    assert schema["properties"]["task_id"]["type"] == "string"
    assert schema["properties"]["score"]["type"] == "integer"
    assert count["execution"]["taskSupport"] == "optional"
    assert schema["anyOf"] == [
        {"required": ["scene"]},
        {"required": ["task_id"]},
        {"required": ["task_id", "score"]},
    ]
    assert "required" not in schema
    assert tools[1]["inputSchema"]["properties"]["prompt"]["type"] == "string"
    assert "required" not in tools[1]["inputSchema"]
    assert "anyOf" not in tools[1]["inputSchema"]
    assert all("阿梨" not in tool["description"] for tool in list_duty_tools(store))
    assert on["available"] is True


async def test_tools_list_accepts_a_task_id_only_poll_and_keeps_skill_fields_required():
    store, _on = world()
    listed = await handle_mcp({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, memory(store))
    counted = next(tool for tool in body_of(listed)["result"]["tools"] if "scene" in tool["inputSchema"]["properties"])
    schema = counted["inputSchema"]
    assert schema_accepts(schema, {"task_id": "task-1"})
    assert schema_accepts(schema, {"task_id": "task-1", "score": 4})
    assert schema_accepts(schema, {"scene": "三个圆"})
    assert schema_accepts(schema, {"scene": "三个圆", "photo": "https://example.com/a.png"})
    assert not schema_accepts(schema, {})
    assert not schema_accepts(schema, {"photo": "https://example.com/a.png"})
    assert not schema_accepts(schema, {"score": 4})
    assert not schema_accepts(schema, {"task_id": "task-1", "extra": True})

    both = create_seed()
    agent = publish_agent(both, {
        "name": "办事",
        "bio": "按要求。",
        "skills": [{
            "name": "办理",
            "description": "两栏都要。",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "requirements": {"type": "string"},
                    "limit": {"type": "integer"},
                },
                "required": ["requirements", "limit"],
            },
            "outputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
        }],
    })
    set_availability(both, agent["id"], True)
    listed_both = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, memory(both))
    duty = next(tool for tool in body_of(listed_both)["result"]["tools"] if tool["name"] != "a2h_score")
    both_schema = duty["inputSchema"]
    assert both_schema["anyOf"][0]["required"] == ["requirements", "limit"]
    assert schema_accepts(both_schema, {"task_id": "task-2"})
    assert schema_accepts(both_schema, {"task_id": "task-2", "score": 5})
    assert not schema_accepts(both_schema, {"requirements": "把桌子搬到门口"})
    assert schema_accepts(both_schema, {"requirements": "把桌子搬到门口", "limit": 2})
    partial = await handle_mcp(
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": duty["name"], "arguments": {"requirements": "把桌子搬到门口"}}},
        memory(both),
    )
    assert body_of(partial)["result"]["isError"] is True
    assert "limit" in body_of(partial)["result"]["content"][0]["text"]
    assert both["tasks"] == []


async def test_task_id_only_polls_and_a_new_dispatch_still_requires_skill_fields():
    store, _on = world()
    tool = list_duty_tools(store)[0]
    await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}}},
        memory(store),
    )
    task_id = store["tasks"][0]["id"]
    polled = await handle_mcp(
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"task_id": task_id}}},
        memory(store),
    )
    assert "isError" not in body_of(polled)["result"]
    assert task_id in body_of(polled)["result"]["content"][0]["text"]
    assert len(store["tasks"]) == 1
    assert duty_step(store, tool["name"], {"task_id": "missing-task"}) == {"kind": "error", "text": "找不到这张任务"}
    missing = await handle_mcp(
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"task_id": "missing-task"}}},
        memory(store),
    )
    assert body_of(missing)["result"]["isError"] is True
    assert body_of(missing)["result"]["content"][0]["text"] == "找不到这张任务"
    assert len(store["tasks"]) == 1
    assert "scene" in duty_step(store, tool["name"], {})["text"]
    refused = await handle_mcp(
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": tool["name"], "arguments": {}}},
        memory(store),
    )
    assert body_of(refused)["result"]["isError"] is True
    assert "scene" in body_of(refused)["result"]["content"][0]["text"]
    assert len(store["tasks"]) == 1


async def test_a_tool_call_opens_an_a2a_task_and_asks_again_while_the_person_is_still_working():
    store, _on = world()
    tool = list_duty_tools(store)[0]
    response = await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}}},
        memory(store),
    )
    assert response["status"] == 200
    result = response["body"]["result"]
    assert "isError" not in result
    assert "task_id" in result["content"][0]["text"]
    assert len(store["tasks"]) == 1
    assert store["tasks"][0]["claimantName"] == "米粒"
    assert store["tasks"][0]["status"] == "working"
    assert "三个圆" in store["tasks"][0]["brief"]


async def test_delivery_comes_back_as_a_score_request_and_the_score_returns_the_artifact():
    store, _on = world()
    tool = list_duty_tools(store)[0]
    await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}}},
        memory(store),
    )
    task = store["tasks"][0]
    human_id = next(agent["id"] for agent in store["agents"] if agent["name"] == "米粒")
    submit_artifact(store, task["id"], human_id, '{"count":3}')
    waiting = await handle_mcp(
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"task_id": task["id"]}}},
        memory(store),
    )
    score_text = waiting["body"]["result"]["content"][0]["text"]
    assert '"request":"score"' in score_text
    assert "三个圆" in score_text or "3" in score_text
    done = await handle_mcp(
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"task_id": task["id"], "score": 4}}},
        memory(store),
    )
    artifact = done["body"]["result"]
    assert "isError" not in artifact
    assert artifact["content"][0]["text"] == '{"count":3}'
    assert task["status"] == "completed"
    assert task["workScore"] == 4


async def test_initialize_offers_the_protocol_the_client_asked_for_and_tools_list_is_the_fallback_roster():
    store, _on = world()
    opened = await handle_mcp(
        {"jsonrpc": "2.0", "id": "init", "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "cursor", "version": "1"}}},
        memory(store),
    )
    result = opened["body"]["result"]
    assert result["protocolVersion"] == "2025-06-18"
    assert "tasks" not in result["capabilities"]
    assert "A2A" in result["instructions"]
    assert "MCP" in result["instructions"]
    listed = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, memory(store))
    tools = listed["body"]["result"]["tools"]
    assert len(tools) == 3
    score = next(tool for tool in tools if tool["name"] == "a2h_score")
    assert score["execution"]["taskSupport"] == "forbidden"
    assert len([tool for tool in tools if tool["name"] != "a2h_score"]) == 2
    quiet = await handle_mcp({"jsonrpc": "2.0", "method": "notifications/initialized"}, memory(store))
    assert quiet["status"] == 202
    assert quiet["body"] is None


async def test_initialize_negotiates_the_tasks_protocol_and_declares_task_support():
    store, _on = world()
    opened = await handle_mcp(
        {"jsonrpc": "2.0", "id": "init", "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "cursor", "version": "1"}}},
        memory(store),
    )
    result = body_of(opened)["result"]
    assert result["protocolVersion"] == "2025-11-25"
    assert result["capabilities"]["tasks"] == {"list": {}, "cancel": {}, "requests": {"tools": {"call": {}}}}
    unknown = await handle_mcp(
        {"jsonrpc": "2.0", "id": "future", "method": "initialize", "params": {"protocolVersion": "2099-01-01", "capabilities": {}}},
        memory(store),
    )
    fell_back = body_of(unknown)["result"]
    assert fell_back["protocolVersion"] == "2025-11-25"
    assert fell_back["capabilities"]["tasks"]


async def test_a_task_augmented_tool_call_returns_a_handle_immediately():
    store, on = world()
    tool = list_duty_tools(store)[0]
    io = memory(store)
    io.max_wait_ms = 30_000

    async def explode(_ms):
        raise AssertionError("task-augmented call waited")

    io.sleep = explode
    opened = await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}, "task": {"ttl": 60_000}}},
        io,
    )
    assert opened["status"] == 200
    assert body_of(opened).get("error") is None
    created = task_of(opened)
    assert created["status"] == "working"
    assert created["taskId"] == store["tasks"][0]["id"]
    assert created["ttl"] == MCP_TASK_TTL_MS
    assert created["pollInterval"] == MCP_TASK_POLL_MS
    assert store["tasks"][0]["status"] == "working"
    immediate = body_of(opened)["result"].get("_meta") or {}
    assert "tasks/get" in (immediate.get("io.modelcontextprotocol/model-immediate-response") or "")
    early = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tasks/result", "params": {"taskId": created["taskId"]}}, memory(store))
    assert body_of(early)["error"]["code"] == -32099
    working = await handle_mcp({"jsonrpc": "2.0", "id": 3, "method": "tasks/get", "params": {"taskId": created["taskId"]}}, memory(store))
    assert task_of(working)["status"] == "working"
    decide_task(store, created["taskId"], on["id"], "input", "看不清")
    needs_input = await handle_mcp({"jsonrpc": "2.0", "id": 4, "method": "tasks/get", "params": {"taskId": created["taskId"]}}, memory(store))
    assert task_of(needs_input)["status"] == "input_required"
    assert "看不清" in (task_of(needs_input).get("statusMessage") or "")
    assert "task_id" in (task_of(needs_input).get("statusMessage") or "")
    submit_artifact(store, created["taskId"], on["id"], '{"count":3}')
    scoring = await handle_mcp({"jsonrpc": "2.0", "id": 5, "method": "tasks/get", "params": {"taskId": created["taskId"]}}, memory(store))
    assert task_of(scoring)["status"] == "input_required"
    assert "a2h_score" in (task_of(scoring).get("statusMessage") or "")
    assert "60" in (task_of(scoring).get("statusMessage") or "")
    assert "三个圆" in (task_of(scoring).get("statusMessage") or "") or "3" in (task_of(scoring).get("statusMessage") or "")
    ask = await handle_mcp({"jsonrpc": "2.0", "id": 6, "method": "tasks/result", "params": {"taskId": created["taskId"]}}, memory(store))
    ask_result = body_of(ask)["result"]
    assert "isError" not in ask_result
    assert "a2h_score" in ask_result["content"][0]["text"]
    assert ask_result["_meta"]["io.modelcontextprotocol/related-task"]["taskId"] == created["taskId"]
    assert store["tasks"][0]["status"] == "input-required"
    forbidden = await handle_mcp(
        {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "a2h_score", "arguments": {"taskId": created["taskId"], "score": 4}, "task": {}}},
        memory(store),
    )
    assert body_of(forbidden)["error"]["code"] == -32601
    scored = await handle_mcp(
        {"jsonrpc": "2.0", "id": 8, "method": "tools/call", "params": {"name": "a2h_score", "arguments": {"taskId": created["taskId"], "score": 4}}},
        memory(store),
    )
    scored_result = body_of(scored)["result"]
    assert "isError" not in scored_result
    assert scored_result["content"][0]["text"] == '{"count":3}'
    assert store["tasks"][0]["status"] == "completed"
    assert store["tasks"][0]["workScore"] == 4
    done = await handle_mcp({"jsonrpc": "2.0", "id": 9, "method": "tasks/get", "params": {"taskId": created["taskId"]}}, memory(store))
    assert task_of(done)["status"] == "completed"
    payload = await handle_mcp({"jsonrpc": "2.0", "id": 10, "method": "tasks/result", "params": {"taskId": created["taskId"]}}, memory(store))
    final = body_of(payload)["result"]
    assert "isError" not in final
    assert final["content"][0]["text"] == '{"count":3}'
    listed = await handle_mcp({"jsonrpc": "2.0", "id": 11, "method": "tasks/list"}, memory(store))
    page = body_of(listed)["result"]
    assert any(item["taskId"] == created["taskId"] and item["status"] == "completed" for item in page["tasks"])
    assert page.get("nextCursor") is None


async def test_a_missed_score_is_dropped_after_60s_and_the_artifact_is_still_delivered():
    store, on = world()
    tool = list_duty_tools(store)[0]
    opened = await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}, "task": {}}},
        memory(store),
    )
    task_id = task_of(opened)["taskId"]
    submit_artifact(store, task_id, on["id"], '{"count":3}')
    request = next(item for item in store["messages"] if item["taskId"] == task_id and item["kind"] == "task.scoreRequest")
    request["createdAt"] = now_iso(now_ms() - 61_000)
    got = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tasks/get", "params": {"taskId": task_id}}, memory(store))
    assert task_of(got)["status"] == "completed"
    assert store["tasks"][0].get("workScore") is None
    assert store["tasks"][0]["artifact"] == '{"count":3}'
    late = await handle_mcp(
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "a2h_score", "arguments": {"taskId": task_id, "score": 4}}},
        memory(store),
    )
    assert body_of(late)["result"]["isError"] is True
    assert store["tasks"][0].get("workScore") is None
    payload = await handle_mcp({"jsonrpc": "2.0", "id": 4, "method": "tasks/result", "params": {"taskId": task_id}}, memory(store))
    assert body_of(payload)["result"]["content"][0]["text"] == '{"count":3}'


async def test_tasks_cancel_calls_a2a_cancel_task_and_terminal_tasks_stay_terminal():
    store, on = world()
    tool = list_duty_tools(store)[0]
    opened = await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}, "task": {}}},
        memory(store),
    )
    task_id = task_of(opened)["taskId"]
    cancelled = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tasks/cancel", "params": {"taskId": task_id}}, memory(store))
    assert body_of(cancelled).get("error") is None
    assert task_of(cancelled)["status"] == "cancelled"
    assert store["tasks"][0]["status"] == "canceled"
    again = await handle_mcp({"jsonrpc": "2.0", "id": 3, "method": "tasks/cancel", "params": {"taskId": task_id}}, memory(store))
    assert body_of(again)["error"]["code"] == -32602
    assert "cancelled" in body_of(again)["error"]["message"]
    failed_open = await handle_mcp(
        {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "四个圆"}, "task": {}}},
        memory(store),
    )
    failed_id = task_of(failed_open)["taskId"]
    decide_task(store, failed_id, on["id"], "fail", "做不到")
    failed = await handle_mcp({"jsonrpc": "2.0", "id": 5, "method": "tasks/get", "params": {"taskId": failed_id}}, memory(store))
    assert task_of(failed)["status"] == "failed"
    failed_result = await handle_mcp({"jsonrpc": "2.0", "id": 6, "method": "tasks/result", "params": {"taskId": failed_id}}, memory(store))
    assert body_of(failed_result)["result"]["isError"] is True
    assert "做不到" in body_of(failed_result)["result"]["content"][0]["text"]
    rejected_open = await handle_mcp(
        {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "五个圆"}, "task": {}}},
        memory(store),
    )
    rejected_id = task_of(rejected_open)["taskId"]
    decide_task(store, rejected_id, on["id"], "reject", "不接")
    rejected = await handle_mcp({"jsonrpc": "2.0", "id": 8, "method": "tasks/get", "params": {"taskId": rejected_id}}, memory(store))
    assert task_of(rejected)["status"] == "failed"


async def test_expired_tasks_drop_out_and_bad_task_params_are_rejected():
    store, _on = world()
    tool = list_duty_tools(store)[0]
    opened = await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}, "task": {}}},
        memory(store),
    )
    task_id = task_of(opened)["taskId"]
    store["tasks"][0]["createdAt"] = now_iso(now_ms() - MCP_TASK_TTL_MS - 1000)
    missing = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tasks/get", "params": {"taskId": task_id}}, memory(store))
    assert body_of(missing)["error"]["code"] == -32602
    listed = await handle_mcp({"jsonrpc": "2.0", "id": 3, "method": "tasks/list", "params": {}}, memory(store))
    assert all(item["taskId"] != task_id for item in body_of(listed)["result"]["tasks"])
    bad_cursor = await handle_mcp({"jsonrpc": "2.0", "id": 4, "method": "tasks/list", "params": {"cursor": "@@@"}}, memory(store))
    assert body_of(bad_cursor)["error"]["code"] == -32602
    bad_task = await handle_mcp(
        {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}, "task": "soon"}},
        memory(store),
    )
    assert body_of(bad_task)["error"]["code"] == -32602
    absent = await handle_mcp({"jsonrpc": "2.0", "id": 6, "method": "tasks/get", "params": {"taskId": "missing"}}, memory(store))
    assert body_of(absent)["error"]["code"] == -32602


async def test_tasks_result_waits_out_a_working_task_until_it_leaves_working():
    store, on = world()
    tool = list_duty_tools(store)[0]
    await handle_mcp(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": tool["name"], "arguments": {"scene": "三个圆"}, "task": {}}},
        memory(store),
    )
    task_id = store["tasks"][0]["id"]
    io = memory(store)
    io.max_wait_ms = 5_000

    async def deliver(_ms):
        submit_artifact(store, task_id, on["id"], '{"count":3}')

    io.sleep = deliver
    result = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tasks/result", "params": {"taskId": task_id}}, io)
    assert body_of(result).get("error") is None
    assert "a2h_score" in body_of(result)["result"]["content"][0]["text"]
    assert store["tasks"][0]["status"] == "input-required"


def modern_call(store, method, params, rpc_id=1, capabilities=None, io=None):
    if capabilities is None:
        capabilities = TASKS
    name = params.get("name") if isinstance(params.get("name"), str) else params.get("taskId") if isinstance(params.get("taskId"), str) else None
    headers = {"protocolVersion": "2026-07-28", "method": method, "name": name}
    return handle_mcp(
        {
            "jsonrpc": "2.0",
            "id": rpc_id,
            "method": method,
            "params": {
                **params,
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientInfo": {"name": "cursor", "version": "1"},
                    "io.modelcontextprotocol/clientCapabilities": capabilities,
                },
            },
        },
        io or memory(store),
        headers,
    )


async def test_modern_discover_task_handle_and_score_share_the_a2a_task():
    store, on = world()
    tool = list_duty_tools(store)[0]
    discovered = await modern_call(store, "server/discover", {})
    discovery = body_of(discovered)["result"]
    assert discovery["resultType"] == "complete"
    assert "2026-07-28" in discovery["supportedVersions"]
    assert "2025-11-25" in discovery["supportedVersions"]
    assert discovery["capabilities"]["extensions"][TASKS_EXTENSION] == {}
    opened = await modern_call(store, "tools/call", {"name": tool["name"], "arguments": {"scene": "三个圆"}, "task": {"ttl": 1000}})
    created = body_of(opened)["result"]
    assert created["resultType"] == "task"
    assert created["status"] == "working"
    assert "task" not in created
    assert created["ttlMs"] == MCP_TASK_TTL_MS
    assert created["pollIntervalMs"] == MCP_TASK_POLL_MS
    assert created["taskId"] == store["tasks"][0]["id"]
    legacy = await handle_mcp({"jsonrpc": "2.0", "id": 2, "method": "tasks/get", "params": {"taskId": created["taskId"]}}, memory(store))
    assert task_of(legacy)["status"] == "working"
    assert "resultType" not in body_of(legacy)["result"]
    assert task_of(legacy)["pollInterval"] == MCP_TASK_POLL_MS
    submit_artifact(store, created["taskId"], on["id"], '{"count":3}')
    scoring = await modern_call(store, "tasks/get", {"taskId": created["taskId"]}, 3)
    ask = body_of(scoring)["result"]
    assert ask["resultType"] == "complete"
    assert ask["status"] == "input_required"
    assert ask["inputRequests"]["score"]["method"] == "elicitation/create"
    assert "a2h_score" in ask["statusMessage"]
    assert "60" in ask["statusMessage"]
    removed = await modern_call(store, "tasks/result", {"taskId": created["taskId"]}, 4)
    assert removed["status"] == 404
    assert body_of(removed)["error"]["code"] == -32601
    scored = await modern_call(store, "tools/call", {"name": "a2h_score", "arguments": {"taskId": created["taskId"], "score": 4}}, 5, {})
    score_result = body_of(scored)["result"]
    assert score_result["resultType"] == "complete"
    assert "isError" not in score_result
    assert score_result["content"][0]["text"] == '{"count":3}'
    assert store["tasks"][0]["workScore"] == 4
    legacy_result = await handle_mcp({"jsonrpc": "2.0", "id": 6, "method": "tasks/result", "params": {"taskId": created["taskId"]}}, memory(store))
    assert body_of(legacy_result)["result"]["content"][0]["text"] == '{"count":3}'
    done = await modern_call(store, "tasks/get", {"taskId": created["taskId"]}, 7)
    finished = body_of(done)["result"]
    assert finished["status"] == "completed"
    assert finished["result"]["isError"] is False
    assert finished["result"]["content"][0]["text"] == '{"count":3}'


async def test_modern_drops_a_missed_score_after_60s_and_still_returns_the_artifact():
    store, on = world()
    tool = list_duty_tools(store)[0]
    opened = await modern_call(store, "tools/call", {"name": tool["name"], "arguments": {"scene": "三个圆"}})
    task_id = body_of(opened)["result"]["taskId"]
    submit_artifact(store, task_id, on["id"], '{"count":3}')
    request = next(item for item in store["messages"] if item["taskId"] == task_id and item["kind"] == "task.scoreRequest")
    request["createdAt"] = now_iso(now_ms() - 61_000)
    got = await modern_call(store, "tasks/get", {"taskId": task_id}, 2)
    view = body_of(got)["result"]
    assert view["status"] == "completed"
    assert view["result"]["isError"] is False
    assert view["result"]["content"][0]["text"] == '{"count":3}'
    assert store["tasks"][0].get("workScore") is None
    late = await modern_call(store, "tools/call", {"name": "a2h_score", "arguments": {"taskId": task_id, "score": 4}}, 3)
    assert body_of(late)["result"]["isError"] is True
    assert store["tasks"][0].get("workScore") is None


async def test_modern_update_scores_cancel_acks_and_clients_without_the_extension_keep_the_fallback():
    store, on = world()
    tool = list_duty_tools(store)[0]
    io = memory(store)
    io.max_wait_ms = 30_000

    async def explode(_ms):
        raise AssertionError("modern task call waited")

    io.sleep = explode
    opened = await modern_call(store, "tools/call", {"name": tool["name"], "arguments": {"scene": "三个圆"}}, 1, None, io)
    task_id = body_of(opened)["result"]["taskId"]
    submit_artifact(store, task_id, on["id"], '{"count":3}')
    updated = await modern_call(store, "tasks/update", {"taskId": task_id, "inputResponses": {"score": {"action": "accept", "content": {"score": 5}}}}, 2)
    assert body_of(updated)["result"]["resultType"] == "complete"
    assert store["tasks"][0]["workScore"] == 5
    assert store["tasks"][0]["status"] == "completed"
    again = await modern_call(store, "tools/call", {"name": tool["name"], "arguments": {"scene": "四个圆"}}, 3)
    second = body_of(again)["result"]["taskId"]
    cancelled = await modern_call(store, "tasks/cancel", {"taskId": second}, 4)
    assert body_of(cancelled)["result"]["resultType"] == "complete"
    assert "status" not in body_of(cancelled)["result"]
    assert next(item["status"] for item in store["tasks"] if item["id"] == second) == "canceled"
    listed = await modern_call(store, "tasks/list", {}, 5)
    assert listed["status"] == 404
    failed = await modern_call(store, "tasks/get", {"taskId": second}, 6)
    assert body_of(failed)["result"]["status"] == "cancelled"
    third = await modern_call(store, "tools/call", {"name": tool["name"], "arguments": {"scene": "五个圆"}}, 7)
    third_id = body_of(third)["result"]["taskId"]
    decide_task(store, third_id, on["id"], "fail", "做不到")
    tool_error = await modern_call(store, "tasks/get", {"taskId": third_id}, 8)
    failed_view = body_of(tool_error)["result"]
    assert failed_view["status"] == "completed"
    assert failed_view["result"]["isError"] is True
    assert "做不到" in failed_view["result"]["content"][0]["text"]
    fallback = await modern_call(store, "tools/call", {"name": tool["name"], "arguments": {"scene": "六个圆"}, "task": {}}, 9, {}, memory(store))
    fallback_result = body_of(fallback)["result"]
    assert fallback_result["resultType"] == "complete"
    assert "taskId" not in fallback_result
    assert "task_id" in fallback_result["content"][0]["text"]
    bare = await modern_call(store, "tasks/get", {"taskId": third_id}, 10, {})
    assert bare["status"] == 400
    assert body_of(bare)["error"]["code"] == -32021


async def test_modern_rejects_a_protocol_header_that_does_not_match_meta():
    store, _on = world()
    mismatch = await handle_mcp(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {"_meta": {"io.modelcontextprotocol/protocolVersion": "2025-11-25", "io.modelcontextprotocol/clientCapabilities": {}}},
        },
        memory(store),
        {"protocolVersion": "2026-07-28", "method": "tools/list"},
    )
    assert mismatch["status"] == 400
    assert body_of(mismatch)["error"]["code"] == -32020
    unsupported = await handle_mcp(
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {"_meta": {"io.modelcontextprotocol/protocolVersion": "1900-01-01", "io.modelcontextprotocol/clientCapabilities": {}}},
        },
        memory(store),
        {"protocolVersion": "1900-01-01", "method": "tools/list"},
    )
    assert unsupported["status"] == 400
    assert body_of(unsupported)["error"]["code"] == -32022
    data = body_of(unsupported)["error"]["data"]
    assert data["requested"] == "1900-01-01"
    assert "2026-07-28" in data["supported"]
    assert "2025-11-25" in data["supported"]
