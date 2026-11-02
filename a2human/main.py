"""HTTP API. URLs and JSON match the previous Next.js routes.

The Next.js process is the public server on port 3847 and proxies ``/api/*``
here. ``x-a2human-origin`` is the browser origin, so agent card URLs stay on
that host instead of this internal port.
"""

from __future__ import annotations

import json

from fastapi import FastAPI, Request
from fastapi.responses import Response

from a2human.a2a import dispatch_a2a, rpc_error
from a2human.card import dispatcher_card, to_agent_card
from a2human.copy import wire
from a2human.jsonutil import dumps, loads
from a2human.mcp import McpIo, handle_mcp
from a2human.rules import (
    DomainError,
    decide_task,
    expire_scores,
    present_agent,
    publish_agent,
    set_availability,
    submit_artifact,
    update_agent,
)
from a2human.store import commit_store, read_store, update_store

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, redirect_slashes=False)


def request_origin(request: Request) -> str:
    pinned = request.headers.get("x-a2human-origin")
    if pinned:
        return pinned.split(",")[0].strip().rstrip("/")
    forwarded = request.headers.get("x-forwarded-host")
    if forwarded:
        host = forwarded.split(",")[0].strip()
        proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip() or "https"
        return f"{proto}://{host}"
    return str(request.base_url).rstrip("/")


def json_response(data: object, status: int = 200) -> Response:
    return Response(
        content=dumps(data).encode(),
        status_code=status,
        media_type="application/json",
        headers={"cache-control": "no-store"},
    )


def _domain_response(error: Exception) -> Response:
    if isinstance(error, DomainError):
        return json_response({"error": str(error)}, 400)
    if isinstance(error, json.JSONDecodeError):
        return json_response({"error": wire("request.body")}, 400)
    raise error


async def _read_body(request: Request) -> dict:
    try:
        body = loads((await request.body()).decode() or "")
    except json.JSONDecodeError as error:
        raise error
    if not isinstance(body, dict):
        raise DomainError(wire("request.body"))
    return body


async def _read_rpc(request: Request) -> object:
    raw = await request.body()
    try:
        return loads(raw.decode() or "")
    except json.JSONDecodeError:
        return _PARSE_ERROR


_PARSE_ERROR = object()


def _mcp_io() -> McpIo:
    return McpIo(
        read=lambda: commit_store(expire_scores),
        update=lambda fn: update_store(fn),
    )


@app.get("/api/agents")
async def list_agents() -> Response:
    store = commit_store(expire_scores)
    return json_response([present_agent(store, agent) for agent in store["agents"] if agent.get("human")])


@app.post("/api/agents")
async def create_agent(request: Request) -> Response:
    try:
        body = await _read_body(request)
        agent = update_store(lambda store: publish_agent(store, {"name": body.get("name"), "bio": body.get("bio"), "skills": body.get("skills")}))
        return json_response(agent, 201)
    except (DomainError, json.JSONDecodeError) as error:
        return _domain_response(error)


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str) -> Response:
    store = commit_store(expire_scores)
    agent = next((item for item in store["agents"] if item["id"] == agent_id), None)
    if not agent:
        return json_response({"error": wire("agent.missing")}, 404)
    return json_response(present_agent(store, agent))


@app.post("/api/agents/{agent_id}")
async def post_agent(agent_id: str, request: Request) -> Response:
    try:
        body = await _read_body(request)

        def run(store: dict) -> dict:
            if isinstance(body.get("available"), bool) and body.get("name") is None:
                return set_availability(store, agent_id, body["available"])
            return update_agent(store, agent_id, {"name": body.get("name"), "bio": body.get("bio"), "skills": body.get("skills")})

        return json_response(update_store(run))
    except (DomainError, json.JSONDecodeError) as error:
        return _domain_response(error)


@app.get("/api/tasks")
async def list_tasks() -> Response:
    store = commit_store(expire_scores)
    return json_response(store["tasks"])


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str) -> Response:
    store = commit_store(expire_scores)
    task = next((item for item in store["tasks"] if item["id"] == task_id), None)
    if not task:
        return json_response({"error": wire("task.missing")}, 404)
    messages = [message for message in store["messages"] if message["taskId"] == task_id]
    poster = next((agent for agent in store["agents"] if agent["id"] == task["posterId"]), None)
    claimant = next((agent for agent in store["agents"] if agent["id"] == task["claimantId"]), None) if task.get("claimantId") else None
    return json_response({"task": task, "messages": messages, "poster": poster, "claimant": claimant})


@app.post("/api/tasks/{task_id}")
async def post_task(task_id: str, request: Request) -> Response:
    try:
        body = await _read_body(request)
        agent_id = body.get("agentId")
        if not isinstance(agent_id, str):
            return json_response({"error": wire("agent.idMissing")}, 400)

        def run(store: dict) -> dict:
            if body.get("action") == "artifact":
                return submit_artifact(store, task_id, agent_id, body.get("text"), body.get("image"))
            if body.get("action") in {"reject", "cancel", "fail", "input"}:
                return decide_task(store, task_id, agent_id, body["action"], body.get("text"))
            raise DomainError(wire("action.unknown"))

        return json_response(update_store(run))
    except (DomainError, json.JSONDecodeError) as error:
        return _domain_response(error)


@app.get("/api/a2a")
@app.get("/.well-known/agent-card.json")
async def directory_card(request: Request) -> Response:
    origin = request_origin(request)
    store = commit_store(expire_scores)
    return json_response(dispatcher_card(origin, store["agents"], store["tasks"]))


@app.post("/api/a2a")
async def directory_rpc(request: Request) -> Response:
    body = await _read_rpc(request)
    if body is _PARSE_ERROR:
        return json_response(rpc_error(None, -32700, wire("request.body")))
    result = update_store(lambda store: dispatch_a2a(store, {"kind": "pool"}, body, {"a2aVersion": request.headers.get("a2a-version")}))
    return json_response(result)


@app.get("/api/a2a/{agent_id}")
async def person_card(agent_id: str, request: Request) -> Response:
    store = commit_store(expire_scores)
    agent = next((item for item in store["agents"] if item["id"] == agent_id), None)
    if not agent:
        return json_response({"error": wire("agent.missing")}, 404)
    return json_response(to_agent_card(agent, request_origin(request), store["tasks"]))


@app.post("/api/a2a/{agent_id}")
async def person_rpc(agent_id: str, request: Request) -> Response:
    body = await _read_rpc(request)
    if body is _PARSE_ERROR:
        return json_response(rpc_error(None, -32700, wire("request.body")))
    known = read_store()
    if not any(item["id"] == agent_id for item in known["agents"]):
        return json_response(rpc_error(None, -32001, wire("agent.missing")))
    result = update_store(
        lambda store: dispatch_a2a(store, {"kind": "human", "agentId": agent_id}, body, {"a2aVersion": request.headers.get("a2a-version")})
    )
    return json_response(result)


@app.get("/api/mcp")
async def mcp_get() -> Response:
    return json_response({"jsonrpc": "2.0", "id": None, "error": {"code": -32004, "message": wire("mcp.getOnly")}}, 405)


@app.post("/api/mcp")
async def mcp_post(request: Request) -> Response:
    body = await _read_rpc(request)
    if body is _PARSE_ERROR:
        return json_response({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": wire("request.body")}}, 400)
    response = await handle_mcp(
        body,
        _mcp_io(),
        {
            "protocolVersion": request.headers.get("mcp-protocol-version"),
            "method": request.headers.get("mcp-method"),
            "name": request.headers.get("mcp-name"),
        },
    )
    if response.get("body") is None:
        return Response(status_code=response["status"])
    return json_response(response["body"], response["status"])
