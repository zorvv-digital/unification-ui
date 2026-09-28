import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

# Extended by later channel changes (gmail, website, ...).
Platform = Literal["whatsapp", "instagram", "messenger"]
ConversationStatus = Literal["open", "closed"]
ConversationMode = Literal["ai", "human"]
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
    ai_enabled: bool
    ai_agent_id: Optional[uuid.UUID] = None
    model_config = ConfigDict(from_attributes=True)


class ChannelUpdate(BaseModel):
    """AI auto-reply settings. Enabling needs an agent, either given here or already set."""
    ai_enabled: Optional[bool] = None
    ai_agent_id: Optional[uuid.UUID] = None


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
    mode: ConversationMode
    needs_human: bool
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
    author: Literal["customer", "staff", "agent"]
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
    """Change status, mode, or both. Setting `mode` clears the needs-human flag."""
    status: Optional[ConversationStatus] = None
    mode: Optional[ConversationMode] = None


class SuggestReplyResponse(BaseModel):
    suggestion: str


class SimulateCustomerRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


# ==========================================
# AI agents, knowledge, and playground
# ==========================================

UiType = Literal["text", "textarea", "select", "multiselect"]
VersionSource = Literal["generated", "manual", "feedback"]


class BusinessProfile(BaseModel):
    business_name: str = Field(min_length=1, max_length=255)
    business_type: str = Field(min_length=1, max_length=255)
    location: Optional[str] = None
    offerings: list[str] = Field(default_factory=list)
    working_hours: Optional[str] = None


class ProfilerField(BaseModel):
    field_id: str
    question_text: str
    ui_type: UiType
    options: Optional[list[str]] = None
    is_required: bool


class ProfilerOutput(BaseModel):
    """LLM output: follow-up onboarding questions."""
    fields: list[ProfilerField]


class AgentSetup(BaseModel):
    agent_name: Optional[str] = None
    personality: Optional[str] = None
    business_objective: Optional[str] = None
    rules: list[str] = Field(default_factory=list)


class AgentGenerateRequest(BaseModel):
    business_profile: BusinessProfile
    collected_answers: dict[str, Any] = Field(default_factory=dict)
    agent_setup: Optional[AgentSetup] = None


class AgentSkill(BaseModel):
    skill_name: str
    description: str


class BuilderOutput(BaseModel):
    """LLM output: a generated agent."""
    agent_name: str
    system_prompt: str
    greeting_message: str
    skills: list[AgentSkill] = Field(default_factory=list)


class RefineOutput(BaseModel):
    """LLM output: a revised system prompt."""
    system_prompt: str


class AgentVersionResponse(BaseModel):
    id: uuid.UUID
    version_number: int
    system_prompt: str
    greeting_message: str
    personality: Optional[str] = None
    rules: list[str]
    skills: list[AgentSkill]
    source: VersionSource
    feedback: Optional[str] = None
    is_active: bool = False
    created_at: UtcDatetime
    model_config = ConfigDict(from_attributes=True)


class AgentResponse(BaseModel):
    id: uuid.UUID
    name: str
    active_version_number: int
    active_version: AgentVersionResponse
    knowledge_ids: list[uuid.UUID]


class AgentSummary(BaseModel):
    id: uuid.UUID
    name: str
    active_version_number: int
    model_config = ConfigDict(from_attributes=True)


class AgentRename(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class AgentVersionCreate(BaseModel):
    """Manual edit: omitted fields are copied from the active version."""
    system_prompt: Optional[str] = Field(None, min_length=1)
    greeting_message: Optional[str] = Field(None, min_length=1)
    personality: Optional[str] = None
    rules: Optional[list[str]] = None
    skills: Optional[list[AgentSkill]] = None


class RefineRequest(BaseModel):
    feedback: str = Field(min_length=1, max_length=2000)


class KnowledgeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    category: str = Field("General", max_length=100)
    description: str = Field("", max_length=500)
    content: str = Field(min_length=1, max_length=20000)
    enabled: bool = True


class KnowledgeUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    category: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = Field(None, min_length=1, max_length=20000)
    enabled: Optional[bool] = None


class KnowledgeResponse(BaseModel):
    id: uuid.UUID
    title: str
    category: str
    description: str
    content: str
    enabled: bool
    model_config = ConfigDict(from_attributes=True)


class PlaygroundChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: Optional[str] = Field(None, max_length=64)
    version_number: Optional[int] = None


class PlaygroundChatResponse(BaseModel):
    reply: str
    session_id: str
    version_number: int
