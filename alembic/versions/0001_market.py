"""market tables

Revision ID: 0001_market
Revises:
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_market"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("bio", sa.Text(), nullable=False),
        sa.Column("human", sa.Boolean(), nullable=False),
        sa.Column("available", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("seq", sa.BigInteger(), nullable=False, unique=True),
    )
    op.create_index("agents_duty_idx", "agents", ["human", "available"])
    op.create_table(
        "skills",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("agent_id", sa.Text(), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("input_schema", postgresql.JSONB()),
        sa.Column("output_schema", postgresql.JSONB()),
        sa.UniqueConstraint("agent_id", "name", name="skills_agent_name_idx"),
    )
    op.create_index("skills_agent_idx", "skills", ["agent_id"])
    op.create_table(
        "tasks",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("brief", sa.Text(), nullable=False),
        sa.Column("poster_id", sa.Text(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("poster_name", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("claimant_id", sa.Text(), sa.ForeignKey("agents.id")),
        sa.Column("claimant_name", sa.Text()),
        sa.Column("artifact", sa.Text()),
        sa.Column("work_score", sa.Integer()),
        sa.Column("images", postgresql.JSONB()),
        sa.Column("artifact_image", postgresql.JSONB()),
        sa.Column("artifact_image_set", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("context_id", sa.Text()),
        sa.Column("a2a_message_id", sa.Text()),
        sa.Column("source", sa.Text()),
        sa.Column("target_id", sa.Text(), sa.ForeignKey("agents.id")),
        sa.Column("skills", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("seq", sa.BigInteger(), nullable=False, unique=True),
    )
    op.create_index("tasks_status_idx", "tasks", ["status"])
    op.create_index("tasks_claimant_idx", "tasks", ["claimant_id"])
    op.create_index("tasks_target_idx", "tasks", ["target_id"])
    op.create_index("tasks_context_idx", "tasks", ["context_id"])
    op.create_index("tasks_seq_idx", "tasks", ["seq"])
    op.create_index(
        "tasks_message_idx",
        "tasks",
        ["a2a_message_id"],
        unique=True,
        postgresql_where=sa.text("a2a_message_id IS NOT NULL"),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("task_id", sa.Text(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_id", sa.Text(), nullable=False),
        sa.Column("from_name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("a2a_message_id", sa.Text()),
        sa.Column("seq", sa.BigInteger(), nullable=False),
    )
    op.create_index("messages_task_idx", "messages", ["task_id", "seq"])
    op.create_index(
        "messages_a2a_idx",
        "messages",
        ["a2a_message_id"],
        unique=True,
        postgresql_where=sa.text("a2a_message_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("tasks")
    op.drop_table("skills")
    op.drop_table("agents")
