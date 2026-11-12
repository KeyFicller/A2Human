"""Load and save the market dict.

Writers lock the agent or task row (``FOR UPDATE``) and then update only if
``version`` is still the one they read. A second claim sees either a newer
version or a claimant that is already set, and the whole unit of work retries.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from a2human.clock import from_datetime, to_datetime
from a2human.models import AgentRow, MessageRow, SkillRow, TaskRow

PRIVATE = {"_flush", "_loaded", "_versions", "_seq", "_hash", "_skip_save", "_write"}


class Conflict(Exception):
    """Another worker changed this row. The caller should reload and try again."""


def public_copy(store: dict[str, Any]) -> dict[str, Any]:
    return {
        "agents": deepcopy(store.get("agents") or []),
        "tasks": deepcopy(store.get("tasks") or []),
        "messages": deepcopy(store.get("messages") or []),
    }


def _skill_dict(row: SkillRow) -> dict[str, Any]:
    skill: dict[str, Any] = {"name": row.name, "description": row.description}
    if row.title:
        skill["title"] = row.title
    if row.input_schema is not None and row.output_schema is not None:
        skill["inputSchema"] = row.input_schema
        skill["outputSchema"] = row.output_schema
    return skill


def _task_dict(row: TaskRow) -> dict[str, Any]:
    task: dict[str, Any] = {
        "id": row.id,
        "title": row.title,
        "brief": row.brief,
        "posterId": row.poster_id,
        "posterName": row.poster_name,
        "skills": list(row.skills or []),
        "status": row.status,
        "claimantId": row.claimant_id,
        "claimantName": row.claimant_name,
        "artifact": row.artifact,
        "createdAt": from_datetime(row.created_at),
        "updatedAt": from_datetime(row.updated_at),
    }
    if row.images:
        task["images"] = row.images
    if row.artifact_image_set:
        task["artifactImage"] = row.artifact_image
    if row.work_score is not None:
        task["workScore"] = row.work_score
    if row.context_id is not None:
        task["contextId"] = row.context_id
    if row.a2a_message_id is not None:
        task["a2aMessageId"] = row.a2a_message_id
    if row.source is not None:
        task["source"] = row.source
    if row.target_id is not None:
        task["targetId"] = row.target_id
    if row.progress:
        task["progress"] = row.progress
    return task


def _message_dict(row: MessageRow) -> dict[str, Any]:
    message: dict[str, Any] = {
        "id": row.id,
        "taskId": row.task_id,
        "fromId": row.from_id,
        "fromName": row.from_name,
        "kind": row.kind,
        "text": row.text,
        "createdAt": from_datetime(row.created_at),
    }
    if row.a2a_message_id is not None:
        message["a2aMessageId"] = row.a2a_message_id
    return message


async def load_market(session: AsyncSession) -> dict[str, Any]:
    agents = (await session.scalars(select(AgentRow).order_by(AgentRow.seq.asc()))).all()
    skills = (await session.scalars(select(SkillRow).order_by(SkillRow.agent_id.asc(), SkillRow.position.asc()))).all()
    tasks = (await session.scalars(select(TaskRow).order_by(TaskRow.seq.desc()))).all()
    messages = (await session.scalars(select(MessageRow).order_by(MessageRow.seq.asc()))).all()
    by_agent: dict[str, list[SkillRow]] = {}
    for skill in skills:
        by_agent.setdefault(skill.agent_id, []).append(skill)
    store: dict[str, Any] = {
        "agents": [],
        "tasks": [_task_dict(row) for row in tasks],
        "messages": [_message_dict(row) for row in messages],
        "_versions": {"agents": {}, "tasks": {}, "messages": {}},
        "_seq": {"agents": {}, "tasks": {}, "messages": {}},
    }
    for row in agents:
        store["agents"].append({
            "id": row.id,
            "name": row.name,
            "bio": row.bio,
            "human": row.human,
            "available": row.available,
            "skills": [_skill_dict(skill) for skill in by_agent.get(row.id, [])],
            "createdAt": from_datetime(row.created_at),
        })
        store["_versions"]["agents"][row.id] = row.version
        store["_seq"]["agents"][row.id] = row.seq
    for row in tasks:
        store["_versions"]["tasks"][row.id] = row.version
        store["_seq"]["tasks"][row.id] = row.seq
    for row in messages:
        store["_versions"]["messages"][row.id] = 1
        store["_seq"]["messages"][row.id] = row.seq
    store["_loaded"] = public_copy(store)
    return store


def _changed(before: list[dict], after: list[dict]) -> tuple[list[str], list[str]]:
    old = {item["id"]: item for item in before}
    new = {item["id"]: item for item in after}
    changed = [item_id for item_id, item in new.items() if old.get(item_id) != item]
    removed = [item_id for item_id in old if item_id not in new]
    return changed, removed


async def _alloc_seqs(session: AsyncSession, sequence: str, existing: dict[str, int], ids_in_order: list[str], newest_first: bool) -> dict[str, int]:
    # nextval is safe across workers. Tasks are listed newest first, so the
    # first new id receives the highest value from this batch.
    fresh = [item_id for item_id in ids_in_order if item_id not in existing]
    assigned = dict(existing)
    if not fresh:
        return assigned
    rows = await session.execute(text(f"SELECT nextval('{sequence}') FROM generate_series(1, :n)"), {"n": len(fresh)})
    values = [int(row[0]) for row in rows]
    if newest_first:
        values = list(reversed(values))
    for item_id, seq in zip(fresh, values):
        assigned[item_id] = seq
    return assigned


async def _lock_agents(session: AsyncSession, ids: list[str]) -> dict[str, AgentRow]:
    if not ids:
        return {}
    rows = (await session.scalars(select(AgentRow).where(AgentRow.id.in_(ids)).with_for_update())).all()
    return {row.id: row for row in rows}


async def _lock_tasks(session: AsyncSession, ids: list[str]) -> dict[str, TaskRow]:
    if not ids:
        return {}
    rows = (await session.scalars(select(TaskRow).where(TaskRow.id.in_(ids)).with_for_update())).all()
    return {row.id: row for row in rows}


def _fill_agent(row: AgentRow, agent: dict[str, Any], seq: int, version: int) -> None:
    row.name = agent["name"]
    row.bio = agent["bio"]
    row.human = bool(agent["human"])
    row.available = bool(agent["available"])
    row.created_at = to_datetime(agent["createdAt"])
    row.seq = seq
    row.version = version


def _fill_task(row: TaskRow, task: dict[str, Any], seq: int, version: int) -> None:
    row.title = task["title"]
    row.brief = task["brief"]
    row.poster_id = task["posterId"]
    row.poster_name = task["posterName"]
    row.status = task["status"]
    row.claimant_id = task.get("claimantId")
    row.claimant_name = task.get("claimantName")
    row.progress = task.get("progress") or None
    row.artifact = task.get("artifact")
    row.work_score = task.get("workScore") if "workScore" in task else None
    row.images = task.get("images")
    row.artifact_image_set = "artifactImage" in task
    row.artifact_image = task.get("artifactImage") if row.artifact_image_set else None
    row.created_at = to_datetime(task["createdAt"])
    row.updated_at = to_datetime(task["updatedAt"])
    row.context_id = task.get("contextId")
    row.a2a_message_id = task.get("a2aMessageId")
    row.source = task.get("source")
    row.target_id = task.get("targetId")
    row.skills = list(task.get("skills") or [])
    row.seq = seq
    row.version = version


async def _replace_skills(session: AsyncSession, agent_id: str, skills: list[dict[str, Any]]) -> None:
    await session.execute(delete(SkillRow).where(SkillRow.agent_id == agent_id))
    for position, skill in enumerate(skills):
        session.add(SkillRow(
            agent_id=agent_id,
            position=position,
            name=skill["name"],
            title=skill.get("title"),
            description=skill["description"],
            input_schema=skill.get("inputSchema"),
            output_schema=skill.get("outputSchema"),
        ))


async def apply_changes(session: AsyncSession, store: dict[str, Any]) -> list[str]:
    """Write the dict. Raises Conflict when a locked row moved under us."""
    if store.get("_skip_save"):
        return []
    before = store.get("_loaded") or {"agents": [], "tasks": [], "messages": []}
    versions = store.setdefault("_versions", {"agents": {}, "tasks": {}, "messages": {}})
    seqs = store.setdefault("_seq", {"agents": {}, "tasks": {}, "messages": {}})
    changed_agents, removed_agents = _changed(before["agents"], store["agents"])
    changed_tasks, removed_tasks = _changed(before["tasks"], store["tasks"])
    changed_messages, _removed_messages = _changed(before["messages"], store["messages"])
    if not (changed_agents or removed_agents or changed_tasks or removed_tasks or changed_messages):
        return []

    agent_seqs = await _alloc_seqs(session, "agent_seq", seqs["agents"], [agent["id"] for agent in store["agents"]], newest_first=False)
    task_seqs = await _alloc_seqs(session, "task_seq", seqs["tasks"], [task["id"] for task in store["tasks"]], newest_first=True)
    message_seqs = await _alloc_seqs(session, "message_seq", seqs["messages"], [message["id"] for message in store["messages"]], newest_first=False)

    existing_agent_ids = [agent_id for agent_id in changed_agents if agent_id in versions["agents"]]
    locked_agents = await _lock_agents(session, existing_agent_ids)
    for agent_id in existing_agent_ids:
        row = locked_agents.get(agent_id)
        if row is None or row.version != versions["agents"][agent_id]:
            raise Conflict(agent_id)
    existing_task_ids = [task_id for task_id in changed_tasks if task_id in versions["tasks"]]
    locked_tasks = await _lock_tasks(session, existing_task_ids)
    loaded_tasks = {task["id"]: task for task in before["tasks"]}
    for task_id in existing_task_ids:
        row = locked_tasks.get(task_id)
        if row is None or row.version != versions["tasks"][task_id]:
            raise Conflict(task_id)
        previous = loaded_tasks.get(task_id) or {}
        current = next(task for task in store["tasks"] if task["id"] == task_id)
        # A free task can be claimed once. The lock makes the second writer see the winner.
        if not previous.get("claimantId") and current.get("claimantId") and row.claimant_id not in (None, current.get("claimantId")):
            raise Conflict(task_id)

    by_agent = {agent["id"]: agent for agent in store["agents"]}
    for agent_id in changed_agents:
        agent = by_agent[agent_id]
        seq = agent_seqs[agent_id]
        if agent_id in versions["agents"]:
            row = locked_agents[agent_id]
            _fill_agent(row, agent, seq, row.version + 1)
            versions["agents"][agent_id] = row.version
        else:
            row = AgentRow(id=agent_id, version=1, seq=seq, name="", bio="", human=True, available=False, created_at=to_datetime(agent["createdAt"]))
            _fill_agent(row, agent, seq, 1)
            session.add(row)
            versions["agents"][agent_id] = 1
        seqs["agents"][agent_id] = seq
    try:
        await session.flush()
    except IntegrityError as error:
        raise Conflict("constraint") from error
    for agent_id in changed_agents:
        await _replace_skills(session, agent_id, by_agent[agent_id].get("skills") or [])

    by_task = {task["id"]: task for task in store["tasks"]}
    for task_id in changed_tasks:
        task = by_task[task_id]
        seq = task_seqs[task_id]
        if task_id in versions["tasks"]:
            row = locked_tasks[task_id]
            _fill_task(row, task, seq, row.version + 1)
            versions["tasks"][task_id] = row.version
        else:
            row = TaskRow(
                id=task_id,
                title=task["title"],
                brief=task["brief"],
                poster_id=task["posterId"],
                poster_name=task["posterName"],
                status=task["status"],
                skills=list(task.get("skills") or []),
                created_at=to_datetime(task["createdAt"]),
                updated_at=to_datetime(task["updatedAt"]),
                version=1,
                seq=seq,
                artifact_image_set=False,
            )
            _fill_task(row, task, seq, 1)
            session.add(row)
            versions["tasks"][task_id] = 1
        seqs["tasks"][task_id] = seq
    try:
        await session.flush()
    except IntegrityError as error:
        raise Conflict("constraint") from error

    by_message = {message["id"]: message for message in store["messages"]}
    for message_id in changed_messages:
        message = by_message[message_id]
        if message_id in versions["messages"]:
            row = await session.get(MessageRow, message_id)
            if row is None:
                raise Conflict(message_id)
            row.task_id = message["taskId"]
            row.from_id = message["fromId"]
            row.from_name = message["fromName"]
            row.kind = message["kind"]
            row.text = message["text"]
            row.created_at = to_datetime(message["createdAt"])
            row.a2a_message_id = message.get("a2aMessageId")
            continue
        session.add(MessageRow(
            id=message_id,
            task_id=message["taskId"],
            from_id=message["fromId"],
            from_name=message["fromName"],
            kind=message["kind"],
            text=message["text"],
            created_at=to_datetime(message["createdAt"]),
            a2a_message_id=message.get("a2aMessageId"),
            seq=message_seqs[message_id],
        ))
        versions["messages"][message_id] = 1
        seqs["messages"][message_id] = message_seqs[message_id]

    for agent_id in removed_agents:
        await session.execute(delete(AgentRow).where(AgentRow.id == agent_id))
        versions["agents"].pop(agent_id, None)
        seqs["agents"].pop(agent_id, None)
    for task_id in removed_tasks:
        await session.execute(delete(TaskRow).where(TaskRow.id == task_id))
        versions["tasks"].pop(task_id, None)
        seqs["tasks"].pop(task_id, None)

    try:
        await session.flush()
    except IntegrityError as error:
        raise Conflict("constraint") from error
    store["_loaded"] = public_copy(store)
    return [task_id for task_id in changed_tasks]
