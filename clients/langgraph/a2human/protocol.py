import json
import re
import time
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlparse, urlunparse

WAITING = {"TASK_STATE_SUBMITTED", "TASK_STATE_WORKING"}
FAILED = {"TASK_STATE_FAILED", "TASK_STATE_CANCELED", "TASK_STATE_REJECTED"}
ASKING = {"TASK_STATE_INPUT_REQUIRED"}


class A2HumanError(RuntimeError):
    pass


def directory_url(value: str) -> str:
    raw = str(value or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise A2HumanError("发现入口要是一个 http 地址")
    path = parsed.path.rstrip("/")
    if path.endswith("agent-card.json") or path.endswith("/api/a2a"):
        return urlunparse(parsed._replace(fragment=""))
    return urlunparse(parsed._replace(path="/.well-known/agent-card.json", params="", query="", fragment=""))


def _extension_roster(card: dict):
    extensions = card.get("capabilities", {}).get("extensions") if isinstance(card, dict) else None
    if not isinstance(extensions, list):
        return None
    for extension in extensions:
        roster = (extension or {}).get("params", {}).get("onDuty") if isinstance(extension, dict) else None
        if isinstance(roster, list):
            return roster
    return None


def read_roster(card: dict) -> list[dict]:
    if not isinstance(card, dict):
        return []
    direct = card.get("a2human", {}).get("onDuty") if isinstance(card.get("a2human"), dict) else None
    roster = direct if isinstance(direct, list) else _extension_roster(card)
    if not isinstance(roster, list):
        return []
    entries = []
    for person in roster:
        if not isinstance(person, dict) or not isinstance(person.get("url"), str):
            continue
        parsed = urlparse(person["url"])
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            continue
        url = urlunparse(parsed._replace(fragment="")).rstrip("/")
        skills = person.get("skills") if isinstance(person.get("skills"), list) else []
        person_name = person.get("name")
        name = person_name.strip() if isinstance(person_name, str) and person_name.strip() else "未命名"
        for skill in skills:
            if not isinstance(skill, dict) or not isinstance(skill.get("name"), str) or not skill["name"].strip():
                continue
            description = skill.get("description")
            entries.append(
                {
                    "person_name": name,
                    "url": url,
                    "skill_name": skill["name"].strip(),
                    "description": description.strip() if isinstance(description, str) else "",
                    "input_schema": skill.get("inputSchema") if isinstance(skill.get("inputSchema"), dict) else None,
                    "output_schema": skill.get("outputSchema") if isinstance(skill.get("outputSchema"), dict) else None,
                }
            )
    return sorted(entries, key=lambda item: (item["person_name"], item["skill_name"], item["url"]))


def _fnv(value: str) -> str:
    hash_ = 2166136261
    for char in value:
        hash_ ^= ord(char)
        hash_ = (hash_ * 16777619) & 0xFFFFFFFF
    return f"{hash_:08x}"


def tool_name(entry: dict) -> str:
    identifier = "".join(char for char in entry["url"].rstrip("/").split("/")[-1] if char.isalnum() or char in "_-") or "person"
    skill = "".join(char for char in entry["skill_name"] if char.isascii() and (char.isalnum() or char in "_-"))
    suffix = _fnv(f"{entry['url']}\n{entry['skill_name']}")
    raw = f"a2h_{identifier}_{skill}_{suffix}"
    named = "".join(char if char.isalnum() or char in "_-" else "_" for char in raw)[:64]
    if named and all(char.isalnum() or char in "_-" for char in named):
        return named
    return f"a2h_{suffix}"


def unique_tool_names(entries: list[dict]) -> list[dict]:
    used = set()
    named = []
    for entry in entries:
        base = tool_name(entry)[:64]
        name = base
        number = 2
        while name in used:
            tail = f"_{number}"
            name = f"{base[: 64 - len(tail)]}{tail}"
            number += 1
        used.add(name)
        named.append({"entry": entry, "name": name})
    return named


def _schema_line(label: str, schema) -> str:
    if not isinstance(schema, dict):
        return ""
    text = json.dumps(schema, ensure_ascii=False)
    if len(text) > 800:
        text = f"{text[:800]}…"
    return f"{label}：{text}"


def describe_duty(entry: dict) -> str:
    flat = flat_fields(entry.get("input_schema"))
    lines = [
        f"在岗的人：{entry['person_name']}。技能：{entry['skill_name']}。",
        entry["description"],
        None if flat else _schema_line("输入", entry["input_schema"]),
        _schema_line("输出", entry["output_schema"]),
        (
            "按参数填写。图片填 http 地址或 data:image/png;base64,…。这一调用会等到人交回产物。"
            if flat
            else "prompt 里写要这个人办的事。内容若是 JSON 对象或数组，会按 application/json 送出。这一调用会等到人交回产物。"
        ),
        '人若请你打分，结果是 {"request":"score","taskId":"…","person":"人名"}。再用 task_id 和 score 调用一次。score 是你给这个人打的 1 到 5 分。',
    ]
    return "\n".join(line for line in lines if line)


def summarize_roster(entries: list[dict]) -> str:
    if not entries:
        return "这张卡上现在没有在岗的人。"
    lines = [
        f"- {entry['person_name']} · {entry['skill_name']}" + (f"：{entry['description']}" if entry["description"] else "")
        for entry in entries
    ]
    return f"已接上 {len(entries)} 项在岗技能：\n" + "\n".join(lines)


def flat_fields(schema) -> list[dict] | None:
    if not isinstance(schema, dict) or schema.get("type") != "object":
        return None
    properties = schema.get("properties")
    if not isinstance(properties, dict) or not properties:
        return None
    required = schema.get("required") or []
    if required and not isinstance(required, list):
        return None
    required_names = {item for item in required if isinstance(item, str)}
    fields = []
    for name, value in properties.items():
        if not isinstance(name, str) or not name.isascii() or not name.isidentifier() or not isinstance(value, dict):
            return None
        description = value.get("description") if isinstance(value.get("description"), str) else ""
        media = value.get("contentMediaType")
        if value.get("type") == "string" and isinstance(media, str) and media.startswith("image/"):
            kind = "image"
        elif value.get("type") in {"string", "integer", "number", "boolean"} and "contentMediaType" not in value:
            kind = value["type"]
        else:
            return None
        fields.append({"name": name, "kind": kind, "required": name in required_names, "description": description.strip()})
    return fields


def _image_media_from_url(url: str) -> str:
    path = urlparse(url).path.lower()
    if path.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if path.endswith(".webp"):
        return "image/webp"
    if path.endswith(".gif"):
        return "image/gif"
    return "image/png"


def image_part(value: str) -> dict:
    text = str(value or "").strip()
    if text.startswith(("http://", "https://")):
        return {"mediaType": _image_media_from_url(text), "url": text}
    matched = re.fullmatch(r"data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)", text)
    if not matched:
        raise A2HumanError("图片要是 http 地址，或 data:image/png;base64,…")
    return {"mediaType": matched.group(1), "raw": re.sub(r"\s", "", matched.group(2))}


def message_parts(prompt=None, *, fields=None, images=None) -> list[dict]:
    parts = []
    if isinstance(fields, dict) and fields:
        parts.append({"mediaType": "application/json", "data": fields})
    elif prompt is not None:
        parts.extend(_prompt_parts(prompt))
    parts.extend(images or [])
    if not parts:
        raise A2HumanError("prompt 不能是空的")
    return parts


def _prompt_parts(prompt) -> list[dict]:
    if isinstance(prompt, (dict, list)):
        return [{"mediaType": "application/json", "data": prompt}]
    text = str(prompt or "").strip()
    if not text:
        raise A2HumanError("prompt 不能是空的")
    if text.startswith("{") or text.startswith("["):
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, (dict, list)):
            return [{"mediaType": "application/json", "data": data}]
    return [{"mediaType": "text/plain", "text": text}]


def send_body(message_id: str, skill: str, prompt=None, *, fields=None, images=None) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "SendMessage",
        "params": {
            "configuration": {"returnImmediately": True},
            "metadata": {"skill": skill, "caller": "LangGraph"},
            "message": {
                "role": "ROLE_USER",
                "messageId": message_id,
                "parts": message_parts(prompt, fields=fields, images=images),
            },
        },
    }


def score_body(message_id: str, skill: str, task_id: str, score: int) -> dict:
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "SendMessage",
        "params": {
            "configuration": {"returnImmediately": True},
            "metadata": {"skill": skill, "caller": "LangGraph"},
            "message": {
                "role": "ROLE_USER",
                "messageId": message_id,
                "taskId": task_id,
                "parts": [{"mediaType": "application/json", "data": {"score": score}}],
            },
        },
    }


def get_body(task_id: str) -> dict:
    return {"jsonrpc": "2.0", "id": f"get-{task_id}", "method": "GetTask", "params": {"id": task_id}}


def task_of(response: dict):
    if not isinstance(response, dict) or response.get("error"):
        return None
    result = response.get("result")
    if not isinstance(result, dict):
        return None
    task = result.get("task")
    if isinstance(task, dict):
        return task
    if isinstance(result.get("id"), str) and isinstance(result.get("status"), dict):
        return result
    return None


def _part_text(part: dict) -> str:
    if not isinstance(part, dict):
        return ""
    text = part.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()
    if "data" in part and part["data"] is not None:
        return part["data"] if isinstance(part["data"], str) else json.dumps(part["data"], ensure_ascii=False, separators=(",", ":"))
    raw = part.get("raw")
    media = part.get("mediaType")
    if isinstance(raw, str) and isinstance(media, str) and media.startswith("image/"):
        if len(raw) <= 12000:
            return f"[图片 {media}] {raw}"
        return f"[图片 {media}，{len(raw)} 字符 base64]"
    return ""


def artifact_text(task: dict) -> str:
    parts = []
    for artifact in task.get("artifacts") or []:
        if isinstance(artifact, dict):
            parts.extend(artifact.get("parts") or [])
    return "\n".join(text for text in (_part_text(part) for part in parts) if text)


def _status_text(task: dict) -> str:
    message = (task.get("status") or {}).get("message") or {}
    parts = message.get("parts") if isinstance(message, dict) else None
    if not isinstance(parts, list):
        return ""
    return "\n".join(text for text in (_part_text(part) for part in parts) if text)


def format_task(task: dict) -> str:
    state = (task.get("status") or {}).get("state")
    text = artifact_text(task)
    note = _status_text(task)
    if state in FAILED:
        raise A2HumanError(note or text or state)
    if state in ASKING:
        return note or text or state
    if state == "TASK_STATE_COMPLETED":
        return text or "人交回了空产物"
    raise A2HumanError(note or f"任务停在 {state or '未知状态'}")


def urllib_transport(method: str, url: str, body, headers: dict, timeout: float):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            return json.loads(raw)
        except json.JSONDecodeError as parse_error:
            raise A2HumanError(f"调用没有返回 JSON（{error.code}）") from parse_error


class Client:
    def __init__(self, directory: str, *, transport=None, interval: float = 2.0, timeout: float = 600.0, request_timeout: float = 30.0):
        self.directory = directory_url(directory)
        self.transport = transport or urllib_transport
        self.interval = interval
        self.timeout = timeout
        self.request_timeout = request_timeout

    def _request(self, method: str, url: str, body=None) -> dict:
        headers = {"accept": "application/json"}
        if body is not None:
            headers["content-type"] = "application/json"
            headers["A2A-Version"] = "1.0"
        response = self.transport(method, url, body, headers, self.request_timeout)
        if isinstance(response, dict) and response.get("error"):
            message = response["error"].get("message") if isinstance(response["error"], dict) else None
            raise A2HumanError(message or "调用失败")
        if not isinstance(response, dict):
            raise A2HumanError("调用没有返回 JSON")
        return response

    def card(self) -> dict:
        return self._request("GET", self.directory)

    def roster(self) -> list[dict]:
        return read_roster(self.card())

    def dispatch(
        self,
        url: str,
        skill: str,
        prompt=None,
        *,
        fields=None,
        images=None,
        message_id: str | None = None,
        task_id: str | None = None,
        score: int | None = None,
    ) -> str:
        if task_id is not None or score is not None:
            if not isinstance(task_id, str) or not task_id.strip():
                raise A2HumanError("打分要带上任务 id")
            if type(score) is not int or score < 1 or score > 5:
                raise A2HumanError("分数要是 1 到 5 的整数")
            sent = self._request("POST", url, score_body(message_id or str(uuid.uuid4()), skill, task_id.strip(), score))
        else:
            sent = self._request("POST", url, send_body(message_id or str(uuid.uuid4()), skill, prompt, fields=fields, images=images))
        task = task_of(sent)
        if not task or not isinstance(task.get("id"), str):
            raise A2HumanError("没有返回任务")
        deadline = time.monotonic() + self.timeout
        while (task.get("status") or {}).get("state") in WAITING:
            if time.monotonic() >= deadline:
                raise A2HumanError("人还没交，等待超时")
            if self.interval > 0:
                time.sleep(self.interval)
            got = self._request("POST", url, get_body(task["id"]))
            task = task_of(got)
            if not task or not isinstance(task.get("id"), str):
                raise A2HumanError("GetTask 没有返回任务")
        return format_task(task)
