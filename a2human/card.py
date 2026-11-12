"""Agent cards. Discovery lists only people who are on duty, and does not assign work."""

from __future__ import annotations

from typing import Any

from a2human.copy import wire
from a2human.rules import on_duty, work_record
from a2human.schema_fields import contract_modes


def _written_skill(skill: dict[str, Any]) -> str:
    title = skill.get("title")
    if isinstance(title, str) and title.strip():
        return title.strip()
    return skill["name"]


def _skill_entry(skill: dict[str, Any]) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "id": skill["name"],
        "name": _written_skill(skill),
        "description": skill["description"],
        "tags": ["human"],
    }
    if skill.get("inputSchema") and skill.get("outputSchema"):
        entry["inputModes"] = contract_modes(skill["inputSchema"])
        entry["outputModes"] = contract_modes(skill["outputSchema"])
    return entry


def _skill_schemas(skills: list[dict[str, Any]]) -> dict[str, Any]:
    schemas = {}
    for skill in skills:
        if skill.get("inputSchema") and skill.get("outputSchema"):
            schemas[skill["name"]] = {"inputSchema": skill["inputSchema"], "outputSchema": skill["outputSchema"]}
    return schemas


def _extension(origin: str, roster: list[dict[str, Any]] | None = None, skills: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    schemas = _skill_schemas(skills or [])
    schema_note = wire("card.schemaNote") if schemas else ""
    params: dict[str, Any] = {"returnImmediately": True}
    if roster is not None:
        params["onDuty"] = roster
    if schemas:
        params["skillSchemas"] = schemas
    return {
        "uri": f"{origin}/extensions/a2human/v1",
        "description": wire("card.roster") if roster is not None else wire("card.person", {"schemaNote": schema_note}),
        "required": False,
        "params": params,
    }


def to_agent_card(agent: dict[str, Any], origin: str, tasks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    tasks = tasks or []
    endpoint = f"{origin}/api/a2a/{agent['id']}"
    record = work_record(tasks, agent["id"])
    if agent.get("human"):
        description = f"{agent['bio']}{wire('card.dutyOn') if agent.get('available') else wire('card.dutyOff')}"
    else:
        description = agent["bio"]
    return {
        "name": agent["name"],
        "description": description,
        "version": "1.0.0",
        "supportedInterfaces": [{"url": endpoint, "protocolBinding": "JSONRPC", "protocolVersion": "1.0"}],
        "provider": {"organization": "A2Human", "url": origin},
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "extendedAgentCard": False,
            "extensions": [_extension(origin, skills=agent.get("skills") or [])],
        },
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [_skill_entry(skill) for skill in agent.get("skills") or []],
        "a2human": {
            "humanInTheLoop": agent.get("human"),
            "available": agent.get("available") if agent.get("human") else False,
            "completed": record["completed"],
            "averageScore": record["averageScore"],
            "averageDuration": record["averageDuration"],
        },
    }


def dispatcher_card(origin: str, agents: list[dict[str, Any]], tasks: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    tasks = tasks or []
    roster = [
        {
            "name": agent["name"],
            "skills": agent["skills"],
            "url": f"{origin}/api/a2a/{agent['id']}",
            **work_record(tasks, agent["id"]),
        }
        for agent in on_duty(agents)
    ]
    return {
        "name": "A2Human",
        "description": wire("card.dispatcher"),
        "version": "1.0.0",
        "supportedInterfaces": [{"url": f"{origin}/api/a2a", "protocolBinding": "JSONRPC", "protocolVersion": "1.0"}],
        "provider": {"organization": "A2Human", "url": origin},
        "capabilities": {
            "streaming": False,
            "pushNotifications": False,
            "extendedAgentCard": False,
            "extensions": [_extension(origin, roster=roster)],
        },
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [{
            "id": "discover-humans",
            "name": wire("card.discoverName"),
            "description": wire("card.discoverDescription"),
            "tags": ["human", "discover"],
        }],
        "a2human": {"humanInTheLoop": True, "onDuty": roster},
    }
