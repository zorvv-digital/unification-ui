import uuid
from datetime import date, datetime, timezone
from typing import Annotated, Any, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

# Extended by later channel changes (gmail, website, ...).
Platform = Literal["whatsapp", "instagram", "messenger", "gmail", "website"]
ConversationStatus = Literal["open", "closed"]
ConversationMode = Literal["ai", "human"]
MessageType = Literal["text", "image", "video", "audio", "file", "emoji", "template"]

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


class WhatsAppConnect(BaseModel):
    """Credentials from Meta's WhatsApp Manager / App Dashboard."""
    phone_number_id: str = Field(min_length=1, max_length=64)
    waba_id: str = Field(min_length=1, max_length=64)
    access_token: str = Field(min_length=1)
    app_secret: str = Field(min_length=1)
    name: Optional[str] = Field(None, max_length=255)


class MetaConnect(BaseModel):
    """A Facebook Page's access token (with messaging permissions) and the Meta app secret that signs webhooks."""
    page_id: str = Field(min_length=1, max_length=64)
    page_access_token: str = Field(min_length=1)
    app_secret: str = Field(min_length=1)


class GmailAuthorize(BaseModel):
    """Google sign-in URL; open it in the browser to connect a Gmail account."""
    authorize_url: str


class SyncResult(BaseModel):
    received: int


class WebhookInfo(BaseModel):
    """Values to paste into Meta's webhook configuration."""
    webhook_url: str
    verify_token: str


class ChannelConnectedResponse(ChannelResponse, WebhookInfo):
    pass


class TemplateResponse(BaseModel):
    name: str
    language: str
    category: str
    body: str
    parameter_count: int


class TemplateSend(BaseModel):
    name: str = Field(min_length=1)
    language: str = Field(min_length=1)
    parameters: list[str] = []


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

Consent = Literal["opted_in", "opted_out", "unknown"]
COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"


class TagResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    model_config = ConfigDict(from_attributes=True)


class ContactResponse(BaseModel):
    id: uuid.UUID
    name: str
    username: Optional[str] = None
    avatar: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    birthday: Optional[date] = None
    anniversary: Optional[date] = None
    notes: Optional[str] = None
    consent: Consent = "unknown"
    consent_changed_at: Optional[UtcDatetime] = None
    tags: list[TagResponse] = []
    model_config = ConfigDict(from_attributes=True)


class ContactDetailResponse(ContactResponse):
    conversation_ids: list[uuid.UUID]


class ConversationResponse(BaseModel):
    id: uuid.UUID
    platform: str
    channel_id: uuid.UUID
    external_id: str
    subject: Optional[str] = None
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


# ==========================================
# Website chat
# ==========================================

LeadField = Literal["name", "email", "phone"]
DOMAIN_PATTERN = r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$"
Domain = Annotated[str, Field(pattern=DOMAIN_PATTERN, max_length=253)]


class WebsiteCreate(BaseModel):
    """Hostnames the widget may run on (`example.com` also allows its subdomains)."""
    allowed_domains: list[Domain] = []
    greeting: Optional[str] = Field(None, max_length=500)
    lead_fields: list[LeadField] = ["name", "email", "phone"]


class WidgetUpdate(BaseModel):
    allowed_domains: Optional[list[Domain]] = None
    greeting: Optional[str] = Field(None, min_length=1, max_length=500)
    lead_fields: Optional[list[LeadField]] = None


class WidgetSettings(BaseModel):
    widget_key: str
    allowed_domains: list[str]
    greeting: str
    lead_fields: list[str]
    embed_snippet: str


class WidgetConfig(BaseModel):
    """What the widget shows; public."""
    business_name: str
    greeting: str
    lead_fields: list[str]


class VisitorSession(BaseModel):
    visitor_token: str


class VisitorMessageCreate(BaseModel):
    content: str = Field(max_length=2000)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content must not be blank")
        return value.strip()


class VisitorMessage(BaseModel):
    """A chat message as the visitor sees it."""
    id: uuid.UUID
    direction: str
    type: str
    content: str
    timestamp: UtcDatetime = Field(validation_alias="created_at")
    model_config = ConfigDict(from_attributes=True)


class LeadSubmit(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, pattern=EMAIL_PATTERN, max_length=255)
    phone: Optional[str] = Field(None, min_length=3, max_length=50)


# ==========================================
# CRM: contacts, tags, segments
# ==========================================

class ContactUpdate(BaseModel):
    """Profile fields to change; omitted fields stay as they are, `null` clears an optional field."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    email: Optional[str] = Field(None, pattern=EMAIL_PATTERN, max_length=255)
    birthday: Optional[date] = None
    anniversary: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=5000)
    consent: Optional[Consent] = None


class ContactListItem(ContactResponse):
    platforms: list[str]
    last_activity_at: Optional[UtcDatetime] = None


class ContactMerge(BaseModel):
    source_contact_id: uuid.UUID


class ContactImport(BaseModel):
    """CSV text with a header row: name, phone, email, birthday, anniversary (YYYY-MM-DD), tags (separated by `;`)."""
    csv: str = Field(min_length=1, max_length=5_000_000)


class ImportSkip(BaseModel):
    row: int
    reason: str


class ImportResult(BaseModel):
    created: int
    updated: int
    skipped: list[ImportSkip]


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    color: str = Field("#6b7280", pattern=COLOR_PATTERN)


class TagUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, pattern=COLOR_PATTERN)


class SegmentRules(BaseModel):
    """All given rules must hold; an empty rule set matches every contact."""
    tags: list[uuid.UUID] = []
    tags_match: Literal["any", "all"] = "any"
    exclude_tags: list[uuid.UUID] = []
    platforms: list[Platform] = []
    active_within_days: Optional[int] = Field(None, ge=1, le=3650)
    consent: list[Consent] = []
    birthday_within_days: Optional[int] = Field(None, ge=0, le=366)


class SegmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    rules: SegmentRules = SegmentRules()


class SegmentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    rules: Optional[SegmentRules] = None


class SegmentResponse(BaseModel):
    id: uuid.UUID
    name: str
    rules: SegmentRules
    count: int


class SegmentPreview(BaseModel):
    rules: SegmentRules = SegmentRules()
    limit: int = Field(20, ge=1, le=200)
    offset: int = Field(0, ge=0)


class SegmentMembers(BaseModel):
    count: int
    members: list[ContactListItem]
