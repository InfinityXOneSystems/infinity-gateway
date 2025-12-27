"""initial migration

Revision ID: 0001_initial
Revises: 
Create Date: 2025-12-27
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'tasks',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('agent', sa.String(), nullable=True),
        sa.Column('command', sa.Text(), nullable=True),
        sa.Column('meta', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('attempts', sa.Integer(), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.Float(), nullable=True),
        sa.Column('updated_at', sa.Float(), nullable=True),
    )
    op.create_table(
        'processed',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('agent', sa.String(), nullable=True),
        sa.Column('command', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('ts', sa.Float(), nullable=True),
    )
    op.create_table(
        'agents',
        sa.Column('name', sa.String(), primary_key=True),
        sa.Column('endpoint', sa.String(), nullable=True),
        sa.Column('meta', sa.Text(), nullable=True),
        sa.Column('registered_at', sa.Float(), nullable=True),
    )


def downgrade():
    op.drop_table('agents')
    op.drop_table('processed')
    op.drop_table('tasks')
