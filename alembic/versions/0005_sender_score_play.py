"""sender, skipped score, and skill play mode

Revision ID: 0005_sender_score_play
Revises: 0004_skill_title
Create Date: 2026-11-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_sender_score_play"
down_revision = "0004_skill_title"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("skills", sa.Column("play", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("sender_id", sa.Text(), nullable=True))
    op.add_column("tasks", sa.Column("score_skipped", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("tasks", "score_skipped")
    op.drop_column("tasks", "sender_id")
    op.drop_column("skills", "play")
