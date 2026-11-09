"""The Asset Explorer tree: node keys, what each node scopes the asset list to, and its children.

The tree is loaded one level at a time. Each node has a key (see ``parse_node_key``); the same key
scopes ``GET /api/assets?node=`` to the node and everything under it. Hierarchy comes from
``entity_relationships`` rows whose type is in ``TREE_RELS`` and whose two ends are both assets:
that is where an import's Catalog -> Schema -> Table/View -> Column links are kept
(``asset_relationships`` lacks them in real data).

What a node lists as children depends on its type: a Schema its tables, views, metric views and
volumes; a table-like asset its columns; a Column or Volume nothing; anything else (System,
Catalog) its child containers. Columns are in a node's scope only under a table-like asset or a
Column itself, and each asset node's count is the size of its scope.
"""

from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence
from uuid import UUID

from sqlalchemy import (
    Integer, Select, String, Text, and_, case, cast, distinct, exists, func, literal_column, or_, select,
    literal, true,
)
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, aliased
from sqlalchemy.sql.functions import FunctionElement

from src.db_models.assets import AssetDb, AssetTypeDb
from src.db_models.entity_relationships import EntityRelationshipDb
from src.models.asset_tree import AssetTreeNode
from src.models.assets import (
    METRIC_VIEW_ASSET_TYPE, PHYSICAL_TABLE_ASSET_TYPES, VOLUME_ASSET_TYPE, DataBranch,
)

TREE_RELS = frozenset({"hasCatalog", "hasSchema", "hasTable", "hasView", "hasVolume", "hasPart", "hasColumn"})
CONTAINER_TYPES = ("System", "Catalog", "Schema")
SCHEMA_TYPE = "Schema"
COLUMN_TYPE = "Column"
# What a Schema lists; also the type names a legacy ``group:`` key may carry.
SCHEMA_CHILD_TYPES = ("Table", "View", VOLUME_ASSET_TYPE, METRIC_VIEW_ASSET_TYPE)
# Table-like assets list their columns, and their scope includes them.
COLUMN_PARENT_TYPES = PHYSICAL_TABLE_ASSET_TYPES
LEAF_TYPES = (COLUMN_TYPE, VOLUME_ASSET_TYPE)
EXCLUDED_FROM_SCOPE = frozenset({COLUMN_TYPE, "Logical Attribute"})
MAX_DEPTH = 12

UNSORTED = "unsorted"
BRANCHES = tuple(b.value for b in DataBranch)
BRANCH_LABELS = {"uc": "Unity Catalog", "internal": "Internal", "external": "External", UNSORTED: "Unsorted"}
CATEGORIES = ("analytics", "integration", "system", "custom")
DATA_CATEGORY = "data"

_TREE_RELS = sorted(TREE_RELS)
_EXCLUDED = sorted(EXCLUDED_FROM_SCOPE)
_COLUMN_SCOPED = (*COLUMN_PARENT_TYPES, COLUMN_TYPE)


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
        if type_name in SCHEMA_CHILD_TYPES:
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


class _uuid_text(FunctionElement):
    """A UUID column as the dashed lowercase text entity_relationships stores (``str(uuid)``)."""

    type = String()
    name = "uuid_text"
    inherit_cache = True


@compiles(_uuid_text)
def _uuid_text_default(element, compiler, **kw):
    # Postgres prints a uuid as dashed lowercase hex.
    (column,) = element.clauses
    return compiler.process(cast(column, Text), **kw)


@compiles(_uuid_text, "sqlite")
def _uuid_text_sqlite(element, compiler, **kw):
    # On SQLite the UUID type stores 32 lowercase hex digits without dashes.
    (column,) = element.clauses
    col = compiler.process(column, **kw)
    parts = [f"substr({col}, {start}, {length})" for start, length in ((1, 8), (9, 4), (13, 4), (17, 4), (21, 12))]
    return "(" + " || '-' || ".join(parts) + ")"


_rel = EntityRelationshipDb
_IS_TREE_REL = _rel.relationship_type.in_(_TREE_RELS)


def _in_scope_of(node_type, member_type):
    """Whether an asset of type ``member_type`` under a node of type ``node_type`` is in its scope.

    Never a logical attribute; a column only under a table-like asset or a column node.
    """
    return or_(
        member_type.notin_(_EXCLUDED),
        and_(member_type == COLUMN_TYPE, node_type.in_(_COLUMN_SCOPED)),
    )


def _lists(parent_type, child_type):
    """Whether a node of type ``parent_type`` lists a direct child of type ``child_type``."""
    return or_(
        and_(parent_type == SCHEMA_TYPE, child_type.in_(SCHEMA_CHILD_TYPES)),
        and_(parent_type.in_(COLUMN_PARENT_TYPES), child_type == COLUMN_TYPE),
        and_(
            parent_type.notin_((SCHEMA_TYPE, *COLUMN_PARENT_TYPES, *LEAF_TYPES)),
            child_type.in_(CONTAINER_TYPES),
        ),
    )


def _in_scope(*conditions, node_type=None) -> Select:
    """SELECT assets.id for assets matching ``conditions``, within the scope of a ``node_type`` node.

    Without ``node_type``, never columns or logical attributes.
    """
    in_scope = AssetTypeDb.name.notin_(_EXCLUDED) if node_type is None else _in_scope_of(node_type, AssetTypeDb.name)
    return (
        select(AssetDb.id)
        .join(AssetTypeDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(in_scope, *conditions)
        .correlate(None)
    )


def _type_of(asset_id: UUID):
    """The type name of the asset ``asset_id``, as a scalar subquery."""
    node, node_type = aliased(AssetDb), aliased(AssetTypeDb)
    return (
        select(node_type.name)
        .join(node, node.asset_type_id == node_type.id)
        .where(node.id == asset_id)
        .correlate(None)
        .scalar_subquery()
    )


def _direct_children(parent_id: UUID) -> Select:
    """SELECT the ids of the assets directly under the asset ``parent_id``."""
    parent, child = aliased(AssetDb), aliased(AssetDb)
    return (
        select(child.id)
        .select_from(_rel)
        .join(parent, _rel.source_id == _uuid_text(parent.id))
        .join(child, _rel.target_id == _uuid_text(child.id))
        .where(_IS_TREE_REL, parent.id == parent_id)
        .correlate(None)
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
    child = aliased(AssetDb)
    step = (
        select(
            base.c.root,
            case((base.c.depth == 0, child.id), else_=base.c.via),
            child.id,
            base.c.depth + literal_column("1", Integer),
        )
        .select_from(_rel)
        .join(base, _rel.source_id == _uuid_text(base.c.id))
        .join(child, _rel.target_id == _uuid_text(child.id))
        .where(_IS_TREE_REL, base.c.depth < MAX_DEPTH)
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
        return _in_scope(AssetDb.id.in_(select(tree.c.id)), node_type=_type_of(node.asset_id))
    if node.kind == "group":  # a legacy key: the schema's direct children of one type
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
    parent = aliased(AssetDb)
    has_parent_in_branch = exists().where(
        _IS_TREE_REL,
        _rel.target_id == _uuid_text(AssetDb.id),
        _rel.source_id == _uuid_text(parent.id),
        parent.data_branch == branch,
    )
    rows = db.execute(
        select(AssetDb.id, AssetDb.name, AssetTypeDb.name)
        .join(AssetTypeDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetDb.data_branch == branch, AssetTypeDb.name.in_(CONTAINER_TYPES), ~has_parent_in_branch)
    ).all()
    return _asset_nodes(db, rows, restrict_to_ids)


def _asset_children(db, asset_id: UUID, restrict_to_ids) -> List[AssetTreeNode]:
    parent_type = db.execute(
        select(AssetTypeDb.name)
        .join(AssetDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetDb.id == asset_id)
    ).scalar_one_or_none()
    if parent_type is None:
        return []
    rows = db.execute(
        select(AssetDb.id, AssetDb.name, AssetTypeDb.name)
        .join(AssetTypeDb, AssetDb.asset_type_id == AssetTypeDb.id)
        .where(AssetDb.id.in_(_direct_children(asset_id)), _lists(literal(parent_type), AssetTypeDb.name))
    ).all()
    return _asset_nodes(db, rows, restrict_to_ids)


def _asset_nodes(db, rows, restrict_to_ids) -> List[AssetTreeNode]:
    """Asset nodes for (id, name, type name) rows, counted with one grouped query over their subtrees.

    A node's count is the readable assets in its scope; it has children if a child it lists
    would itself be listed, i.e. has a readable asset in the child's scope.
    """
    if not rows:
        return []
    tree = _descendants([r[0] for r in rows])
    root, root_type = aliased(AssetDb), aliased(AssetTypeDb)
    member, member_type = aliased(AssetDb), aliased(AssetTypeDb)
    via, via_type = aliased(AssetDb), aliased(AssetTypeDb)
    readable = _readable(member.id, restrict_to_ids)
    counted = and_(_in_scope_of(root_type.name, member_type.name), readable)
    lists_child = and_(
        tree.c.depth >= 1,
        _lists(root_type.name, via_type.name),
        _in_scope_of(via_type.name, member_type.name),
        readable,
    )
    stats = {
        root_id: (count, bool(has_child))
        for root_id, count, has_child in db.execute(
            select(
                tree.c.root,
                func.count(distinct(case((counted, tree.c.id)))),
                func.max(case((lists_child, 1), else_=0)),
            )
            .select_from(tree)
            .join(root, root.id == tree.c.root)
            .join(root_type, root.asset_type_id == root_type.id)
            .join(member, member.id == tree.c.id)
            .join(member_type, member.asset_type_id == member_type.id)
            .join(via, via.id == tree.c.via)
            .join(via_type, via.asset_type_id == via_type.id)
            .group_by(tree.c.root)
        ).all()
    }
    nodes = []
    for asset_id, name, type_name in rows:
        count, has_children = stats.get(asset_id, (0, False))
        if restrict_to_ids is not None and count == 0:
            continue
        nodes.append(AssetTreeNode(
            key=f"asset:{asset_id}", label=name, kind="asset", asset_id=asset_id,
            asset_type_name=type_name, count=count, has_children=has_children,
        ))
    return sorted(nodes, key=lambda n: n.label.lower())


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
