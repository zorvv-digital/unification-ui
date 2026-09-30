import uuid
from typing import Optional, Any
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import Column, Date, DateTime, String, Table, Text, Boolean, Integer, ForeignKey, Uuid, JSON, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


_last_timestamp = datetime.min.replace(tzinfo=timezone.utc)


def utcnow() -> datetime:
    """
    Current UTC time, strictly increasing within the process. Windows clocks tick every ~15 ms, so two rows
    created back to back (a customer message and an instant AI reply) could otherwise share a timestamp and sort
    in either order.
    """
    # ponytail: per-process guarantee only; add a sequence column if several workers write the same conversation.
    global _last_timestamp
    _last_timestamp = max(datetime.now(timezone.utc), _last_timestamp + timedelta(microseconds=1))
    return _last_timestamp


class BaseModelMixin(Base):
    """
    Abstract Base Model Mixin providing UUID primary key, created_at, and updated_at timestamps.
    """
    __abstract__ = True
    __mapper_args__ = {"eager_defaults": True}

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Python-side default keeps microseconds; SQLite's now() only has whole seconds, which breaks ordering.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Workspace(BaseModelMixin):
    __tablename__ = "workspaces"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class User(BaseModelMixin):
    __tablename__ = "users"

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    workspace: Mapped["Workspace"] = relationship("Workspace", lazy="joined")


class Channel(BaseModelMixin):
    """
    A connected messaging channel. `config` holds adapter-specific settings and secrets and is never returned by the API.
    """
    __tablename__ = "channels"

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    adapter_type: Mapped[str] = mapped_column(String(30), nullable=False, default="simulated")
    config: Mapped[Any] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="connected")
    ai_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ai_agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)


# Rows are deleted explicitly (tag delete, merge, demo reset): SQLite runs without enforced foreign keys.
contact_tags = Table(
    "contact_tags",
    Base.metadata,
    Column("contact_id", Uuid(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Uuid(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(BaseModelMixin):
    """A workspace label for contacts. `name_key` (lowercased name) makes names unique ignoring case."""
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("workspace_id", "name_key"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    name_key: Mapped[str] = mapped_column(String(50), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6b7280")


class Product(BaseModelMixin):
    """A product or service the business sells; the decision model tags contacts interested in it."""
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("workspace_id", "name_key"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    name_key: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    keywords: Mapped[Any] = mapped_column(JSON, nullable=False, default=list)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6b7280")


class ContactProduct(Base):
    """
    A contact's interest in a product. `source` is `ai` or `staff`; `dismissed` marks one staff removed,
    which the decision model must never add back.
    """
    __tablename__ = "contact_products"

    contact_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    confidence: Mapped[Optional[float]] = mapped_column(nullable=True)
    dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    product: Mapped["Product"] = relationship("Product", lazy="joined")

    # Flattened for ContactProductInterest.
    @property
    def name(self) -> str:
        return self.product.name

    @property
    def color(self) -> str:
        return self.product.color


class Contact(BaseModelMixin):
    """A customer. `consent` is marketing consent: `opted_in`, `opted_out`, or `unknown`."""
    __tablename__ = "contacts"

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    birthday: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    anniversary: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consent: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    consent_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    product_classified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    tags: Mapped[list["Tag"]] = relationship("Tag", secondary=contact_tags, lazy="selectin", order_by="Tag.name")
    product_links: Mapped[list["ContactProduct"]] = relationship(
        "ContactProduct", lazy="selectin", cascade="all, delete-orphan", passive_deletes=True
    )

    def __init__(self, **kwargs):
        # Initialized (empty) collections: serializing a just-created contact must not trigger an async lazy load.
        kwargs.setdefault("tags", [])
        kwargs.setdefault("product_links", [])
        super().__init__(**kwargs)

    @property
    def product_interests(self) -> list["ContactProduct"]:
        return sorted((link for link in self.product_links if not link.dismissed), key=lambda link: link.product.name.lower())

    @property
    def product_status(self) -> str:
        if self.product_interests:
            return "determined"
        return "not_determined" if self.product_classified_at else "pending"


class Segment(BaseModelMixin):
    """A saved, dynamic group of contacts; `rules` follow `SegmentRules` and are evaluated whenever used."""
    __tablename__ = "segments"
    __table_args__ = (UniqueConstraint("workspace_id", "name_key"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_key: Mapped[str] = mapped_column(String(100), nullable=False)
    rules: Mapped[Any] = mapped_column(JSON, nullable=False, default=dict)


class Conversation(BaseModelMixin):
    """
    One customer's thread on one channel. `external_id` is the customer's id on that channel (the thread id for email).
    In `ai` mode the channel's agent answers inbound messages; `needs_human` flags an escalation.
    """
    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("channel_id", "external_id"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    channel_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(String(30), nullable=False)
    external_id: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(998), nullable=True)  # email threads
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    unread_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_message_preview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(10), nullable=False, default="human")
    needs_human: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    contact: Mapped["Contact"] = relationship("Contact", lazy="joined")
    channel: Mapped["Channel"] = relationship("Channel", lazy="joined")


class Message(BaseModelMixin):
    """
    A single message. `external_id` is the channel-side message id, used to ignore duplicate webhook deliveries.
    """
    __tablename__ = "messages"
    __table_args__ = (UniqueConstraint("conversation_id", "external_id"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    platform: Mapped[str] = mapped_column(String(30), nullable=False)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False, default="text")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="sent")
    external_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    author: Mapped[str] = mapped_column(String(10), nullable=False, default="staff")


class Agent(BaseModelMixin):
    """
    A workspace AI agent. Its behavior lives in versions; `active_version_number` selects the live one.
    """
    __tablename__ = "agents"

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    business_profile: Mapped[Any] = mapped_column(JSON, nullable=False, default=dict)
    active_version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AgentVersion(BaseModelMixin):
    __tablename__ = "agent_versions"
    __table_args__ = (UniqueConstraint("agent_id", "version_number"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    greeting_message: Mapped[str] = mapped_column(Text, nullable=False)
    personality: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rules: Mapped[Any] = mapped_column(JSON, nullable=False, default=list)
    skills: Mapped[Any] = mapped_column(JSON, nullable=False, default=list)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class KnowledgeItem(BaseModelMixin):
    __tablename__ = "knowledge_items"

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="General")
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class AgentKnowledge(BaseModelMixin):
    __tablename__ = "agent_knowledge"
    __table_args__ = (UniqueConstraint("agent_id", "knowledge_item_id"),)

    agent_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    knowledge_item_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("knowledge_items.id", ondelete="CASCADE"), nullable=False)


class PlaygroundMessage(BaseModelMixin):
    __tablename__ = "playground_messages"

    workspace_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
