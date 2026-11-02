"""concurrent sequence numbers

Revision ID: 0002_sequences
Revises: 0001_market
Create Date: 2026-11-02
"""

from alembic import op

revision = "0002_sequences"
down_revision = "0001_market"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # nextval does not collide when several workers insert at once.
    op.execute("CREATE SEQUENCE agent_seq")
    op.execute("CREATE SEQUENCE task_seq")
    op.execute("CREATE SEQUENCE message_seq")
    for name, table in (("agent_seq", "agents"), ("task_seq", "tasks"), ("message_seq", "messages")):
        op.execute(
            f"SELECT setval('{name}', GREATEST(COALESCE((SELECT MAX(seq) FROM {table}), 1), 1), EXISTS (SELECT 1 FROM {table}))"
        )


def downgrade() -> None:
    op.execute("DROP SEQUENCE IF EXISTS message_seq")
    op.execute("DROP SEQUENCE IF EXISTS task_seq")
    op.execute("DROP SEQUENCE IF EXISTS agent_seq")
