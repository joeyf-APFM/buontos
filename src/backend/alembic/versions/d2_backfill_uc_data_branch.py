"""backfill the uc data branch on existing Databricks assets

Revision ID: d2_backfill_uc_branch
Revises: d1_data_branch
Create Date: 2026-11-09 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd2_backfill_uc_branch'
down_revision: Union[str, None] = 'd1_data_branch'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# What a Databricks import stamps (SchemaImportManager._branch_for): its assets are
# Unity Catalog, except the connection's System asset. A branch already set is kept.
BACKFILL_UC_BRANCH_SQL = (
    "UPDATE assets SET data_branch = 'uc' "
    "WHERE platform = 'databricks' "
    "AND data_branch IS NULL "
    "AND NOT EXISTS ("
    "SELECT 1 FROM asset_types "
    "WHERE asset_types.id = assets.asset_type_id AND asset_types.name = 'System')"
)


def upgrade() -> None:
    """Mark assets imported before d1_data_branch as Unity Catalog."""
    op.execute(BACKFILL_UC_BRANCH_SQL)


def downgrade() -> None:
    """No-op: backfilled rows can't be told from ones an import stamped, and
    d1_data_branch's downgrade drops the column anyway."""
