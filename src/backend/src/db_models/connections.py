import uuid
from sqlalchemy import Column, String, Text, Boolean, TIMESTAMP, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func

from src.common.database import Base


class ConnectionDb(Base):
    """A configured connection to an external data platform (BigQuery, Databricks, etc.)."""
    __tablename__ = "connections"

    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False, unique=True, index=True)
    connector_type = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    config = Column(JSON, nullable=False, default=dict)
    enabled = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)
    data_branch = Column(String, nullable=True)  # internal | external; stamped on imported assets
    system_asset_id = Column(
        PG_UUID(as_uuid=True),
        ForeignKey("assets.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_by = Column(String, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("name", name="uq_connections_name"),
    )

    def __repr__(self):
        return f"<ConnectionDb(id={self.id}, name='{self.name}', type='{self.connector_type}')>"
