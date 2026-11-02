"""MCP entry. Two protocol eras share the same human tasks.

Legacy clients ``initialize`` then call tools. ``2025-11-25`` may attach a
``task`` object and poll ``tasks/get`` / ``tasks/result``. Older clients omit
``task``; the call then waits up to 15 seconds and otherwise says to call again
with ``task_id``.

``2026-07-28`` is stateless: every request carries the protocol version and
client capabilities. Clients that advertise ``io.modelcontextprotocol/tasks``
get a task handle back immediately. Everyone else keeps the 15 second fallback.

A score is the ``a2h_score`` tool. It is accepted for 60 seconds after the
person delivers. After that the score is dropped and the artifact remains.
"""

from __future__ import annotations

import asyncio
import base64
import inspect
import math
import re
import uuid
from typing import Any, Callable

from a2human.a2a import dispatch_a2a, project_task
from a2human.clock import now_ms, parse_ms
from a2human.copy import wire
from a2human.format import record_line
from a2human.jsonutil import dumps, loads
from a2human.rules import SCORE_WAIT_MS, expire_scores, on_duty, work_record

PROTOCOL_VERSIONS = {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}
TASKS_PROTOCOL = "2025-11-25"
MODERN_PROTOCOL = "2026-07-28"
SUPPORTED_VERSIONS = [MODERN_PROTOCOL, *PROTOCOL_VERSIONS]
DEFAULT_PROTOCOL = TASKS_PROTOCOL
PROTOCOL_VERSION_KEY = "io.modelcontextprotocol/protocolVersion"
CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities"
SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo"
TASKS_EXTENSION = "io.modelcontextprotocol/tasks"
SERVER_INFO = {"name": "a2human", "version": "0.1.0"}
WAIT_MS = 15_000
POLL_MS = 1_000
MCP_TASK_TTL_MS = 7 * 24 * 60 * 60 * 1000
MCP_TASK_POLL_MS = 5_000
LIST_PAGE = 50
SCORE_TOOL = "a2h_score"
RELATED_TASK = "io.modelcontextprotocol/related-task"
IMMEDIATE_RESPONSE = "io.modelcontextprotocol/model-immediate-response"
TASK_NOT_READY = -32099
DECISION_KINDS = {"task.input", "task.scoreRequest", "task.reject", "task.fail", "task.cancel"}


class McpIo:
    def __init__(self, read: Callable, update: Callable, max_wait_ms: int | None = WAIT_MS, sleep: Callable | None = None):
        self.read = read
        self.update = update
        self.max_wait_ms = WAIT_MS if max_wait_ms is None else max_wait_ms
        self.sleep = sleep


def _imul(left: int, right: int) -> int:
    left &= 0xFFFFFFFF
    right &= 0xFFFFFFFF
    if left >= 0x80000000:
        left -= 0x100000000
    if right >= 0x80000000:
        right -= 0x100000000
    return (left * right) & 0xFFFFFFFF


def _fnv(value: str) -> str:
    # Same 32-bit FNV-1a the TypeScript server used for stable tool names.
    hash_ = 2166136261
    for char in value:
        hash_ ^= ord(char)
        hash_ = _imul(hash_, 16777619)
    return f"{hash_:08x}"


def _tool_name(agent_id: str, skill_name: str) -> str:
    ident = re.sub(r"[^A-Za-z0-9_-]", "", agent_id)[:8] or "person"
    skill = "".join(char for char in skill_name if re.fullmatch(r"[A-Za-z0-9_-]", char))[:24]
    suffix = _fnv(f"{agent_id}\n{skill_name}")
    base = f"a2h_{ident}_{skill}_{suffix}" if skill else f"a2h_{ident}_{suffix}"
    return base[:64]


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _flat_fields(schema: dict[str, Any] | None) -> list[dict[str, Any]] | None:
    if not schema or schema.get("type") != "object":
        return None
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        return None
    required = {item for item in schema.get("required") or [] if isinstance(item, str)} if isinstance(schema.get("required"), list) else set()
    fields: list[dict[str, Any]] = []
    for name, value in properties.items():
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
            return None
        if not isinstance(value, dict):
            return None
        description = value["description"].strip() if isinstance(value.get("description"), str) else ""
        media = value.get("contentMediaType")
        if value.get("type") == "string" and isinstance(media, str) and media.startswith("image/"):
            kind = "image"
        elif value.get("type") in {"string", "integer", "number", "boolean"} and "contentMediaType" not in value:
            kind = value["type"]
        else:
            return None
        fields.append({"name": name, "kind": kind, "required": name in required, "description": description})
    return fields


def _input_schema(fields: list[dict[str, Any]] | None) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    required: list[str] = []
    if fields:
        for field in fields:
            if field["kind"] == "image":
                properties[field["name"]] = {"type": "string", "description": field["description"] or wire("mcp.imageDescription")}
            else:
                prop: dict[str, Any] = {"type": field["kind"]}
                if field["description"]:
                    prop["description"] = field["description"]
                properties[field["name"]] = prop
            if field["required"]:
                required.append(field["name"])
    else:
        properties["prompt"] = {"type": "string", "description": wire("mcp.promptDescription")}
    if "task_id" not in properties:
        properties["task_id"] = {"type": "string", "description": wire("mcp.taskIdDescription")}
    if "score" not in properties:
        properties["score"] = {"type": "integer", "description": wire("mcp.scoreDescription")}
    if required:
        return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}
    return {"type": "object", "properties": properties, "additionalProperties": False}


def _catalog(store: dict[str, Any]) -> list[dict[str, Any]]:
    used: set[str] = set()
    tools: list[dict[str, Any]] = []
    for agent in on_duty(store["agents"]):
        record = work_record(store["tasks"], agent["id"])
        for index, skill in enumerate(agent["skills"]):
            name = _tool_name(agent["id"], skill["name"])
            while name in used:
                tail = f"_{index + 2}"
                name = f"{name[: 64 - len(tail)]}{tail}"
            used.add(name)
            fields = _flat_fields(skill.get("inputSchema"))
            tools.append({
                "name": name,
                "description": "\n".join([
                    wire("mcp.toolPerson", {"name": agent["name"], "skill": skill["name"]}),
                    wire("mcp.recordLine", {"line": record_line(record["completed"], record["averageScore"], record["averageDuration"])}),
                    skill["description"],
                    wire("mcp.toolPath"),
                ]),
                "inputSchema": _input_schema(fields),
                "agentId": agent["id"],
                "skillName": skill["name"],
                "fields": fields,
            })
    return tools


def list_duty_tools(store: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"name": tool["name"], "description": tool["description"], "inputSchema": tool["inputSchema"], "execution": {"taskSupport": "optional"}}
        for tool in _catalog(store)
    ]


def _score_tool() -> dict[str, Any]:
    return {
        "name": SCORE_TOOL,
        "description": wire("mcp.scoreTool"),
        "inputSchema": {
            "type": "object",
            "properties": {
                "taskId": {"type": "string", "description": wire("mcp.scoreTaskId")},
                "score": {"type": "integer", "description": wire("mcp.scoreDescription")},
            },
            "required": ["taskId", "score"],
            "additionalProperties": False,
        },
        "execution": {"taskSupport": "forbidden"},
    }


def _status_text(task: dict[str, Any]) -> str:
    parts = (task.get("status") or {}).get("message", {}).get("parts") or []
    return "\n".join(part.get("text", "").strip() for part in parts if isinstance(part.get("text"), str) and part["text"].strip())


def _artifact_text(task: dict[str, Any]) -> str:
    chunks: list[str] = []
    for artifact in task.get("artifacts") or []:
        for part in artifact.get("parts") or []:
            if isinstance(part.get("text"), str) and part["text"].strip():
                chunks.append(part["text"].strip())
            elif part.get("data") is not None:
                data = part["data"]
                chunks.append(data if isinstance(data, str) else dumps(data))
    return "\n".join(chunk for chunk in chunks if chunk)


def _task_of(result: object) -> dict[str, Any] | None:
    if not isinstance(result, dict):
        return None
    nested = result.get("task")
    if isinstance(nested, dict) and nested.get("id"):
        return nested
    if isinstance(result.get("id"), str) and result.get("status"):
        return result
    return None


def _explain(response: dict[str, Any]) -> dict[str, Any]:
    if "error" in response:
        return {"kind": "error", "text": response["error"]["message"]}
    task = _task_of(response.get("result"))
    if not task or not task.get("id"):
        return {"kind": "error", "text": wire("mcp.noTask")}
    state = (task.get("status") or {}).get("state")
    note = _status_text(task)
    artifact = _artifact_text(task)
    if state in {"TASK_STATE_WORKING", "TASK_STATE_SUBMITTED"}:
        return {"kind": "pending", "taskId": task["id"], "agentId": "", "text": wire("mcp.stillWorking", {"id": task["id"]})}
    if state == "TASK_STATE_INPUT_REQUIRED":
        return {"kind": "done", "text": note or artifact or state}
    if state == "TASK_STATE_COMPLETED":
        return {"kind": "done", "text": artifact or wire("mcp.emptyArtifact")}
    if state in {"TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED"}:
        return {"kind": "error", "text": note or artifact or state}
    return {"kind": "error", "text": note or wire("task.stopped", {"state": state or wire("task.unknownState")})}


def _with_agent(step: dict[str, Any], agent_id: str) -> dict[str, Any]:
    if step["kind"] != "pending":
        return step
    return {**step, "agentId": agent_id}


def _dispatch(store: dict[str, Any], agent_id: str, skill_name: str, parts: list[dict[str, Any]], task_id: str | None = None) -> dict[str, Any]:
    message_id = str(uuid.uuid4())
    message: dict[str, Any] = {"role": "ROLE_USER", "messageId": message_id, "parts": parts}
    if task_id:
        message["taskId"] = task_id
    response = dispatch_a2a(
        store,
        {"kind": "human", "agentId": agent_id},
        {
            "jsonrpc": "2.0",
            "id": message_id,
            "method": "SendMessage",
            "params": {
                "configuration": {"returnImmediately": True},
                "metadata": {"caller": "MCP", **({"skill": skill_name} if skill_name else {})},
                "message": message,
            },
        },
        {"a2aVersion": "1.0"},
    )
    return _with_agent(_explain(response), agent_id)


def _media_from_url(url: str) -> str:
    path = url.lower()
    if path.endswith(".jpg") or path.endswith(".jpeg"):
        return "image/jpeg"
    if path.endswith(".webp"):
        return "image/webp"
    if path.endswith(".gif"):
        return "image/gif"
    return "image/png"


def _image_part(value: str) -> dict[str, Any]:
    text = value.strip()
    if text.startswith("http://") or text.startswith("https://"):
        return {"mediaType": _media_from_url(text), "url": text}
    matched = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)", text)
    if not matched:
        return {"error": wire("image.url")}
    return {"mediaType": matched.group(1), "raw": re.sub(r"\s", "", matched.group(2))}


def _prompt_parts(prompt: str) -> dict[str, Any]:
    text = prompt.strip()
    if not text:
        return {"error": wire("mcp.promptEmpty")}
    if text.startswith("{") or text.startswith("["):
        try:
            data = loads(text)
            if isinstance(data, (dict, list)):
                return {"parts": [{"mediaType": "application/json", "data": data}]}
        except Exception:
            pass
    return {"parts": [{"text": text}]}


def _field_parts(fields: list[dict[str, Any]], args: dict[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {}
    parts: list[dict[str, Any]] = []
    for field in fields:
        value = args.get(field["name"])
        if field["required"] and (value is None or value == ""):
            return {"error": wire("field.missing", {"name": field["name"]})}
        if value is None or value == "":
            continue
        if field["kind"] == "image":
            if not isinstance(value, str):
                return {"error": wire("image.url")}
            image = _image_part(value)
            if "error" in image:
                return image
            parts.append(image)
            continue
        if field["kind"] == "string" and not isinstance(value, str):
            return {"error": wire("must.string", {"label": field["name"]})}
        if field["kind"] == "integer" and not _is_int(value):
            return {"error": wire("must.integer", {"label": field["name"]})}
        if field["kind"] == "number" and not _is_number(value):
            return {"error": wire("must.number", {"label": field["name"]})}
        if field["kind"] == "boolean" and not isinstance(value, bool):
            return {"error": wire("must.boolean", {"label": field["name"]})}
        data[field["name"]] = value
    if data:
        parts.insert(0, {"mediaType": "application/json", "data": data})
    if not parts:
        return {"error": wire("mcp.fieldsRequired")}
    return {"parts": parts}


def _argument_record(params: object) -> dict[str, Any]:
    if not isinstance(params, dict):
        return {}
    raw = params.get("arguments")
    if isinstance(raw, str):
        try:
            parsed = loads(raw)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    if isinstance(raw, dict):
        return raw
    return {}


def _text_arg(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _poll_task(store: dict[str, Any], agent_id: str, task_id: str) -> dict[str, Any]:
    response = dispatch_a2a(
        store,
        {"kind": "human", "agentId": agent_id},
        {"jsonrpc": "2.0", "id": f"get-{task_id}", "method": "GetTask", "params": {"id": task_id}},
        {"a2aVersion": "1.0"},
    )
    return _with_agent(_explain(response), agent_id)


def _filled(fields: list[dict[str, Any]] | None, args: dict[str, Any]) -> bool:
    if not fields:
        return isinstance(args.get("prompt"), str) and bool(args["prompt"].strip())
    return any(args.get(field["name"]) not in (None, "") for field in fields)


def duty_step(store: dict[str, Any], name: str, args: dict[str, Any]) -> dict[str, Any]:
    tool = next((item for item in _catalog(store) if item["name"] == name), None)
    if not tool:
        return {"kind": "error", "text": wire("skill.absent")}
    task_id = _text_arg(args.get("task_id"))
    if args.get("score") not in (None, ""):
        if not task_id:
            return {"kind": "error", "text": wire("score.needsTask")}
        score = args["score"]
        if not _is_int(score) or not 1 <= score <= 5:
            return {"kind": "error", "text": wire("score.range")}
        return _dispatch(store, tool["agentId"], tool["skillName"], [{"mediaType": "application/json", "data": {"score": score}}], task_id)
    if task_id and not _filled(tool["fields"], args):
        return _poll_task(store, tool["agentId"], task_id)
    content = _field_parts(tool["fields"], args) if tool["fields"] else _prompt_parts(args["prompt"] if isinstance(args.get("prompt"), str) else "")
    if "error" in content:
        return {"kind": "error", "text": content["error"]}
    return _dispatch(store, tool["agentId"], tool["skillName"], content["parts"], task_id)


def _rpc(rpc_id: object, result: object) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rpc_id, "result": result}


def _protocol_error(rpc_id: object, code: int, message: str, status: int = 200, data: object = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"status": status, "body": {"jsonrpc": "2.0", "id": rpc_id, "error": error}}


def _tool_result(step: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {"content": [{"type": "text", "text": step["text"]}]}
    if step["kind"] == "error":
        result["isError"] = True
    return {"status": 200, "body": _rpc(None, result)}


def _with_id(result: dict[str, Any], rpc_id: object) -> dict[str, Any]:
    body = result.get("body")
    if isinstance(body, dict):
        body["id"] = rpc_id
    return result


def _object_params(value: object) -> dict[str, Any] | None:
    if value is None:
        return {}
    if not isinstance(value, dict):
        return None
    return value


async def _resolve(value: object) -> object:
    if inspect.isawaitable(value):
        return await value
    return value


async def _pause(io: McpIo, ms: float, task_id: str | None = None) -> None:
    if io.sleep is not None:
        await _resolve(io.sleep(ms))
        return
    # Another worker may finish the human's task. Redis wakes this wait; Postgres is re-read after.
    if task_id:
        from a2human.bus import wait_for_task

        await wait_for_task(task_id, ms)
        return
    await asyncio.sleep(max(ms, 0) / 1000)


def _read_task_params(params: dict[str, Any]) -> str | None:
    if "task" not in params:
        return None
    task = params["task"]
    if not isinstance(task, dict):
        return "invalid"
    ttl = task.get("ttl")
    if ttl is not None and (not _is_number(ttl) or ttl < 0):
        return "invalid"
    return "yes"


def _mcp_status(status: str) -> str:
    if status in {"submitted", "working"}:
        return "working"
    if status == "input-required":
        return "input_required"
    if status == "completed":
        return "completed"
    if status == "canceled":
        return "cancelled"
    return "failed"


def _terminal(status: str) -> bool:
    return status in {"completed", "failed", "cancelled"}


def _expired(task: dict[str, Any], at: int | None = None) -> bool:
    try:
        created = parse_ms(task["createdAt"])
    except (ValueError, TypeError):
        return True
    return (now_ms() if at is None else at) - created >= MCP_TASK_TTL_MS


def _latest_decision(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any] | None:
    return next((item for item in reversed(store["messages"]) if item["taskId"] == task["id"] and item["kind"] in DECISION_KINDS), None)


def _score_pending(store: dict[str, Any], task: dict[str, Any]) -> bool:
    return task.get("status") == "input-required" and (_latest_decision(store, task) or {}).get("kind") == "task.scoreRequest"


def _mcp_status_message(store: dict[str, Any], task: dict[str, Any]) -> str:
    status = _mcp_status(task["status"])
    if status == "working":
        return wire("mcp.workingStatus")
    if status == "input_required":
        if _score_pending(store, task):
            return wire("mcp.scoreStatus", {"id": task["id"], "seconds": round(SCORE_WAIT_MS / 1000), "artifact": task.get("artifact") or ""})
        return wire("mcp.inputStatus", {"text": (_latest_decision(store, task) or {}).get("text") or ""})
    if status == "completed":
        return wire("mcp.completedStatus") if task.get("artifact") else wire("mcp.emptyArtifact")
    return (_latest_decision(store, task) or {}).get("text") or status


def _project_mcp_task(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    return {
        "taskId": task["id"],
        "status": _mcp_status(task["status"]),
        "statusMessage": _mcp_status_message(store, task),
        "createdAt": task["createdAt"],
        "lastUpdatedAt": task["updatedAt"],
        "ttl": MCP_TASK_TTL_MS,
        "pollInterval": MCP_TASK_POLL_MS,
    }


def _load_task(store: dict[str, Any], task_id: str) -> dict[str, Any]:
    expire_scores(store)
    task = next((item for item in store["tasks"] if item["id"] == task_id), None)
    if not task:
        return {"ok": False, "code": -32602, "message": wire("mcp.taskMissing")}
    if _expired(task):
        return {"ok": False, "code": -32602, "message": wire("mcp.taskExpired")}
    return {"ok": True, "store": store, "task": task, "view": _project_mcp_task(store, task)}


def _task_call_result(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    view = project_task(store, task, {"historyLength": 0, "includeArtifacts": True})
    status = _mcp_status(task["status"])
    meta = {RELATED_TASK: {"taskId": task["id"]}}
    if status == "completed":
        return {"content": [{"type": "text", "text": _artifact_text(view) or wire("mcp.emptyArtifact")}], "_meta": meta}
    if status == "input_required":
        return {"content": [{"type": "text", "text": _mcp_status_message(store, task)}], "_meta": meta}
    text = _status_text(view) or (_latest_decision(store, task) or {}).get("text") or status
    return {"content": [{"type": "text", "text": text}], "isError": True, "_meta": meta}


def _capabilities_for(protocol_version: str) -> dict[str, Any]:
    tools = {"listChanged": False}
    if protocol_version != TASKS_PROTOCOL:
        return {"tools": tools}
    return {"tools": tools, "tasks": {"list": {}, "cancel": {}, "requests": {"tools": {"call": {}}}}}


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> int | None:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        text = base64.urlsafe_b64decode(padded.encode()).decode()
    except Exception:
        return None
    if not text.isdigit():
        return None
    offset = int(text)
    if offset > 2**53 - 1:
        return None
    return offset


async def _call_legacy(rpc_id: object, name: str, args: dict[str, Any], io: McpIo) -> dict[str, Any]:
    step = await _resolve(io.update(lambda store: duty_step(store, name, args)))
    assert isinstance(step, dict)
    deadline = now_ms() + io.max_wait_ms
    while step["kind"] == "pending" and now_ms() < deadline:
        await _pause(io, min(POLL_MS, deadline - now_ms()), step.get("taskId"))
        store = await _resolve(io.read())
        assert isinstance(store, dict)
        step = _with_agent(
            _explain(dispatch_a2a(
                store,
                {"kind": "human", "agentId": step["agentId"]},
                {"jsonrpc": "2.0", "id": f"get-{step['taskId']}", "method": "GetTask", "params": {"id": step["taskId"]}},
                {"a2aVersion": "1.0"},
            )),
            step["agentId"],
        )
    return _with_id(_tool_result(step), rpc_id)


async def _call_task_augmented(rpc_id: object, name: str, args: dict[str, Any], io: McpIo) -> dict[str, Any]:
    def run(store: dict[str, Any]) -> dict[str, Any]:
        step = duty_step(store, name, args)
        task_id = step["taskId"] if step["kind"] == "pending" else _text_arg(args.get("task_id")) if step["kind"] == "done" else None
        task = next((item for item in store["tasks"] if item["id"] == task_id), None) if task_id else None
        return {"step": step, "view": _project_mcp_task(store, task) if task else None}

    outcome = await _resolve(io.update(run))
    assert isinstance(outcome, dict)
    if not outcome["view"]:
        return _with_id(_tool_result(outcome["step"]), rpc_id)
    return {
        "status": 200,
        "body": _rpc(rpc_id, {"task": outcome["view"], "_meta": {IMMEDIATE_RESPONSE: wire("mcp.taskAccepted", {"id": outcome["view"]["taskId"]})}}),
    }


def _apply_score(store: dict[str, Any], task_id: str, score: object) -> dict[str, Any]:
    expire_scores(store)
    if not _is_int(score) or not 1 <= int(score) <= 5:
        return {"kind": "error", "text": wire("score.range")}
    task = next((item for item in store["tasks"] if item["id"] == task_id), None)
    if not task or _expired(task):
        return {"kind": "error", "text": wire("mcp.taskExpired") if task else wire("mcp.taskMissing")}
    if not _score_pending(store, task):
        return {"kind": "error", "text": wire("mcp.scoreNotReady")}
    agent_id = task.get("claimantId") or task.get("targetId")
    if not agent_id:
        return {"kind": "error", "text": wire("mcp.taskMissing")}
    skill = task["skills"][0] if task.get("skills") else ""
    return _dispatch(store, agent_id, skill, [{"mediaType": "application/json", "data": {"score": score}}], task_id)


async def _score_with(rpc_id: object, args: dict[str, Any], io: McpIo) -> dict[str, Any]:
    def run(store: dict[str, Any]) -> dict[str, Any]:
        task_id = _text_arg(args.get("taskId")) or _text_arg(args.get("task_id"))
        if not task_id:
            return {"kind": "error", "text": wire("score.needsTask")}
        return _apply_score(store, task_id, args.get("score"))

    step = await _resolve(io.update(run))
    assert isinstance(step, dict)
    return _with_id(_tool_result(step), rpc_id)


async def _get_mcp_task(rpc_id: object, task_id: str, io: McpIo) -> dict[str, Any]:
    loaded = await _resolve(io.update(lambda store: _load_task(store, task_id)))
    assert isinstance(loaded, dict)
    if not loaded["ok"]:
        return _protocol_error(rpc_id, loaded["code"], loaded["message"])
    return {"status": 200, "body": _rpc(rpc_id, loaded["view"])}


async def _list_mcp_tasks(rpc_id: object, params: dict[str, Any], io: McpIo) -> dict[str, Any]:
    if params.get("cursor") is not None and not isinstance(params.get("cursor"), str):
        return _protocol_error(rpc_id, -32602, wire("mcp.cursor"))
    cursor = params["cursor"] if isinstance(params.get("cursor"), str) else ""
    offset = 0
    if cursor:
        decoded = _decode_cursor(cursor)
        if decoded is None:
            return _protocol_error(rpc_id, -32602, wire("mcp.cursor"))
        offset = decoded

    def run(store: dict[str, Any]) -> dict[str, Any]:
        expire_scores(store)
        live = [task for task in store["tasks"] if not _expired(task)]
        slice_ = live[offset : offset + LIST_PAGE]
        page: dict[str, Any] = {"tasks": [_project_mcp_task(store, task) for task in slice_]}
        if offset + len(slice_) < len(live):
            page["nextCursor"] = _encode_cursor(offset + len(slice_))
        return page

    page = await _resolve(io.update(run))
    return {"status": 200, "body": _rpc(rpc_id, page)}


async def _cancel_mcp_task(rpc_id: object, task_id: str, io: McpIo) -> dict[str, Any]:
    def run(store: dict[str, Any]) -> dict[str, Any]:
        loaded = _load_task(store, task_id)
        if not loaded["ok"]:
            return loaded
        if _terminal(loaded["view"]["status"]):
            return {"ok": False, "code": -32602, "message": wire("mcp.cancelTerminal", {"status": loaded["view"]["status"]})}
        agent_id = loaded["task"].get("claimantId") or loaded["task"].get("targetId")
        if not agent_id:
            return {"ok": False, "code": -32602, "message": wire("mcp.taskMissing")}
        response = dispatch_a2a(
            store,
            {"kind": "human", "agentId": agent_id},
            {"jsonrpc": "2.0", "id": f"cancel-{task_id}", "method": "CancelTask", "params": {"id": task_id}},
            {"a2aVersion": "1.0"},
        )
        if "error" in response:
            status = _mcp_status(loaded["task"]["status"])
            if _terminal(status):
                return {"ok": False, "code": -32602, "message": wire("mcp.cancelTerminal", {"status": status})}
            return {"ok": False, "code": -32602, "message": response["error"]["message"]}
        return {"ok": True, "view": _project_mcp_task(store, loaded["task"])}

    outcome = await _resolve(io.update(run))
    assert isinstance(outcome, dict)
    if not outcome["ok"]:
        return _protocol_error(rpc_id, outcome["code"], outcome["message"])
    return {"status": 200, "body": _rpc(rpc_id, outcome["view"])}


async def _result_mcp_task(rpc_id: object, task_id: str, io: McpIo) -> dict[str, Any]:
    # One JSON body, so a working task is polled only until max_wait_ms and then
    # returns -32099. input_required is returned immediately.
    deadline = now_ms() + io.max_wait_ms
    while True:
        loaded = await _resolve(io.update(lambda store: _load_task(store, task_id)))
        assert isinstance(loaded, dict)
        if not loaded["ok"]:
            return _protocol_error(rpc_id, loaded["code"], loaded["message"])
        if loaded["view"]["status"] != "working":
            return {"status": 200, "body": _rpc(rpc_id, _task_call_result(loaded["store"], loaded["task"]))}
        remaining = deadline - now_ms()
        if remaining <= 0:
            return _protocol_error(rpc_id, TASK_NOT_READY, wire("mcp.taskNotTerminal", {"status": loaded["view"]["status"]}))
        await _pause(io, min(MCP_TASK_POLL_MS, remaining), task_id)


def _meta_record(request: dict[str, Any]) -> dict[str, Any] | None:
    params = request.get("params")
    sources = []
    if isinstance(params, dict):
        sources.append(params.get("_meta"))
    sources.append(request.get("_meta"))
    for source in sources:
        if isinstance(source, dict):
            return source
    return None


def _header_text(value: object) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    encoded = re.fullmatch(r"=\?base64\?([A-Za-z0-9+/]+={0,2})\?=", value)
    if not encoded:
        return value
    return base64.b64decode(encoded.group(1)).decode("utf-8")


def _header_get(headers: dict[str, Any] | None, *names: str) -> str | None:
    if not headers:
        return None
    for name in names:
        if name in headers and headers[name]:
            return headers[name]
    return None


def _open_era(request: dict[str, Any], headers: dict[str, Any] | None) -> str | dict[str, Any]:
    rpc_id = request["id"] if "id" in request else None
    meta = _meta_record(request)
    from_meta = meta.get(PROTOCOL_VERSION_KEY) if isinstance(meta, dict) and isinstance(meta.get(PROTOCOL_VERSION_KEY), str) else None
    from_header = (_header_get(headers, "protocolVersion", "protocol_version") or "").strip() or None
    if from_header and from_meta and from_header != from_meta:
        return _protocol_error(rpc_id, -32020, wire("mcp.headerMismatch", {"name": "MCP-Protocol-Version", "header": from_header, "body": from_meta}), 400)
    declared = from_meta or from_header
    if not declared:
        return "legacy"
    if declared != MODERN_PROTOCOL:
        if declared in PROTOCOL_VERSIONS:
            return "legacy"
        return _protocol_error(rpc_id, -32022, wire("mcp.unsupportedVersion"), 400, {"supported": SUPPORTED_VERSIONS, "requested": declared})
    if not from_header:
        return _protocol_error(rpc_id, -32020, wire("mcp.headerMissing", {"name": "MCP-Protocol-Version"}), 400)
    if not from_meta:
        return _protocol_error(rpc_id, -32020, wire("mcp.headerMismatch", {"name": "MCP-Protocol-Version", "header": from_header, "body": ""}), 400)
    return "modern"


def _server_meta() -> dict[str, Any]:
    return {SERVER_INFO_KEY: SERVER_INFO}


def _modern_result(rpc_id: object, result: dict[str, Any], status: int = 200) -> dict[str, Any]:
    meta = {**(result.get("_meta") or {}), **_server_meta()}
    return {"status": status, "body": _rpc(rpc_id, {**result, "_meta": meta})}


def _has_tasks(capabilities: object) -> bool:
    if not isinstance(capabilities, dict):
        return False
    extensions = capabilities.get("extensions")
    if not isinstance(extensions, dict):
        return False
    return TASKS_EXTENSION in extensions


def _missing_tasks(rpc_id: object) -> dict[str, Any]:
    return _protocol_error(rpc_id, -32021, wire("mcp.missingTasks"), 400, {"requiredCapabilities": {"extensions": {TASKS_EXTENSION: {}}}})


def _named_header(method: str, params: dict[str, Any]) -> str | None:
    if method == "tools/call":
        return params["name"] if isinstance(params.get("name"), str) else ""
    if method in {"tasks/get", "tasks/update", "tasks/cancel"}:
        return _text_arg(params.get("taskId")) or ""
    return None


def _check_modern_headers(rpc_id: object, method: str, params: dict[str, Any], headers: dict[str, Any]) -> dict[str, Any] | None:
    method_header = _header_text(_header_get(headers, "method"))
    if not method_header:
        return _protocol_error(rpc_id, -32020, wire("mcp.headerMissing", {"name": "Mcp-Method"}), 400)
    if method_header != method:
        return _protocol_error(rpc_id, -32020, wire("mcp.headerMismatch", {"name": "Mcp-Method", "header": method_header, "body": method}), 400)
    expected = _named_header(method, params)
    if expected is None:
        return None
    name_header = _header_text(_header_get(headers, "name"))
    if not name_header:
        return _protocol_error(rpc_id, -32020, wire("mcp.headerMissing", {"name": "Mcp-Name"}), 400)
    if name_header != expected:
        return _protocol_error(rpc_id, -32020, wire("mcp.headerMismatch", {"name": "Mcp-Name", "header": name_header, "body": expected}), 400)
    return None


def _modern_tool_list(store: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"name": tool["name"], "description": tool["description"], "inputSchema": tool["inputSchema"]}
        for tool in [*list_duty_tools(store), _score_tool()]
    ]


def _tool_payload(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    if task["status"] in {"failed", "rejected"}:
        text = (_latest_decision(store, task) or {}).get("text") or "failed"
        return {"content": [{"type": "text", "text": text}], "isError": True}
    view = project_task(store, task, {"historyLength": 0, "includeArtifacts": True})
    return {"content": [{"type": "text", "text": _artifact_text(view) or wire("mcp.emptyArtifact")}], "isError": False}


def _input_requests(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    message = _mcp_status_message(store, task)
    if _score_pending(store, task):
        return {
            "score": {
                "method": "elicitation/create",
                "params": {
                    "mode": "form",
                    "message": message,
                    "requestedSchema": {"type": "object", "properties": {"score": {"type": "integer", "minimum": 1, "maximum": 5}}, "required": ["score"]},
                },
            }
        }
    return {
        "followUp": {
            "method": "elicitation/create",
            "params": {
                "mode": "form",
                "message": message,
                "requestedSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
            },
        }
    }


def _modern_task(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any]:
    failed = task["status"] in {"failed", "rejected"}
    status = "completed" if failed or task["status"] == "completed" else _mcp_status(task["status"])
    body: dict[str, Any] = {
        "resultType": "complete",
        "taskId": task["id"],
        "status": status,
        "statusMessage": _mcp_status_message(store, task),
        "createdAt": task["createdAt"],
        "lastUpdatedAt": task["updatedAt"],
        "ttlMs": MCP_TASK_TTL_MS,
        "pollIntervalMs": MCP_TASK_POLL_MS,
    }
    if status == "input_required":
        body["inputRequests"] = _input_requests(store, task)
    if status == "completed":
        body["result"] = _tool_payload(store, task)
    return body


def _response_content(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    content = value.get("content")
    if not isinstance(content, dict):
        return None
    return content


def _score_from_response(value: object) -> int | None:
    content = _response_content(value)
    if not content:
        return None
    if _is_int(content.get("score")):
        return content["score"]
    incoming = content.get("input")
    if _is_int(incoming):
        return incoming
    if isinstance(incoming, dict) and _is_int(incoming.get("score")):
        return incoming["score"]
    return None


def _text_from_response(value: object) -> str | None:
    content = _response_content(value)
    if not content:
        return None
    if isinstance(content.get("text"), str) and content["text"].strip():
        return content["text"].strip()
    incoming = content.get("input")
    if isinstance(incoming, str) and incoming.strip():
        return incoming.strip()
    if isinstance(incoming, dict) and isinstance(incoming.get("text"), str) and incoming["text"].strip():
        return incoming["text"].strip()
    return None


def _apply_follow_up(store: dict[str, Any], task_id: str, text: str) -> dict[str, Any]:
    expire_scores(store)
    task = next((item for item in store["tasks"] if item["id"] == task_id), None)
    if not task or _expired(task):
        return {"kind": "error", "text": wire("mcp.taskExpired") if task else wire("mcp.taskMissing")}
    if task["status"] != "input-required" or _score_pending(store, task):
        return {"kind": "done", "text": ""}
    agent_id = task.get("claimantId") or task.get("targetId")
    if not agent_id:
        return {"kind": "error", "text": wire("mcp.taskMissing")}
    skill = task["skills"][0] if task.get("skills") else ""
    return _dispatch(store, agent_id, skill, [{"text": text}], task_id)


async def _discover_modern(rpc_id: object) -> dict[str, Any]:
    return _modern_result(rpc_id, {
        "resultType": "complete",
        "supportedVersions": SUPPORTED_VERSIONS,
        "capabilities": {"tools": {"listChanged": False}, "extensions": {TASKS_EXTENSION: {}}},
        "instructions": wire("mcp.instructions"),
        "ttlMs": 3_600_000,
        "cacheScope": "public",
    })


async def _call_modern_task(rpc_id: object, name: str, args: dict[str, Any], io: McpIo) -> dict[str, Any]:
    def run(store: dict[str, Any]) -> dict[str, Any]:
        step = duty_step(store, name, args)
        task_id = step["taskId"] if step["kind"] == "pending" else _text_arg(args.get("task_id")) if step["kind"] == "done" else None
        task = next((item for item in store["tasks"] if item["id"] == task_id), None) if task_id else None
        return {"step": step, "task": task, "store": store}

    outcome = await _resolve(io.update(run))
    assert isinstance(outcome, dict)
    if not outcome["task"]:
        result = _with_id(_tool_result(outcome["step"]), rpc_id)
        body = result["body"]["result"]
        body["resultType"] = "complete"
        body["_meta"] = _server_meta()
        return result
    task = outcome["task"]
    return _modern_result(rpc_id, {
        "resultType": "task",
        "taskId": task["id"],
        "status": _mcp_status(task["status"]),
        "statusMessage": _mcp_status_message(outcome["store"], task),
        "createdAt": task["createdAt"],
        "lastUpdatedAt": task["updatedAt"],
        "ttlMs": MCP_TASK_TTL_MS,
        "pollIntervalMs": MCP_TASK_POLL_MS,
    })


async def _update_modern_task(rpc_id: object, params: dict[str, Any], io: McpIo) -> dict[str, Any]:
    task_id = _text_arg(params.get("taskId"))
    if not task_id:
        return _protocol_error(rpc_id, -32602, wire("mcp.taskIdParam"))
    responses = params.get("inputResponses")
    if not isinstance(responses, dict):
        return _protocol_error(rpc_id, -32602, wire("params.object"))

    def run(store: dict[str, Any]) -> dict[str, Any]:
        loaded = _load_task(store, task_id)
        if not loaded["ok"]:
            return loaded
        if "score" in responses and _score_pending(store, loaded["task"]):
            score = _score_from_response(responses["score"])
            if score is None:
                return {"ok": False, "code": -32602, "message": wire("score.range")}
            step = _apply_score(store, task_id, score)
            if step["kind"] == "error":
                return {"ok": False, "code": -32602, "message": step["text"]}
        if "followUp" in responses and loaded["task"]["status"] == "input-required" and not _score_pending(store, loaded["task"]):
            text = _text_from_response(responses["followUp"])
            if not text:
                return {"ok": False, "code": -32602, "message": wire("mcp.fieldsRequired")}
            step = _apply_follow_up(store, task_id, text)
            if step["kind"] == "error":
                return {"ok": False, "code": -32602, "message": step["text"]}
        return {"ok": True}

    outcome = await _resolve(io.update(run))
    assert isinstance(outcome, dict)
    if not outcome["ok"]:
        return _protocol_error(rpc_id, outcome["code"], outcome["message"])
    return _modern_result(rpc_id, {"resultType": "complete"})


async def _cancel_modern_task(rpc_id: object, task_id: str, io: McpIo) -> dict[str, Any]:
    def run(store: dict[str, Any]) -> dict[str, Any]:
        loaded = _load_task(store, task_id)
        if not loaded["ok"]:
            return loaded
        if _terminal(_mcp_status(loaded["task"]["status"])) or loaded["task"]["status"] in {"failed", "rejected"}:
            return {"ok": True}
        agent_id = loaded["task"].get("claimantId") or loaded["task"].get("targetId")
        if not agent_id:
            return {"ok": False, "code": -32602, "message": wire("mcp.taskMissing")}
        dispatch_a2a(
            store,
            {"kind": "human", "agentId": agent_id},
            {"jsonrpc": "2.0", "id": f"cancel-{task_id}", "method": "CancelTask", "params": {"id": task_id}},
            {"a2aVersion": "1.0"},
        )
        return {"ok": True}

    outcome = await _resolve(io.update(run))
    assert isinstance(outcome, dict)
    if not outcome["ok"]:
        return _protocol_error(rpc_id, outcome["code"], outcome["message"])
    return _modern_result(rpc_id, {"resultType": "complete"})


async def _handle_modern(request: dict[str, Any], io: McpIo, headers: dict[str, Any]) -> dict[str, Any]:
    rpc_id = request["id"] if "id" in request else None
    method = request.get("method")
    if not isinstance(method, str):
        return _protocol_error(rpc_id, -32600, wire("rpc.not"), 400)
    if "id" not in request and method.startswith("notifications/"):
        return {"status": 202, "body": None}
    params = _object_params(request.get("params"))
    if params is None:
        return _protocol_error(rpc_id, -32602, wire("params.object"), 400)
    meta = _meta_record(request)
    if not meta or CLIENT_CAPABILITIES_KEY not in meta:
        return _protocol_error(rpc_id, -32602, wire("mcp.capabilitiesRequired"), 400)
    header_error = _check_modern_headers(rpc_id, method, params, headers)
    if header_error:
        return header_error
    tasks = _has_tasks(meta.get(CLIENT_CAPABILITIES_KEY))
    if method == "server/discover":
        return await _discover_modern(rpc_id)
    if method == "tools/list":
        store = await _resolve(io.read())
        assert isinstance(store, dict)
        return _modern_result(rpc_id, {"resultType": "complete", "tools": _modern_tool_list(store)})
    if method == "tools/call":
        name = params["name"] if isinstance(params.get("name"), str) else ""
        args = _argument_record(params)
        if name == SCORE_TOOL:
            scored = await _score_with(rpc_id, args, io)
            body = scored.get("body")
            if isinstance(body, dict) and isinstance(body.get("result"), dict):
                body["result"]["resultType"] = "complete"
                body["result"]["_meta"] = {**(body["result"].get("_meta") or {}), **_server_meta()}
            return scored
        if tasks:
            return await _call_modern_task(rpc_id, name, args, io)
        legacy = await _call_legacy(rpc_id, name, args, io)
        body = legacy.get("body")
        if isinstance(body, dict) and isinstance(body.get("result"), dict):
            body["result"]["resultType"] = "complete"
            body["result"]["_meta"] = {**(body["result"].get("_meta") or {}), **_server_meta()}
        return legacy
    if method in {"tasks/get", "tasks/update", "tasks/cancel"}:
        if not tasks:
            return _missing_tasks(rpc_id)
        if method == "tasks/update":
            return await _update_modern_task(rpc_id, params, io)
        task_id = _text_arg(params.get("taskId"))
        if not task_id:
            return _protocol_error(rpc_id, -32602, wire("mcp.taskIdParam"))
        if method == "tasks/cancel":
            return await _cancel_modern_task(rpc_id, task_id, io)
        loaded = await _resolve(io.update(lambda store: _load_task(store, task_id)))
        assert isinstance(loaded, dict)
        if not loaded["ok"]:
            return _protocol_error(rpc_id, loaded["code"], loaded["message"])
        return _modern_result(rpc_id, _modern_task(loaded["store"], loaded["task"]))
    return _protocol_error(rpc_id, -32601, wire("method.unknown", {"method": method}), 404)


async def handle_mcp(body: object, io: McpIo, headers: dict[str, Any] | None = None) -> dict[str, Any]:
    if not isinstance(body, dict):
        return {"status": 400, "body": {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": wire("rpc.not")}}}
    era = _open_era(body, headers)
    if not isinstance(era, str):
        return era
    if era == "modern":
        return await _handle_modern(body, io, headers or {})
    method = body.get("method")
    if not isinstance(method, str):
        return {"status": 400, "body": {"jsonrpc": "2.0", "id": body.get("id"), "error": {"code": -32600, "message": wire("rpc.not")}}}
    if "id" not in body and method.startswith("notifications/"):
        return {"status": 202, "body": None}
    rpc_id = body["id"] if "id" in body else None
    if method == "initialize":
        params = body.get("params") if isinstance(body.get("params"), dict) else {}
        asked = params.get("protocolVersion") if isinstance(params.get("protocolVersion"), str) else DEFAULT_PROTOCOL
        protocol_version = asked if asked in PROTOCOL_VERSIONS else DEFAULT_PROTOCOL
        return {
            "status": 200,
            "body": _rpc(rpc_id, {
                "protocolVersion": protocol_version,
                "capabilities": _capabilities_for(protocol_version),
                "serverInfo": {"name": "a2human", "version": "0.1.0"},
                "instructions": wire("mcp.instructions"),
            }),
        }
    if method == "ping":
        return {"status": 200, "body": _rpc(rpc_id, {})}
    if method == "tools/list":
        store = await _resolve(io.read())
        assert isinstance(store, dict)
        return {"status": 200, "body": _rpc(rpc_id, {"tools": [*list_duty_tools(store), _score_tool()]})}
    if method == "tools/call":
        params = _object_params(body.get("params"))
        if params is None:
            return _protocol_error(rpc_id, -32602, wire("params.object"))
        name = params["name"] if isinstance(params.get("name"), str) else ""
        args = _argument_record(params)
        task_mode = _read_task_params(params)
        if task_mode == "invalid":
            return _protocol_error(rpc_id, -32602, wire("mcp.taskParams"))
        if name == SCORE_TOOL:
            if task_mode == "yes":
                return _protocol_error(rpc_id, -32601, wire("mcp.taskForbidden"))
            return await _score_with(rpc_id, args, io)
        if task_mode == "yes":
            return await _call_task_augmented(rpc_id, name, args, io)
        return await _call_legacy(rpc_id, name, args, io)
    params = _object_params(body.get("params"))
    if method in {"tasks/get", "tasks/result", "tasks/cancel"}:
        if params is None:
            return _protocol_error(rpc_id, -32602, wire("params.object"))
        task_id = _text_arg(params.get("taskId"))
        if not task_id:
            return _protocol_error(rpc_id, -32602, wire("mcp.taskIdParam"))
        if method == "tasks/get":
            return await _get_mcp_task(rpc_id, task_id, io)
        if method == "tasks/cancel":
            return await _cancel_mcp_task(rpc_id, task_id, io)
        return await _result_mcp_task(rpc_id, task_id, io)
    if method == "tasks/list":
        if params is None:
            return _protocol_error(rpc_id, -32602, wire("params.object"))
        return await _list_mcp_tasks(rpc_id, params, io)
    return {"status": 200, "body": {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": -32601, "message": wire("method.unknown", {"method": str(method)})}}}
