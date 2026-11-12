"""display title beside the skill tool id

Revision ID: 0004_skill_title
Revises: 0003_task_progress
Create Date: 2026-11-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_skill_title"
down_revision = "0003_task_progress"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("skills", sa.Column("title", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("skills", "title")
