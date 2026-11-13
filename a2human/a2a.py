"""A2A JSON-RPC for one person, or for the directory that only lists who is on duty.

The directory does not assign work. SendMessage needs ``returnImmediately: true``.
Streaming and push notifications are refused with the A2A error codes.
"""

from __future__ import annotations

import re
from typing import Any

from a2human.copy import wire
from a2human.dispatch import route_dispatch
from a2human.audio import read_audio
from a2human.images import read_image
from a2human.jsonutil import dumps, loads
from a2human.rules import (
    DomainError,
    artifact_reference,
    cancel_commanded_task,
    command_for_message,
    expire_scores,
    receive_command,
)

STATES = {
    "submitted": "TASK_STATE_SUBMITTED",
    "working": "TASK_STATE_WORKING",
    "completed": "TASK_STATE_COMPLETED",
    "canceled": "TASK_STATE_CANCELED",
    "failed": "TASK_STATE_FAILED",
    "rejected": "TASK_STATE_REJECTED",
    "input-required": "TASK_STATE_INPUT_REQUIRED",
}
STATE_NAMES = {name: status for status, name in STATES.items()}
REASONS = {
    -32001: "TASK_NOT_FOUND",
    -32002: "TASK_NOT_CANCELABLE",
    -32003: "PUSH_NOTIFICATION_NOT_SUPPORTED",
    -32004: "UNSUPPORTED_OPERATION",
    -32005: "CONTENT_TYPE_NOT_SUPPORTED",
    -32009: "VERSION_NOT_SUPPORTED",
    -32602: "INVALID_ARGUMENT",
}
PUSH_METHODS = {
    "CreateTaskPushNotificationConfig",
    "GetTaskPushNotificationConfig",
    "ListTaskPushNotificationConfigs",
    "DeleteTaskPushNotificationConfig",
    "tasks/pushNotificationConfig/set",
    "tasks/pushNotificationConfig/get",
    "tasks/pushNotificationConfig/list",
    "tasks/pushNotificationConfig/delete",
}
SUPPORTED_VERSIONS = {"1.0", "0.3"}
DECISION_KINDS = {"task.input", "task.scoreRequest", "task.reject", "task.fail", "task.cancel"}
_MISSING = object()


def rpc_error(rpc_id: object, code: int, message: str) -> dict[str, Any]:
    reason = REASONS.get(code)
    error: dict[str, Any] = {"code": code, "message": message}
    if reason:
        error["data"] = [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": reason, "domain": "a2a-protocol.org"}]
    return {"jsonrpc": "2.0", "id": rpc_id, "error": error}


def _ok(rpc_id: object, result: object) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rpc_id, "result": result}


def _as_id(value: object) -> object:
    if value is None or isinstance(value, str) or (isinstance(value, (int, float)) and not isinstance(value, bool)):
        return None if value is None else value
    return _MISSING


def _task_context(task: dict[str, Any]) -> str:
    return task.get("contextId") or task["id"]


def _output_schema(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any] | None:
    agent = next((item for item in store["agents"] if item["id"] == task.get("claimantId")), None)
    if not agent:
        return None
    named = task["skills"][0] if len(task.get("skills") or []) == 1 else None
    if named:
        skill = next((item for item in agent["skills"] if item["name"] == named), None)
    elif len(agent["skills"]) == 1:
        skill = agent["skills"][0]
    else:
        skill = None
    return skill.get("outputSchema") if skill else None


def _image_part(image: dict[str, Any]) -> dict[str, Any]:
    file_part: dict[str, Any] = {"mediaType": image["mediaType"]}
    if image.get("filename"):
        file_part["name"] = image["filename"]
    if image.get("raw"):
        file_part["bytes"] = image["raw"]
    if image.get("url"):
        file_part["uri"] = image["url"]
    part: dict[str, Any] = {"kind": "file", "mediaType": image["mediaType"], "file": file_part}
    if image.get("filename"):
        part["filename"] = image["filename"]
    if image.get("raw"):
        part["raw"] = image["raw"]
        part["bytes"] = image["raw"]
    if image.get("url"):
        part["url"] = image["url"]
    return part


def _artifact_parts(store: dict[str, Any], task: dict[str, Any]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    if task.get("artifact"):
        schema = _output_schema(store, task)
        if not schema:
            parts.append({"kind": "text", "text": task["artifact"], "mediaType": "text/plain"})
        else:
            try:
                parts.append({"kind": "data", "data": loads(task["artifact"]), "mediaType": "application/json"})
            except Exception:
                parts.append({"kind": "text", "text": task["artifact"], "mediaType": "text/plain"})
    if task.get("artifactImage"):
        parts.append(_image_part(task["artifactImage"]))
    if task.get("artifactAudio"):
        parts.append(_image_part(task["artifactAudio"]))
    return parts


def _project_message(message: dict[str, Any], context_id: str, claimant_id: str | None) -> dict[str, Any]:
    from_human = message["kind"] in {"task.artifact", "task.progress", "task.reject", "task.fail", "task.input", "task.scoreRequest"} or (
        message["kind"] == "task.cancel" and message.get("fromId") == claimant_id
    )
    return {
        "messageId": message.get("a2aMessageId") or message["id"],
        "contextId": context_id,
        "taskId": message["taskId"],
        "role": "ROLE_AGENT" if from_human else "ROLE_USER",
        "parts": [{"kind": "text", "text": message["text"], "mediaType": "text/plain"}],
    }


def _status_message(store: dict[str, Any], task: dict[str, Any], context_id: str) -> dict[str, Any]:
    if task["status"] == "completed":
        return {}
    decision = next((item for item in reversed(store["messages"]) if item["taskId"] == task["id"] and item["kind"] in DECISION_KINDS), None)
    if task["status"] == "working":
        progress = task.get("progress")
        waiting = wire("working.poll")
        if isinstance(progress, str) and progress.strip():
            waiting = f"{progress.strip()}\n{waiting}"
    elif task["status"] == "submitted":
        waiting = wire("submitted.poll")
    elif decision and decision["kind"] == "task.scoreRequest":
        text = task.get("artifact") if isinstance(task.get("artifact"), str) else ""
        payload: dict[str, Any] = {
            "request": "score",
            "taskId": task["id"],
            "person": task.get("claimantName") or "",
            "artifact": text or artifact_reference(task),
        }
        image = task.get("artifactImage")
        if isinstance(image, dict):
            reference: dict[str, Any] = {
                "mediaType": image.get("mediaType") or "",
                "artifactId": f"{task['id']}:artifact",
            }
            if image.get("filename"):
                reference["filename"] = image["filename"]
            payload["image"] = reference
        waiting = dumps(payload)
    else:
        waiting = decision["text"] if decision else None
    if not waiting:
        return {}
    message_id = decision["id"] if decision and task["status"] not in {"working", "submitted"} else f"{task['id']}:awaiting-human"
    return {
        "message": {
            "messageId": message_id,
            "contextId": context_id,
            "taskId": task["id"],
            "role": "ROLE_AGENT",
            "parts": [{"kind": "text", "text": waiting, "mediaType": "text/plain"}],
        }
    }


def project_task(store: dict[str, Any], task: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    context_id = _task_context(task)
    related = [item for item in store["messages"] if item["taskId"] == task["id"]]
    body: dict[str, Any] = {
        "id": task["id"],
        "contextId": context_id,
        "status": {
            "state": STATES[task["status"]],
            "timestamp": task["updatedAt"],
            **_status_message(store, task, context_id),
        },
        "metadata": {
            "title": task["title"],
            "claimantName": task.get("claimantName"),
            "claimantId": task.get("claimantId"),
            **({"progress": task["progress"].strip()} if isinstance(task.get("progress"), str) and task["progress"].strip() else {}),
            **(
                {"score": task["workScore"], "scoredBy": task["posterName"], "person": task.get("claimantName")}
                if isinstance(task.get("workScore"), (int, float)) and not isinstance(task.get("workScore"), bool)
                else {}
            ),
            **({"scoreSkipped": True} if task.get("scoreSkipped") else {}),
            **({"senderId": task["senderId"]} if task.get("senderId") else {}),
        },
    }
    history_length = options.get("historyLength", None)
    if history_length != 0:
        history = related[-history_length:] if history_length is not None else related
        body["history"] = [_project_message(message, context_id, task.get("claimantId")) for message in history]
    if options.get("includeArtifacts", True) is not False:
        parts = _artifact_parts(store, task)
        body["artifacts"] = (
            [{"artifactId": f"{task['id']}:artifact", "name": wire("artifact.name"), "parts": parts}] if parts else []
        )
    return body


def _visible(task: dict[str, Any], scope: dict[str, Any]) -> bool:
    if scope["kind"] == "pool":
        return False
    if scope["kind"] == "dispatch":
        return task.get("source") == "dispatch"
    return task.get("claimantId") == scope["agentId"] or task.get("targetId") == scope["agentId"]


def _require_visible(store: dict[str, Any], scope: dict[str, Any], task_id: str) -> dict[str, Any]:
    task = next((item for item in store["tasks"] if item["id"] == task_id), None)
    if not task or not _visible(task, scope):
        raise DomainError(wire("task.missing"), -32001)
    return task


def _encode_data(data: object) -> str:
    if isinstance(data, str):
        return data
    try:
        return dumps(data)
    except (TypeError, ValueError) as error:
        raise DomainError(wire("data.json"), -32602) from error


def _read_parts(parts: object) -> dict[str, Any]:
    if not isinstance(parts, list) or not parts:
        raise DomainError(wire("parts.required"), -32602)
    chunks: list[str] = []
    images: list[dict[str, Any]] = []
    audios: list[dict[str, Any]] = []
    for part in parts:
        if isinstance(part, str):
            chunks.append(part)
            continue
        if not isinstance(part, dict):
            raise DomainError(wire("part.bad"), -32602)
        media = part.get("mediaType", part.get("media_type"))
        file_part = part.get("file") if isinstance(part.get("file"), dict) else None
        if file_part and not isinstance(media, str):
            nested = file_part.get("mediaType", file_part.get("mimeType"))
            media = nested if isinstance(nested, str) else media
        if isinstance(media, str) and media.startswith("image/"):
            source = dict(part)
            source["mediaType"] = media
            if file_part:
                if not isinstance(source.get("raw"), str) and isinstance(file_part.get("bytes"), str):
                    source["raw"] = file_part["bytes"]
                if not isinstance(source.get("url"), str) and isinstance(file_part.get("uri"), str):
                    source["url"] = file_part["uri"]
                if not source.get("filename") and isinstance(file_part.get("name"), str):
                    source["filename"] = file_part["name"]
            if not isinstance(source.get("raw"), str) and isinstance(part.get("bytes"), str):
                source["raw"] = part["bytes"]
            read = read_image(source)
            if "error" in read:
                raise DomainError(read["error"], -32602)
            images.append(read["image"])
            continue
        if isinstance(media, str) and media.startswith("audio/"):
            source = dict(part)
            source["mediaType"] = media
            if file_part:
                if not isinstance(source.get("raw"), str) and isinstance(file_part.get("bytes"), str):
                    source["raw"] = file_part["bytes"]
                if not isinstance(source.get("url"), str) and isinstance(file_part.get("uri"), str):
                    source["url"] = file_part["uri"]
                if not source.get("filename") and isinstance(file_part.get("name"), str):
                    source["filename"] = file_part["name"]
            if not isinstance(source.get("raw"), str) and isinstance(part.get("bytes"), str):
                source["raw"] = part["bytes"]
            heard = read_audio(source)
            if "error" in heard:
                raise DomainError(heard["error"], -32602)
            audios.append(heard["audio"])
            continue
        if "raw" in part or "url" in part or "file" in part or "bytes" in part:
            raise DomainError(wire("part.kind"), -32005)
        if "data" in part and part.get("data") is not None:
            if isinstance(media, str) and media not in {"application/json", "*/*"}:
                raise DomainError(wire("media.unsupported", {"media": media}), -32005)
            encoded = _encode_data(part["data"])
            if encoded.strip():
                chunks.append(encoded)
            continue
        if isinstance(media, str) and media not in {"text/plain", "text/*", "*/*", "application/json"}:
            raise DomainError(wire("media.unsupported", {"media": media}), -32005)
        if isinstance(part.get("text"), str):
            chunks.append(part["text"])
    text = "\n".join(chunks).strip()
    if not text and not images and not audios:
        raise DomainError(wire("parts.required"), -32602)
    if len(images) > 4:
        raise DomainError(wire("images.max"), -32602)
    if len(audios) > 4:
        raise DomainError(wire("audios.max"), -32602)
    return {"text": text, "images": images, "audios": audios}


def _metadata_value(params: dict[str, Any], message: dict[str, Any], key: str) -> object:
    for source in (params.get("metadata"), message.get("metadata")):
        if isinstance(source, dict) and key in source:
            return source[key]
    return None


def _read_skill(params: dict[str, Any], message: dict[str, Any]) -> str | None:
    value = _metadata_value(params, message, "skill")
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise DomainError(wire("skill.type"), -32602)
    return value.strip()


def _read_agent_id(params: dict[str, Any], message: dict[str, Any]) -> str | None:
    value = _metadata_value(params, message, "agentId")
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise DomainError(wire("dispatch.agent"), -32602)
    return value.strip()


VISITOR_ID = re.compile(r"^visitor-[a-z0-9-]{8,64}$")


def _resolve_sender(store: dict[str, Any], params: dict[str, Any], message: dict[str, Any]) -> tuple[str | None, str]:
    raw_id = _metadata_value(params, message, "senderId")
    if isinstance(raw_id, str) and raw_id.strip():
        agent = next((item for item in store["agents"] if item["id"] == raw_id.strip() and item.get("human")), None)
        if agent:
            return agent["id"], agent["name"]
        # A browser that has not published a card still keeps one id, so it can score what it sent.
        if VISITOR_ID.match(raw_id.strip()):
            name = _caller_name(params, message)
            return raw_id.strip(), wire("caller.visitor") if name == wire("caller.name") else name
    name = _caller_name(params, message)
    if name != wire("caller.name"):
        matches = [item for item in store["agents"] if item.get("human") and item.get("name") == name]
        if len(matches) == 1:
            return matches[0]["id"], matches[0]["name"]
    return None, name


def _caller_name(params: dict[str, Any], message: dict[str, Any]) -> str:
    name = _metadata_value(params, message, "caller")
    if not isinstance(name, str):
        return wire("caller.name")
    trimmed = name.strip()
    if 1 <= len(trimmed) <= 24:
        return trimmed
    return wire("caller.name")


def _history_length(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 100:
        raise DomainError(wire("history.invalid"), -32602)
    return value


def _configuration(params: dict[str, Any]) -> dict[str, Any]:
    config = params.get("configuration")
    if config is None:
        return {}
    if not isinstance(config, dict):
        raise DomainError(wire("config.object"), -32602)
    return config


def _wants_immediate(config: dict[str, Any]) -> bool:
    return config.get("returnImmediately") is True or config.get("return_immediately") is True


def _assert_sendable(config: dict[str, Any]) -> None:
    if config.get("taskPushNotificationConfig") is not None or config.get("task_push_notification_config") is not None:
        raise DomainError(wire("push.unsupported"), -32003)
    modes = config.get("acceptedOutputModes", config.get("accepted_output_modes"))
    if modes is None:
        return
    if not isinstance(modes, list) or any(not isinstance(mode, str) for mode in modes):
        raise DomainError(wire("modes.type"), -32602)
    supported = any(
        mode in {"text/plain", "text/*", "*/*", "application/json", "image/*", "audio/*"}
        or mode.startswith("image/")
        or mode.startswith("audio/")
        for mode in modes
    )
    if not supported:
        raise DomainError(wire("modes.kind"), -32005)


def _read_context_id(record: dict[str, Any]) -> str | None:
    value = record["contextId"] if "contextId" in record else record.get("context_id")
    if value is None:
        return None
    if not isinstance(value, str):
        raise DomainError(wire("context.type"), -32602)
    trimmed = value.strip()
    if len(trimmed) < 1 or len(trimmed) > 128:
        raise DomainError(wire("context.invalid"), -32602)
    return trimmed


def _read_message_id(record: dict[str, Any]) -> str:
    value = record["messageId"] if "messageId" in record else record.get("message_id")
    if not isinstance(value, str) or not value.strip():
        raise DomainError(wire("message.missing"), -32602)
    return value.strip()


def _read_task_id(record: dict[str, Any]) -> str | None:
    value = record["taskId"] if "taskId" in record else record.get("task_id")
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _task_id_from(params: dict[str, Any]) -> str | None:
    if isinstance(params.get("id"), str) and params["id"].strip():
        return params["id"].strip()
    if isinstance(params.get("taskId"), str) and params["taskId"].strip():
        return params["taskId"].strip()
    if isinstance(params.get("name"), str):
        name = params["name"].strip()
        if name.startswith("tasks/") and len(name) > len("tasks/"):
            return name[len("tasks/") :]
    return None


def _send_message(store: dict[str, Any], scope: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    message = params.get("message")
    if not isinstance(message, dict):
        raise DomainError(wire("message.params"), -32602)
    if message.get("role") not in {"ROLE_USER", "user"}:
        raise DomainError(wire("role.user"), -32602)
    message_id = _read_message_id(message)
    parts = _read_parts(message.get("parts"))
    task_id = _read_task_id(message)
    context_id = _read_context_id(message)
    skill = _read_skill(params, message)
    config = _configuration(params)
    _assert_sendable(config)
    replay = command_for_message(store, message_id)
    if not replay and not _wants_immediate(config):
        raise DomainError(wire("returnImmediately"), -32004)
    sender_id, caller_name = _resolve_sender(store, params, message)
    source = "direct"
    human_id = scope["agentId"] if scope["kind"] == "human" else ""
    if not replay and scope["kind"] == "pool":
        raise DomainError(wire("directory.assign"), -32004)
    if not replay and scope["kind"] == "dispatch":
        if task_id:
            existing = next((item for item in store["tasks"] if item["id"] == task_id), None)
            human_id = (existing or {}).get("claimantId") or (existing or {}).get("targetId") or ""
        else:
            human_id = route_dispatch(store, skill, caller_name, _read_agent_id(params, message))["id"]
        source = "dispatch"
    if not replay and scope["kind"] == "human":
        human = next((agent for agent in store["agents"] if agent["id"] == scope["agentId"]), None)
        if skill and human and not any(item["name"] == skill for item in human["skills"]):
            raise DomainError(wire("skill.missing"), -32602)
    task = receive_command(store, {
        "humanId": human_id,
        "text": parts["text"],
        "images": parts["images"],
        "audios": parts.get("audios") or [],
        "messageId": message_id,
        "taskId": task_id,
        "contextId": context_id,
        "skill": skill,
        "callerName": caller_name,
        "senderId": sender_id,
        "source": source,
    })
    return {"task": project_task(store, task, {"historyLength": _history_length(config.get("historyLength", config.get("history_length"))), "includeArtifacts": True})}


def _get_task(store: dict[str, Any], scope: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    task_id = _task_id_from(params)
    if not task_id:
        raise DomainError(wire("task.id"), -32602)
    task = _require_visible(store, scope, task_id)
    return project_task(store, task, {"historyLength": _history_length(params.get("historyLength")), "includeArtifacts": True})


def _list_tasks(store: dict[str, Any], scope: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    page_size = 50
    if params.get("pageSize") is not None:
        page_size_value = params["pageSize"]
        if isinstance(page_size_value, bool) or not isinstance(page_size_value, int) or page_size_value < 1 or page_size_value > 100:
            raise DomainError(wire("page.size"), -32602)
        page_size = page_size_value
    offset = 0
    if params.get("pageToken") not in (None, ""):
        token = params["pageToken"]
        if not isinstance(token, str) or not token.isdigit():
            raise DomainError(wire("page.token"), -32602)
        offset = int(token)
    tasks = [task for task in store["tasks"] if _visible(task, scope)]
    if isinstance(params.get("contextId"), str) and params["contextId"]:
        tasks = [task for task in tasks if _task_context(task) == params["contextId"]]
    if params.get("status") is not None:
        if not isinstance(params["status"], str) or params["status"] not in STATE_NAMES:
            raise DomainError(wire("protocolStatus.unknown"), -32602)
        status = STATE_NAMES[params["status"]]
        tasks = [task for task in tasks if task["status"] == status]
    slice_ = tasks[offset : offset + page_size]
    nxt = str(offset + len(slice_)) if offset + len(slice_) < len(tasks) else ""
    length = _history_length(params.get("historyLength"))
    include_artifacts = params.get("includeArtifacts") is True
    return {
        "tasks": [project_task(store, task, {"historyLength": length, "includeArtifacts": include_artifacts}) for task in slice_],
        "totalSize": len(tasks),
        "pageSize": page_size,
        "nextPageToken": nxt,
    }


def _cancel_task(store: dict[str, Any], scope: dict[str, Any], params: dict[str, Any]) -> dict[str, Any]:
    task_id = _task_id_from(params)
    if not task_id:
        raise DomainError(wire("task.id"), -32602)
    _require_visible(store, scope, task_id)
    task = cancel_commanded_task(store, task_id)
    return project_task(store, task, {"includeArtifacts": True})


def dispatch_a2a(store: dict[str, Any], scope: dict[str, Any], body: object, options: dict[str, Any] | None = None) -> dict[str, Any]:
    if not isinstance(body, dict):
        return rpc_error(None, -32600, wire("rpc.not"))
    rpc_id = _as_id(body["id"]) if "id" in body else None
    if rpc_id is _MISSING or body.get("jsonrpc") != "2.0" or not isinstance(body.get("method"), str):
        return rpc_error(None if rpc_id is _MISSING else rpc_id, -32600, wire("rpc.version"))
    version = (options or {}).get("a2aVersion")
    if isinstance(version, str):
        version = version.strip()
    if version and version not in SUPPORTED_VERSIONS:
        return rpc_error(rpc_id, -32009, wire("version.unsupported", {"version": version}))
    method = body["method"]
    if method in {"SendStreamingMessage", "message/stream", "SubscribeToTask", "tasks/subscribe"}:
        return rpc_error(rpc_id, -32004, wire("stream.unsupported"))
    if method in {"GetExtendedAgentCard", "agent/getAuthenticatedExtendedCard"}:
        return rpc_error(rpc_id, -32004, wire("card.extended"))
    if method in PUSH_METHODS:
        return rpc_error(rpc_id, -32003, wire("push.unsupported"))
    params = body.get("params")
    if params is not None and not isinstance(params, dict):
        return rpc_error(rpc_id, -32602, wire("params.object"))
    record = params or {}
    expire_scores(store)
    try:
        if method in {"SendMessage", "message/send"}:
            return _ok(rpc_id, _send_message(store, scope, record))
        if method in {"GetTask", "tasks/get"}:
            return _ok(rpc_id, _get_task(store, scope, record))
        if method in {"ListTasks", "tasks/list"}:
            return _ok(rpc_id, _list_tasks(store, scope, record))
        if method in {"CancelTask", "tasks/cancel"}:
            return _ok(rpc_id, _cancel_task(store, scope, record))
        return rpc_error(rpc_id, -32601, wire("method.unknown", {"method": method}))
    except DomainError as error:
        code = error.code if error.code is not None else (-32001 if str(error) == wire("task.missing") else -32602)
        return rpc_error(rpc_id, code, str(error))
