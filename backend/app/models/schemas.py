import uuid
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

# Extended by later channel changes (gmail, website, ...).
Platform = Literal["whatsapp", "instagram", "messenger"]
ConversationStatus = Literal["open", "closed"]
MessageType = Literal["text", "image", "video", "audio", "file", "emoji"]

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _to_utc_iso(value: datetime) -> str:
    """SQLite returns naive datetimes; they are stored as UTC, so tag them before serializing."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


UtcDatetime = Annotated[datetime, PlainSerializer(_to_utc_iso, return_type=str)]


class HealthResponse(BaseModel):
    status: str


# ==========================================
# Auth
# ==========================================

class RegisterRequest(BaseModel):
    workspace_name: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    email: str = Field(pattern=EMAIL_PATTERN, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class WorkspaceResponse(BaseModel):
    id: uuid.UUID
    name: str
    is_demo: bool
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    workspace: WorkspaceResponse
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# Channels
# ==========================================

class ChannelResponse(BaseModel):
    id: uuid.UUID
    platform: str
    name: str
    adapter_type: str
    status: str
    model_config = ConfigDict(from_attributes=True)


class SimulatedInbound(BaseModel):
    """Inbound event format accepted by the simulated adapter's webhook."""
    customer_id: str = Field(min_length=1, max_length=255)
    name: Optional[str] = None
    message_id: Optional[str] = None
    type: MessageType = "text"
    content: str

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be empty")
        return value


class WebhookResult(BaseModel):
    received: int


# ==========================================
# Inbox
# ==========================================

class ContactResponse(BaseModel):
    id: uuid.UUID
    name: str
    username: Optional[str] = None
    avatar: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class ContactDetailResponse(ContactResponse):
    conversation_ids: list[uuid.UUID]


class ConversationResponse(BaseModel):
    id: uuid.UUID
    platform: str
    channel_id: uuid.UUID
    external_id: str
    status: str
    unread_count: int
    last_message_at: Optional[UtcDatetime] = None
    last_message_preview: Optional[str] = None
    contact: ContactResponse
    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    id: uuid.UUID
    conversation_id: uuid.UUID
    platform: str
    direction: str
    type: str
    content: str
    status: str
    external_id: Optional[str] = None
    timestamp: UtcDatetime = Field(validation_alias="created_at")
    model_config = ConfigDict(from_attributes=True)


class MessageCreate(BaseModel):
    content: str
    type: MessageType = "text"

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be empty")
        return value.strip()


class ConversationUpdate(BaseModel):
    status: ConversationStatus
