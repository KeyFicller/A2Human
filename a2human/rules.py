"""The market: publish a card, go on duty, receive work, hand it back, get a score.

A score is optional. If the sending model does not answer within 60 seconds,
the score request is dropped and the task is still delivered.
"""

from __future__ import annotations

import locale
import math
import unicodedata
import uuid
from typing import Any

from a2human.clock import now_iso, now_ms, parse_ms
from a2human.copy import wire
from a2human.hooks import remember
from a2human.skill_catalog import reserved_custom_name
from a2human.audio import read_audio
from a2human.images import read_image
from a2human.jsonutil import dumps, loads
from a2human.schema_fields import canonical_output

CALLER_ID = "agent_a2a"
COMMAND_TEXT_MAX = 4000
SCHEMA_MAX = 2000
SCORE_WAIT_MS = 60_000
TITLE_LIMIT = 32
DESCRIPTION_LIMIT = 320
PLAY_MODES = {"timed_draw", "paper", "roll", "wetware", "book", "human_check", "open_mic"}

DECISIONS = {
    "reject": {"status": "rejected", "kind": "task.reject"},
    "cancel": {"status": "canceled", "kind": "task.cancel"},
    "fail": {"status": "failed", "kind": "task.fail"},
    "input": {"status": "input-required", "kind": "task.input"},
}
SCORE_DECISIONS = {"task.input", "task.scoreRequest", "task.reject", "task.fail", "task.cancel"}
OPEN_STATUSES = {"submitted", "working", "input-required"}

_locale_ready: bool | None = None


class DomainError(Exception):
    def __init__(self, message: str, code: int | None = None):
        super().__init__(message)
        self.code = code


def fail(message: str, code: int | None = None):
    raise DomainError(message, code)


def create_seed() -> dict[str, Any]:
    return {"agents": [], "tasks": [], "messages": []}


def _zh_sort_ready() -> bool:
    global _locale_ready
    if _locale_ready is None:
        try:
            locale.setlocale(locale.LC_COLLATE, "zh_CN.UTF-8")
            _locale_ready = True
        except locale.Error:
            _locale_ready = False
    return _locale_ready


def _name_key(agent: dict[str, Any]) -> tuple[str, str]:
    name = agent["name"]
    if _zh_sort_ready():
        name = locale.strxfrm(name)
    return (name, agent["id"])


def text_len(value: str) -> int:
    return len(value)


def _require_agent(store: dict[str, Any], agent_id: str) -> dict[str, Any]:
    agent = next((item for item in store["agents"] if item["id"] == agent_id), None)
    if not agent:
        fail(wire("agent.missing"))
    return agent


def _require_task(store: dict[str, Any], task_id: str) -> dict[str, Any]:
    task = next((item for item in store["tasks"] if item["id"] == task_id), None)
    if not task:
        fail(wire("task.missing"))
    return task


def _add_message(store: dict[str, Any], message: dict[str, Any]) -> None:
    store["messages"].append({**message, "id": str(uuid.uuid4()), "createdAt": now_iso()})


def _clean_name(name: object) -> str:
    if not isinstance(name, str):
        fail(wire("name.required"))
    trimmed = name.strip()
    length = text_len(trimmed)
    if length < 2 or length > 16:
        fail(wire("name.length"))
    return trimmed


def _clean_bio(bio: object) -> str:
    if not isinstance(bio, str):
        fail(wire("bio.required"))
    trimmed = bio.strip()
    if not trimmed or trimmed == wire("bio.default"):
        fail(wire("bio.required"))
    if text_len(trimmed) > 80:
        fail(wire("bio.length"))
    return trimmed


def _clean_play(value: object) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if trimmed not in PLAY_MODES:
        return None
    return trimmed


def _clean_schema(value: object, label: str) -> dict[str, Any] | None:
    if value is None or value == "":
        return None
    parsed = value
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return None
        try:
            parsed = loads(trimmed)
        except Exception:
            fail(wire("schema.json", {"label": label}))
    if not isinstance(parsed, dict):
        fail(wire("schema.object", {"label": label}))
    try:
        encoded = dumps(parsed)
    except (TypeError, ValueError):
        fail(wire("schema.json", {"label": label}))
    if text_len(encoded) > SCHEMA_MAX:
        fail(wire("schema.length", {"label": label, "max": SCHEMA_MAX}))
    return loads(encoded)


def _clean_title(value: object) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        fail(wire("skill.title"))
    trimmed = value.strip()
    if not trimmed:
        return None
    if text_len(trimmed) > 32:
        fail(wire("skill.title"))
    return trimmed


def _clean_skills(skills: object) -> list[dict[str, Any]]:
    if not isinstance(skills, list) or len(skills) < 1:
        fail(wire("skills.min"))
    if len(skills) > 6:
        fail(wire("skills.max"))
    seen: set[str] = set()
    cleaned: list[dict[str, Any]] = []
    for item in skills:
        if not isinstance(item, dict):
            fail(wire("skill.shape"))
        if not isinstance(item.get("name"), str) or not isinstance(item.get("description"), str):
            fail(wire("skill.shape"))
        name = item["name"].strip()
        description = item["description"].strip()
        title = _clean_title(item.get("title"))
        if text_len(name) < 1 or text_len(name) > 24:
            fail(wire("skill.name"))
        if reserved_custom_name(name):
            fail(wire("skill.reserved"))
        if text_len(description) < 1 or text_len(description) > DESCRIPTION_LIMIT:
            fail(wire("skill.description"))
        if name in seen:
            fail(wire("skill.duplicate"))
        seen.add(name)
        input_schema = _clean_schema(item.get("inputSchema"), wire("schema.input"))
        output_schema = _clean_schema(item.get("outputSchema"), wire("schema.output"))
        if bool(input_schema) != bool(output_schema):
            fail(wire("schema.pair"))
        entry: dict[str, Any] = {"name": name, "description": description}
        if title:
            entry["title"] = title
        play = _clean_play(item.get("play"))
        if play:
            entry["play"] = play
        if input_schema and output_schema:
            entry["inputSchema"] = input_schema
            entry["outputSchema"] = output_schema
        cleaned.append(entry)
    return cleaned


def publish_agent(store: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    agent = {
        "id": str(uuid.uuid4()),
        "name": _clean_name(payload.get("name")),
        "bio": _clean_bio(payload.get("bio")),
        "human": True,
        "available": False,
        "skills": _clean_skills(payload.get("skills")),
        "createdAt": now_iso(),
    }
    store["agents"].append(agent)
    remember(store)
    return agent


def update_agent(store: dict[str, Any], agent_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    agent = _require_agent(store, agent_id)
    if not agent["human"]:
        fail(wire("card.locked"))
    agent["name"] = _clean_name(payload.get("name"))
    agent["bio"] = _clean_bio(payload.get("bio"))
    agent["skills"] = _clean_skills(payload.get("skills"))
    if len(agent["skills"]) < 1:
        agent["available"] = False
    remember(store)
    return agent


def set_availability(store: dict[str, Any], agent_id: str, available: object) -> dict[str, Any]:
    agent = _require_agent(store, agent_id)
    if not agent["human"]:
        fail(wire("duty.notHuman"))
    if not isinstance(available, bool):
        fail(wire("duty.type"))
    if available and len(agent["skills"]) < 1:
        fail(wire("duty.needsSkill"))
    agent["available"] = available
    remember(store)
    return agent


def _round_tenths(value: float) -> int | float:
    tenths = math.floor(value * 10 + 0.5)
    if tenths % 10 == 0:
        return tenths // 10
    return tenths / 10


def _delivered_task(task: dict[str, Any]) -> bool:
    """Work the person already handed back, including the scoring window."""
    if task.get("status") == "completed":
        return True
    if task.get("status") != "input-required":
        return False
    if isinstance(task.get("artifact"), str) and task["artifact"].strip():
        return True
    return isinstance(task.get("artifactImage"), dict) or isinstance(task.get("artifactAudio"), dict)


def work_record(tasks: list[dict[str, Any]], agent_id: str) -> dict[str, Any]:
    done = [task for task in tasks if task.get("claimantId") == agent_id and _delivered_task(task)]
    scores = [task["workScore"] for task in done if isinstance(task.get("workScore"), (int, float)) and not isinstance(task.get("workScore"), bool)]
    average_score = _round_tenths(sum(scores) / len(scores)) if scores else None
    durations: list[float] = []
    for task in done:
        try:
            start = parse_ms(task["createdAt"])
            end = parse_ms(task["updatedAt"])
        except (ValueError, TypeError):
            durations.append(0)
            continue
        if not math.isfinite(start) or not math.isfinite(end):
            durations.append(0)
        else:
            durations.append(max(0, (end - start) / 1000))
    average_duration = int(math.floor(sum(durations) / len(durations) + 0.5)) if durations else None
    return {"completed": len(done), "averageScore": average_score, "averageDuration": average_duration}


def present_agent(store: dict[str, Any], agent: dict[str, Any]) -> dict[str, Any]:
    return {**agent, **work_record(store["tasks"], agent["id"])}


def on_duty(agents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    people = [agent for agent in agents if agent.get("human") and agent.get("available") and agent.get("skills")]
    return sorted(people, key=_name_key)


def _output_skill(store: dict[str, Any], task: dict[str, Any]) -> dict[str, Any] | None:
    agent = next((item for item in store["agents"] if item["id"] == task.get("claimantId")), None)
    if not agent:
        return None
    named = task["skills"][0] if len(task.get("skills") or []) == 1 else None
    if named:
        return next((skill for skill in agent["skills"] if skill["name"] == named), None)
    if len(agent["skills"]) == 1:
        return agent["skills"][0]
    return None


def _awaiting_score(store: dict[str, Any], task: dict[str, Any]) -> bool:
    if task.get("status") != "input-required":
        return False
    decision = next((item for item in reversed(store["messages"]) if item["taskId"] == task["id"] and item["kind"] in SCORE_DECISIONS), None)
    return bool(decision and decision["kind"] == "task.scoreRequest")


def submit_artifact(store: dict[str, Any], task_id: str, agent_id: str, text: object, image: object = None, audio: object = None) -> dict[str, Any]:
    task = _require_task(store, task_id)
    agent = _require_agent(store, agent_id)
    answering = task["status"] in {"working", "input-required"}
    if not answering or task.get("claimantId") != agent["id"]:
        fail(wire("artifact.owner"))
    if _awaiting_score(store, task):
        fail(wire("artifact.waiting"))
    if text is not None and not isinstance(text, str):
        fail(wire("artifact.type"))
    artifact = text.strip() if isinstance(text, str) else ""
    if artifact and text_len(artifact) > 4000:
        fail(wire("artifact.length"))
    picture = None
    if image is not None and image != "":
        read = read_image(image)
        if "error" in read:
            fail(read["error"])
        picture = read["image"]
    recording = None
    if audio is not None and audio != "":
        heard = read_audio(audio)
        if "error" in heard:
            fail(heard["error"])
        recording = heard["audio"]
    output_schema = (_output_skill(store, task) or {}).get("outputSchema")
    stored = artifact
    if output_schema:
        try:
            stored = canonical_output(output_schema, artifact, bool(picture), bool(recording))
        except Exception as error:
            message = str(error) or wire("output.bad")
            fail(message)
    if stored and text_len(stored) > 4000:
        fail(wire("artifact.length"))
    if not picture and not recording and text_len(stored) < 1:
        fail(wire("artifact.length"))
    task["artifact"] = stored or None
    task["artifactImage"] = picture
    task["artifactAudio"] = recording
    task["status"] = "input-required"
    task["updatedAt"] = now_iso()
    _add_message(store, {
        "taskId": task["id"],
        "fromId": agent["id"],
        "fromName": agent["name"],
        "kind": "task.artifact",
        "text": stored or _media_note(picture, recording),
    })
    _add_message(store, {
        "taskId": task["id"],
        "fromId": agent["id"],
        "fromName": agent["name"],
        "kind": "task.scoreRequest",
        "text": wire("score.ask", {"name": task["posterName"]}),
    })
    remember(store)
    return task


def ensure_caller(store: dict[str, Any]) -> dict[str, Any]:
    existing = next((item for item in store["agents"] if item["id"] == CALLER_ID), None)
    if existing:
        return existing
    caller = {
        "id": CALLER_ID,
        "name": wire("caller.name"),
        "bio": wire("caller.bio"),
        "human": False,
        "available": False,
        "skills": [],
        "createdAt": now_iso(),
    }
    store["agents"].append(caller)
    return caller


def _find_command_task(store: dict[str, Any], message_id: str) -> dict[str, Any] | None:
    created = next((item for item in store["tasks"] if item.get("a2aMessageId") == message_id), None)
    if created:
        return created
    noted = next((item for item in store["messages"] if item.get("a2aMessageId") == message_id), None)
    if not noted:
        return None
    return next((item for item in store["tasks"] if item["id"] == noted["taskId"]), None)


def command_for_message(store: dict[str, Any], message_id: str) -> dict[str, Any] | None:
    return _find_command_task(store, message_id)


def _graphemes(value: str) -> list[str]:
    chars: list[str] = []
    for char in value:
        if chars and unicodedata.combining(char):
            chars[-1] += char
        else:
            chars.append(char)
    return chars


def _command_title(text: str) -> str:
    flat = " ".join(text.split()).strip()
    chars = _graphemes(flat)
    if len(chars) < 4:
        return wire("task.defaultTitle")
    if len(chars) <= TITLE_LIMIT:
        return "".join(chars)
    return "".join(chars[: TITLE_LIMIT - 1]) + "…"


def _media_note(picture: dict[str, Any] | None, recording: dict[str, Any] | None) -> str:
    if picture:
        return wire("artifact.imageNamed", {"name": picture["filename"]}) if picture.get("filename") else wire("artifact.imagePlain")
    if recording:
        return wire("artifact.audioNamed", {"name": recording["filename"]}) if recording.get("filename") else wire("artifact.audioPlain")
    return wire("artifact.imagePlain")


def artifact_reference(task: dict[str, Any]) -> str:
    """Text the score request can point at, including an image-only delivery."""
    text = task.get("artifact") if isinstance(task.get("artifact"), str) else ""
    if text:
        return text
    image = task.get("artifactImage")
    audio = task.get("artifactAudio")
    file = image if isinstance(image, dict) else audio if isinstance(audio, dict) else None
    if not isinstance(file, dict):
        return ""
    media = file.get("mediaType") if isinstance(file.get("mediaType"), str) else "file"
    name = file.get("filename") if isinstance(file.get("filename"), str) else ""
    return f"{media} {name}".strip()


def _require_work_score(text: str) -> int:
    try:
        data = loads(text)
    except Exception:
        fail(wire("score.format"), -32602)
    if not isinstance(data, dict):
        fail(wire("score.format"), -32602)
    if len(data) != 1 or "score" not in data:
        fail(wire("score.format"), -32602)
    score = data["score"]
    if isinstance(score, bool) or not isinstance(score, int) or score < 1 or score > 5:
        fail(wire("score.range"), -32602)
    return score


def _task_open(status: str) -> bool:
    return status in OPEN_STATUSES


def receive_command(store: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    replay = _find_command_task(store, payload["messageId"])
    if replay:
        remember(store)
        return replay
    text = str(payload.get("text") or "").strip()
    images = list(payload.get("images") or [])
    audios = list(payload.get("audios") or [])
    if text_len(text) > COMMAND_TEXT_MAX:
        fail(wire("command.length", {"max": COMMAND_TEXT_MAX}))
    if text_len(text) < 1 and not images and not audios:
        fail(wire("command.length", {"max": COMMAND_TEXT_MAX}))
    if len(images) > 4:
        fail(wire("images.max"), -32602)
    if len(audios) > 4:
        fail(wire("audios.max"), -32602)

    if payload.get("taskId"):
        task = next((item for item in store["tasks"] if item["id"] == payload["taskId"]), None)
        if not task:
            fail(wire("task.missing"), -32001)
        mine = task.get("targetId") == payload["humanId"] or task.get("claimantId") == payload["humanId"]
        if not mine:
            fail(wire("task.missing"), -32001)
        _expire_score(store, task, payload.get("nowMs"))
        if not _task_open(task["status"]):
            fail(wire("task.closedMessage"), -32004)
        actual_context = task.get("contextId") or task["id"]
        if payload.get("contextId") and payload["contextId"] != actual_context:
            fail(wire("context.mismatch"), -32602)
        caller = ensure_caller(store)
        if _awaiting_score(store, task):
            if images:
                fail(wire("score.noImage"), -32602)
            score = _require_work_score(text)
            task["workScore"] = score
            _add_message(store, {
                "taskId": task["id"],
                "fromId": caller["id"],
                "fromName": payload["callerName"],
                "kind": "task.score",
                "text": wire("score.line", {
                    "caller": payload["callerName"],
                    "person": task.get("claimantName") or wire("person.fallback"),
                    "score": score,
                }),
                "a2aMessageId": payload["messageId"],
            })
            _add_message(store, {
                "taskId": task["id"],
                "fromId": task["posterId"],
                "fromName": task["posterName"],
                "kind": "task.complete",
                "text": wire("artifact.done"),
            })
            task.pop("scoreSkipped", None)
            task["status"] = "completed"
            task["updatedAt"] = now_iso()
            remember(store)
            return task
        if images:
            next_images = [*(task.get("images") or []), *images]
            if len(next_images) > 4:
                fail(wire("images.max"), -32602)
            task["images"] = next_images
        if audios:
            next_audios = [*(task.get("audios") or []), *audios]
            if len(next_audios) > 4:
                fail(wire("audios.max"), -32602)
            task["audios"] = next_audios
        _add_message(store, {
            "taskId": task["id"],
            "fromId": caller["id"],
            "fromName": payload["callerName"],
            "kind": "task.note",
            "text": text or wire("note.image"),
            "a2aMessageId": payload["messageId"],
        })
        task["status"] = "working"
        task["updatedAt"] = now_iso()
        remember(store)
        return task

    human = _require_agent(store, payload["humanId"])
    if not human["human"]:
        fail(wire("human.only"), -32004)
    if not human["available"]:
        fail(wire("duty.off"), -32004)
    skill = payload.get("skill")
    if skill and not any(item["name"] == skill for item in human["skills"]):
        fail(wire("skill.missing"), -32602)
    caller = ensure_caller(store)
    created_at = now_iso()
    names = [image.get("filename") or wire("image.word") for image in images]
    names.extend(item.get("filename") or wire("audio.word") for item in audios)
    brief = text or wire("list.sep").join(names)
    task = {
        "id": str(uuid.uuid4()),
        "title": _command_title(brief),
        "brief": brief,
        **({"images": images} if images else {}),
        **({"audios": audios} if audios else {}),
        "posterId": caller["id"],
        "posterName": payload["callerName"],
        "skills": [skill] if skill else [],
        "status": "working",
        "claimantId": human["id"],
        "claimantName": human["name"],
        "artifact": None,
        "createdAt": created_at,
        "updatedAt": created_at,
        "contextId": payload.get("contextId") or str(uuid.uuid4()),
        "a2aMessageId": payload["messageId"],
        "source": payload["source"] if payload.get("source") in {"direct", "dispatch"} else "direct",
        "targetId": human["id"],
        **({"senderId": payload["senderId"]} if isinstance(payload.get("senderId"), str) and payload["senderId"].strip() else {}),
    }
    store["tasks"].insert(0, task)
    _add_message(store, {
        "taskId": task["id"],
        "fromId": caller["id"],
        "fromName": payload["callerName"],
        "kind": "task.submit",
        "text": text or wire("note.attached"),
        "a2aMessageId": payload["messageId"],
    })
    remember(store)
    return task


def decide_task(store: dict[str, Any], task_id: str, agent_id: str, action: object, text: object) -> dict[str, Any]:
    task = _require_task(store, task_id)
    agent = _require_agent(store, agent_id)
    if task.get("claimantId") != agent["id"]:
        fail(wire("status.owner"))
    if not _task_open(task["status"]):
        fail(wire("task.finished"))
    if not isinstance(action, str) or action not in DECISIONS:
        fail(wire("action.unknown"))
    if _awaiting_score(store, task) and action != "cancel":
        fail(wire("artifact.waiting"))
    decision = DECISIONS[action]
    reason = text.strip() if isinstance(text, str) else ""
    if text_len(reason) < 1 or text_len(reason) > 200:
        fail(wire("reason.length"))
    task["status"] = decision["status"]
    task["updatedAt"] = now_iso()
    _add_message(store, {
        "taskId": task["id"],
        "fromId": agent["id"],
        "fromName": agent["name"],
        "kind": decision["kind"],
        "text": reason,
    })
    remember(store)
    return task


def _expire_score(store: dict[str, Any], task: dict[str, Any], at: int | None = None) -> bool:
    if not _awaiting_score(store, task):
        return False
    request = next((item for item in reversed(store["messages"]) if item["taskId"] == task["id"] and item["kind"] == "task.scoreRequest"), None)
    if not request:
        return False
    try:
        asked = parse_ms(request["createdAt"])
    except (ValueError, TypeError):
        return False
    moment = now_ms() if at is None else int(at)
    if not math.isfinite(asked) or moment - asked < SCORE_WAIT_MS:
        return False
    _add_message(store, {
        "taskId": task["id"],
        "fromId": task["posterId"],
        "fromName": task["posterName"],
        "kind": "task.complete",
        "text": wire("score.expired"),
    })
    task["scoreSkipped"] = True
    task["status"] = "completed"
    task["updatedAt"] = now_iso(moment)
    return True


def expire_scores(store: dict[str, Any], at: int | None = None) -> bool:
    changed = False
    for task in list(store["tasks"]):
        if _expire_score(store, task, at):
            changed = True
    remember(store)
    return changed


def cancel_commanded_task(store: dict[str, Any], task_id: str) -> dict[str, Any]:
    task = _require_task(store, task_id)
    if task.get("posterId") != CALLER_ID:
        fail(wire("cancel.protocol"), -32002)
    if not _task_open(task["status"]):
        fail(wire("cancel.closed"), -32002)
    caller = ensure_caller(store)
    task["status"] = "canceled"
    task["updatedAt"] = now_iso()
    _add_message(store, {
        "taskId": task["id"],
        "fromId": caller["id"],
        "fromName": task["posterName"],
        "kind": "task.cancel",
        "text": wire("cancel.caller"),
    })
    remember(store)
    return task


PROGRESS_MAX = 80


def set_progress(store: dict[str, Any], task_id: str, agent_id: str, text: object) -> dict[str, Any]:
    """Replace the optional one-line status the person on duty is showing, or clear it."""
    task = _require_task(store, task_id)
    agent = _require_agent(store, agent_id)
    if task.get("claimantId") != agent["id"]:
        fail(wire("status.owner"))
    if task.get("status") != "working":
        fail(wire("progress.closed"))
    if text is None:
        text = ""
    if not isinstance(text, str):
        fail(wire("progress.type"))
    line = " ".join(text.split())
    if text_len(line) > PROGRESS_MAX:
        fail(wire("progress.length", {"max": PROGRESS_MAX}))
    if line:
        task["progress"] = line
        _add_message(store, {
            "taskId": task["id"],
            "fromId": agent["id"],
            "fromName": agent["name"],
            "kind": "task.progress",
            "text": line,
        })
    else:
        task.pop("progress", None)
    task["updatedAt"] = now_iso()
    remember(store)
    return task


def _require_score_window(store: dict[str, Any], task_id: str, agent_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    task = _require_task(store, task_id)
    agent = _require_agent(store, agent_id)
    if task.get("claimantId") == agent["id"]:
        fail(wire("score.own"))
    if not _awaiting_score(store, task):
        fail(wire("mcp.scoreNotReady"))
    return task, agent


def score_task(store: dict[str, Any], task_id: str, agent_id: str, score: object) -> dict[str, Any]:
    task, agent = _require_score_window(store, task_id, agent_id)
    if isinstance(score, bool) or not isinstance(score, int) or score < 1 or score > 5:
        fail(wire("score.range"))
    task["workScore"] = score
    task.pop("scoreSkipped", None)
    _add_message(store, {
        "taskId": task["id"],
        "fromId": agent["id"],
        "fromName": agent["name"],
        "kind": "task.score",
        "text": wire("score.line", {
            "caller": agent["name"],
            "person": task.get("claimantName") or wire("person.fallback"),
            "score": score,
        }),
    })
    _add_message(store, {
        "taskId": task["id"],
        "fromId": task["posterId"],
        "fromName": task["posterName"],
        "kind": "task.complete",
        "text": wire("artifact.done"),
    })
    task["status"] = "completed"
    task["updatedAt"] = now_iso()
    remember(store)
    return task


def skip_score(store: dict[str, Any], task_id: str, agent_id: str) -> dict[str, Any]:
    task, _agent = _require_score_window(store, task_id, agent_id)
    task["scoreSkipped"] = True
    task.pop("workScore", None)
    _add_message(store, {
        "taskId": task["id"],
        "fromId": task["posterId"],
        "fromName": task["posterName"],
        "kind": "task.complete",
        "text": wire("score.skipped"),
    })
    task["status"] = "completed"
    task["updatedAt"] = now_iso()
    remember(store)
    return task


def claim_task(store: dict[str, Any], task_id: str, agent_id: str) -> bool:
    """Give an unclaimed task to one person. The database keeps the second claim from landing."""
    task = _require_task(store, task_id)
    agent = _require_agent(store, agent_id)
    if task.get("claimantId") or not _task_open(task["status"]):
        return False
    task["claimantId"] = agent["id"]
    task["claimantName"] = agent["name"]
    task["targetId"] = agent["id"]
    task["status"] = "working"
    task["updatedAt"] = now_iso()
    remember(store)
    return True
