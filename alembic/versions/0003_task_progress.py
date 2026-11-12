"""optional progress line on an in-progress task

Revision ID: 0003_task_progress
Revises: 0002_sequences
Create Date: 2026-11-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_task_progress"
down_revision = "0002_sequences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("progress", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "progress")
