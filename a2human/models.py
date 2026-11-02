"""Postgres tables for the market.

``version`` is the optimistic lock. A write also takes ``SELECT ... FOR UPDATE``
on the agent or task row so two workers cannot claim or score the same task.
``seq`` keeps list order: new tasks are highest and load first, messages load oldest first.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class AgentRow(Base):
    __tablename__ = "agents"
    __table_args__ = (Index("agents_duty_idx", "human", "available"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    bio: Mapped[str] = mapped_column(Text, nullable=False)
    human: Mapped[bool] = mapped_column(Boolean, nullable=False)
    available: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    seq: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)


class SkillRow(Base):
    __tablename__ = "skills"
    __table_args__ = (
        Index("skills_agent_idx", "agent_id"),
        Index("skills_agent_name_idx", "agent_id", "name", unique=True),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent_id: Mapped[str] = mapped_column(Text, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    input_schema: Mapped[dict | None] = mapped_column(JSONB)
    output_schema: Mapped[dict | None] = mapped_column(JSONB)


class TaskRow(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("tasks_status_idx", "status"),
        Index("tasks_claimant_idx", "claimant_id"),
        Index("tasks_target_idx", "target_id"),
        Index("tasks_context_idx", "context_id"),
        Index("tasks_seq_idx", "seq"),
        Index("tasks_message_idx", "a2a_message_id", unique=True, postgresql_where=text("a2a_message_id IS NOT NULL")),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    brief: Mapped[str] = mapped_column(Text, nullable=False)
    poster_id: Mapped[str] = mapped_column(Text, ForeignKey("agents.id"), nullable=False)
    poster_name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    claimant_id: Mapped[str | None] = mapped_column(Text, ForeignKey("agents.id"))
    claimant_name: Mapped[str | None] = mapped_column(Text)
    artifact: Mapped[str | None] = mapped_column(Text)
    work_score: Mapped[int | None] = mapped_column(Integer)
    images: Mapped[list | None] = mapped_column(JSONB)
    artifact_image: Mapped[dict | None] = mapped_column(JSONB)
    artifact_image_set: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    context_id: Mapped[str | None] = mapped_column(Text)
    a2a_message_id: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)
    target_id: Mapped[str | None] = mapped_column(Text, ForeignKey("agents.id"))
    skills: Mapped[list] = mapped_column(JSONB, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    seq: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)


class MessageRow(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("messages_task_idx", "task_id", "seq"),
        Index("messages_a2a_idx", "a2a_message_id", unique=True, postgresql_where=text("a2a_message_id IS NOT NULL")),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    task_id: Mapped[str] = mapped_column(Text, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    from_id: Mapped[str] = mapped_column(Text, nullable=False)
    from_name: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    a2a_message_id: Mapped[str | None] = mapped_column(Text)
    seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
