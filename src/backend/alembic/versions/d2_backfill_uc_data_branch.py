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

# What a Databricks import stamps (SchemaImportManager._branch_for): its physical Unity
# Catalog types are "uc"; its System, functions, models and logical entities/attributes
# get no branch. A branch already set is kept. Mirrors src.models.assets.UC_BRANCH_ASSET_TYPES
# (spelled out: a migration doesn't import app code).
UC_BRANCH_TYPES = ("Catalog", "Schema", "Table", "View", "Metric View", "Volume", "Column")

BACKFILL_UC_BRANCH_SQL = (
    "UPDATE assets SET data_branch = 'uc' "
    "WHERE platform = 'databricks' "
    "AND data_branch IS NULL "
    "AND EXISTS ("
    "SELECT 1 FROM asset_types "
    "WHERE asset_types.id = assets.asset_type_id "
    "AND asset_types.name IN (" + ", ".join(f"'{name}'" for name in UC_BRANCH_TYPES) + "))"
)


def upgrade() -> None:
    """Mark Unity Catalog objects imported before d1_data_branch as Unity Catalog."""
    op.execute(BACKFILL_UC_BRANCH_SQL)


def downgrade() -> None:
    """No-op: backfilled rows can't be told from ones an import stamped, and
    d1_data_branch's downgrade drops the column anyway."""
