"""audio on tasks

Revision ID: 0006_task_audio
Revises: 0005_sender_score_play
Create Date: 2026-11-12
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006_task_audio"
down_revision = "0005_sender_score_play"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("audios", postgresql.JSONB(), nullable=True))
    op.add_column("tasks", sa.Column("artifact_audio", postgresql.JSONB(), nullable=True))
    op.add_column("tasks", sa.Column("artifact_audio_set", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("tasks", "artifact_audio_set")
    op.drop_column("tasks", "artifact_audio")
    op.drop_column("tasks", "audios")
