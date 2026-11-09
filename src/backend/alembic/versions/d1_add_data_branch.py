"""add data_branch to assets and connections

Revision ID: d1_data_branch
Revises: c5_merge_cv2_b8
Create Date: 2026-11-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1_data_branch'
down_revision: Union[str, None] = 'c5_merge_cv2_b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Mark assets and connections with where their data lives (uc, internal, external)."""
    op.add_column('assets', sa.Column('data_branch', sa.String(), nullable=True))
    op.create_index(op.f('ix_assets_data_branch'), 'assets', ['data_branch'], unique=False)
    op.add_column('connections', sa.Column('data_branch', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('connections', 'data_branch')
    op.drop_index(op.f('ix_assets_data_branch'), table_name='assets')
    op.drop_column('assets', 'data_branch')
