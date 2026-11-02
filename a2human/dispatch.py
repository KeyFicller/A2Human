"""Send a task to someone on duty by skill, without the caller picking a person.

``POST /api/a2a`` still only lists who is on duty. This path is separate.
"""

from __future__ import annotations

import random
from typing import Any, Callable

from a2human.copy import wire
from a2human.rules import OPEN_STATUSES, fail


def default_choose(items: list[dict[str, Any]]) -> dict[str, Any]:
    return random.choice(items)


def _has_skill(agent: dict[str, Any], skill: str) -> bool:
    return any(item.get("name") == skill for item in agent.get("skills") or [])


def _candidates(store: dict[str, Any], skill: str) -> list[dict[str, Any]]:
    return [
        agent
        for agent in store["agents"]
        if agent.get("human") and agent.get("available") and _has_skill(agent, skill)
    ]


def _sticky_id(store: dict[str, Any], caller_name: str, skill: str, candidate_ids: set[str]) -> str | None:
    for task in store["tasks"]:
        if task.get("posterName") != caller_name:
            continue
        if task.get("skills") != [skill]:
            continue
        claimant = task.get("claimantId")
        if claimant in candidate_ids:
            return claimant
    return None


def _open_tasks(store: dict[str, Any], agent_id: str) -> int:
    return sum(
        1
        for task in store["tasks"]
        if task.get("claimantId") == agent_id and task.get("status") in OPEN_STATUSES
    )


def route_dispatch(
    store: dict[str, Any],
    skill: str | None,
    caller_name: str,
    agent_id: str | None,
    choose: Callable[[list[dict[str, Any]]], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not skill:
        fail(wire("dispatch.skill"), -32602)
    people = _candidates(store, skill)
    if agent_id:
        chosen = next((agent for agent in people if agent["id"] == agent_id), None)
        if not chosen:
            fail(wire("dispatch.agent"), -32004)
        return chosen
    if not people:
        fail(wire("dispatch.none"), -32004)
    by_id = {agent["id"]: agent for agent in people}
    sticky = _sticky_id(store, caller_name, skill, set(by_id))
    if sticky:
        return by_id[sticky]
    counts = {agent["id"]: _open_tasks(store, agent["id"]) for agent in people}
    least = min(counts.values())
    tied = sorted((agent for agent in people if counts[agent["id"]] == least), key=lambda agent: agent["id"])
    if len(tied) == 1:
        return tied[0]
    pick = choose or default_choose
    return pick(tied)
