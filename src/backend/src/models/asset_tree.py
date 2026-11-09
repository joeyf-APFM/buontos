from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class AssetTreeNode(BaseModel):
    """One node of the Asset Explorer tree, loaded one level at a time."""
    key: str                 # node key: branch:<b>, asset:<uuid>, group:<uuid>:<Type>, category:<c>, type:<Type>
    label: str
    kind: Literal["branch", "type", "asset", "group"]
    asset_id: Optional[UUID] = None
    asset_type_name: Optional[str] = None
    count: int               # readable assets under this node (an asset node not counting itself)
    has_children: bool
