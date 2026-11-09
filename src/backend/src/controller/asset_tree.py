"""The Asset Explorer tree: node keys, what each node scopes the asset list to, and its children.

The tree is loaded one level at a time. Each node has a key (see ``parse_node_key``); the same key
scopes ``GET /api/assets?node=`` to the node and everything under it. Hierarchy comes from
``asset_relationships`` rows whose type is in ``TREE_RELS``.
"""

from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence
from uuid import UUID

from sqlalchemy import Integer, Select, and_, case, distinct, exists, func, literal_column, select, true
from sqlalchemy.orm import Session, aliased

from src.db_models.assets import AssetDb, AssetRelationshipDb, AssetTypeDb
from src.models.asset_tree import AssetTreeNode
from src.models.assets import METRIC_VIEW_ASSET_TYPE, VOLUME_ASSET_TYPE, DataBranch

TREE_RELS = frozenset({"hasCatalog", "hasSchema", "hasTable", "hasView", "hasVolume", "hasPart"})
CONTAINER_TYPES = ("System", "Catalog", "Schema")
SCHEMA_GROUP_ORDER = ("Table", "View", VOLUME_ASSET_TYPE, METRIC_VIEW_ASSET_TYPE)
EXCLUDED_FROM_SCOPE = frozenset({"Column", "Logical Attribute"})
MAX_DEPTH = 12

UNSORTED = "unsorted"
BRANCHES = tuple(b.value for b in DataBranch)
BRANCH_LABELS = {"uc": "Unity Catalog", "internal": "Internal", "external": "External", UNSORTED: "Unsorted"}
GROUP_LABELS = {"Table": "Tables", "View": "Views", VOLUME_ASSET_TYPE: "Volumes", METRIC_VIEW_ASSET_TYPE: "Metric Views"}
CATEGORIES = ("analytics", "integration", "system", "custom")
DATA_CATEGORY = "data"
SCHEMA_TYPE = "Schema"

_TREE_RELS = sorted(TREE_RELS)
_EXCLUDED = sorted(EXCLUDED_FROM_SCOPE)


@dataclass(frozen=True)
class NodeKey:
    kind: str  # branch | asset | group | category | type
    branch: Optional[str] = None
    asset_id: Optional[UUID] = None
    type_name: Optional[str] = None
    category: Optional[str] = None


def parse_node_key(key: str) -> NodeKey:
    """Parse a tree node key; raises ValueError for anything outside the grammar."""
    kind, sep, rest = (key or "").partition(":")
    if not sep or not rest:
        raise ValueError(f"Bad tree node key: {key!r}")
    if kind == "branch" and rest in BRANCHES + (UNSORTED,):
        return NodeKey("branch", branch=rest)
    if kind == "asset":
        return NodeKey("asset", asset_id=_parse_uuid(rest, key))
    if kind == "group":
        schema_id, _, type_name = rest.partition(":")
        if type_name in SCHEMA_GROUP_ORDER:
            return NodeKey("group", asset_id=_parse_uuid(schema_id, key), type_name=type_name)
    if kind == "category" and rest in CATEGORIES:
        return NodeKey("category", category=rest)
    if kind == "type":
        return NodeKey("type", type_name=rest)
    raise ValueError(f"Bad tree node key: {key!r}")


def _parse_uuid(text: str, key: str) -> UUID:
    try:
        return UUID(text)
    except ValueError:
        raise ValueError(f"Bad tree node key: {key!r}") from None


def _in_scope(*conditions) -> Select:
    """SELECT assets.id for assets matching ``conditions``, never columns or logical attributes."""
    return (
        select(AssetDb.id)
        .join(AssetTypeDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetTypeDb.name.notin_(_EXCLUDED), *conditions)
        .correlate(None)
    )


def _direct_children(parent_id: UUID) -> Select:
    rel = AssetRelationshipDb
    return select(rel.target_asset_id).where(
        rel.source_asset_id == parent_id, rel.relationship_type.in_(_TREE_RELS),
    )


def _descendants(root_ids: Sequence[UUID]):
    """Recursive CTE (root, via, id, depth): each root, and every asset under it to MAX_DEPTH.

    ``via`` is the root's direct child the row was reached through (the root itself at depth 0).
    UNION plus the depth bound keeps a cycle in the hierarchy from recursing forever.
    """
    base = (
        select(
            AssetDb.id.label("root"), AssetDb.id.label("via"), AssetDb.id.label("id"),
            literal_column("0", Integer).label("depth"),
        )
        .where(AssetDb.id.in_(list(root_ids)))
        .cte("tree_descendants", recursive=True)
    )
    rel = AssetRelationshipDb
    step = (
        select(
            base.c.root,
            case((base.c.depth == 0, rel.target_asset_id), else_=base.c.via),
            rel.target_asset_id,
            base.c.depth + literal_column("1", Integer),
        )
        .select_from(rel)
        .join(base, rel.source_asset_id == base.c.id)
        .where(rel.relationship_type.in_(_TREE_RELS), base.c.depth < MAX_DEPTH)
    )
    return base.union(step)


def _readable(column, restrict_to_ids: Optional[Iterable[UUID]]):
    return true() if restrict_to_ids is None else column.in_(list(restrict_to_ids))


def scope_subquery(db: Session, key: str) -> Select:
    """SELECT assets.id for the node and everything under it. ``db`` is unused; the query is lazy."""
    node = parse_node_key(key)
    if node.kind == "branch":
        if node.branch == UNSORTED:
            return _in_scope(AssetDb.data_branch.is_(None), AssetTypeDb.category == DATA_CATEGORY)
        return _in_scope(AssetDb.data_branch == node.branch)
    if node.kind == "asset":
        tree = _descendants([node.asset_id])
        return _in_scope(AssetDb.id.in_(select(tree.c.id)))
    if node.kind == "group":
        return _in_scope(AssetTypeDb.name == node.type_name, AssetDb.id.in_(_direct_children(node.asset_id)))
    if node.kind == "category":
        return _in_scope(AssetTypeDb.category == node.category)
    return _in_scope(AssetTypeDb.name == node.type_name)


def tree_children(db: Session, parent: Optional[str], restrict_to_ids: Optional[List[UUID]]) -> List[AssetTreeNode]:
    """The children of ``parent`` (the root when None), with counts limited to ``restrict_to_ids``."""
    if parent is None:
        return _root_children(db, restrict_to_ids)
    node = parse_node_key(parent)
    if node.kind == "branch" and node.branch != UNSORTED:
        return _branch_children(db, node.branch, restrict_to_ids)
    if node.kind == "asset":
        return _asset_children(db, node.asset_id, restrict_to_ids)
    if node.kind == "category":
        return _category_children(db, node.category, restrict_to_ids)
    return []


def _root_children(db, restrict_to_ids) -> List[AssetTreeNode]:
    rows = db.execute(
        select(AssetDb.data_branch, AssetTypeDb.category, func.count(AssetDb.id))
        .join(AssetTypeDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetTypeDb.name.notin_(_EXCLUDED), _readable(AssetDb.id, restrict_to_ids))
        .group_by(AssetDb.data_branch, AssetTypeDb.category)
    ).all()
    counts = dict.fromkeys(BRANCHES + (UNSORTED,), 0)
    for branch, category, count in rows:
        if branch in BRANCHES:
            counts[branch] += count
        elif branch is None and category == DATA_CATEGORY:
            counts[UNSORTED] += count
    return [
        AssetTreeNode(key=f"branch:{b}", label=BRANCH_LABELS[b], kind="branch",
                      count=counts[b], has_children=b != UNSORTED)
        for b in BRANCHES + (UNSORTED,)
        if b != UNSORTED or counts[b] > 0
    ]


def _branch_children(db, branch: str, restrict_to_ids) -> List[AssetTreeNode]:
    """Containers in the branch with no tree parent in the same branch."""
    rel, parent = AssetRelationshipDb, aliased(AssetDb)
    has_parent_in_branch = exists().where(
        rel.target_asset_id == AssetDb.id,
        rel.relationship_type.in_(_TREE_RELS),
        rel.source_asset_id == parent.id,
        parent.data_branch == branch,
    )
    rows = db.execute(
        select(AssetDb.id, AssetDb.name, AssetTypeDb.name)
        .join(AssetTypeDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetDb.data_branch == branch, AssetTypeDb.name.in_(CONTAINER_TYPES), ~has_parent_in_branch)
    ).all()
    return _asset_nodes(db, rows, restrict_to_ids)


def _asset_children(db, asset_id: UUID, restrict_to_ids) -> List[AssetTreeNode]:
    type_name = db.execute(
        select(AssetTypeDb.name)
        .join(AssetDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetDb.id == asset_id)
    ).scalar_one_or_none()
    if type_name is None:
        return []
    if type_name == SCHEMA_TYPE:
        return _group_nodes(db, asset_id, restrict_to_ids)
    rows = db.execute(
        select(AssetDb.id, AssetDb.name, AssetTypeDb.name)
        .join(AssetTypeDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetDb.id.in_(_direct_children(asset_id)), AssetTypeDb.name.in_(CONTAINER_TYPES))
    ).all()
    return _asset_nodes(db, rows, restrict_to_ids)


def _asset_nodes(db, rows, restrict_to_ids) -> List[AssetTreeNode]:
    """Asset nodes for (id, name, type name) rows, counted with one grouped query over their subtrees."""
    if not rows:
        return []
    tree = _descendants([r[0] for r in rows])
    member, member_type = aliased(AssetDb), aliased(AssetTypeDb)
    via, via_type = aliased(AssetDb), aliased(AssetTypeDb)
    readable = and_(member_type.name.notin_(_EXCLUDED), _readable(member.id, restrict_to_ids))
    # A non-schema lists child containers; it has children if one of them would be listed.
    lists_container = and_(tree.c.depth >= 1, via_type.name.in_(CONTAINER_TYPES), readable)
    # A schema lists type groups; it has children if a direct child of a group type is readable.
    lists_group = and_(tree.c.depth == 1, member_type.name.in_(SCHEMA_GROUP_ORDER), readable)
    stats = {
        root: (count, bool(container), bool(group))
        for root, count, container, group in db.execute(
            select(
                tree.c.root,
                func.count(distinct(case((readable, tree.c.id)))),
                func.max(case((lists_container, 1), else_=0)),
                func.max(case((lists_group, 1), else_=0)),
            )
            .select_from(tree)
            .join(member, member.id == tree.c.id)
            .join(member_type, member.asset_type_id == member_type.id)
            .join(via, via.id == tree.c.via)
            .join(via_type, via.asset_type_id == via_type.id)
            .group_by(tree.c.root)
        ).all()
    }
    nodes = []
    for asset_id, name, type_name in rows:
        count, has_container, has_group = stats.get(asset_id, (0, False, False))
        if restrict_to_ids is not None and count == 0:
            continue
        nodes.append(AssetTreeNode(
            key=f"asset:{asset_id}", label=name, kind="asset", asset_id=asset_id,
            asset_type_name=type_name, count=count,
            has_children=has_group if type_name == SCHEMA_TYPE else has_container,
        ))
    return sorted(nodes, key=lambda n: n.label.lower())


def _group_nodes(db, schema_id: UUID, restrict_to_ids) -> List[AssetTreeNode]:
    counts = dict(db.execute(
        select(AssetTypeDb.name, func.count(AssetDb.id))
        .join(AssetDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(
            AssetDb.id.in_(_direct_children(schema_id)),
            AssetTypeDb.name.in_(SCHEMA_GROUP_ORDER),
            _readable(AssetDb.id, restrict_to_ids),
        )
        .group_by(AssetTypeDb.name)
    ).all())
    return [
        AssetTreeNode(key=f"group:{schema_id}:{t}", label=GROUP_LABELS[t], kind="group",
                      asset_type_name=t, count=counts[t], has_children=False)
        for t in SCHEMA_GROUP_ORDER
        if counts.get(t, 0) > 0
    ]


def _category_children(db, category: str, restrict_to_ids) -> List[AssetTreeNode]:
    rows = db.execute(
        select(AssetTypeDb.name, func.count(AssetDb.id))
        .select_from(AssetTypeDb)
        .outerjoin(AssetDb, and_(
            AssetDb.asset_type_id == AssetTypeDb.id, _readable(AssetDb.id, restrict_to_ids),
        ))
        .where(AssetTypeDb.category == category, AssetTypeDb.name.notin_(_EXCLUDED))
        .group_by(AssetTypeDb.name)
    ).all()
    nodes = [
        AssetTreeNode(key=f"type:{name}", label=name, kind="type", asset_type_name=name,
                      count=count, has_children=False)
        for name, count in rows
    ]
    return sorted(nodes, key=lambda n: n.label.lower())
