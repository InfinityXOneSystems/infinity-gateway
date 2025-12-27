"""add indexes for tasks attempts

Revision ID: 0002_add_indexes
Revises: 0001_initial
Create Date: 2025-12-27 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0002_add_indexes'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade():
    # create an index on tasks.attempts if not exists
    try:
        op.create_index('ix_tasks_attempts', 'tasks', ['attempts'])
    except Exception:
        pass


def downgrade():
    try:
        op.drop_index('ix_tasks_attempts', table_name='tasks')
    except Exception:
        pass
