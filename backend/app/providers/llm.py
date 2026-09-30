import asyncio
import json
import logging
import re
from typing import Optional, TypeVar, Union

import httpx
from pydantic import BaseModel, ValidationError

from app.config.settings import settings
from app.models.schemas import BuilderOutput, ProfilerField, ProfilerOutput, RefineOutput

logger = logging.getLogger("llm")

T = TypeVar("T", bound=BaseModel)
Messages = list[dict[str, str]]

# Tests swap in httpx.MockTransport here.
_transport: Optional[httpx.AsyncBaseTransport] = None
# Providers answer 429/5xx when overloaded ("high demand"); retrying with backoff rides out most spikes.
RETRY_STATUSES = {429, 500, 502, 503, 504}
ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1.0  # doubles after each retry


class LLMError(Exception):
    """The AI provider failed, timed out, or returned unusable output."""


async def complete(messages: Messages, schema: Optional[type[T]] = None) -> Union[str, T]:
    """
    Runs a chat completion against the configured provider.

    Args:
        messages (Messages): OpenAI-style messages (`role`, `content`).
        schema (Optional[type[T]]): When given, the reply is parsed and validated as this model.

    Returns:
        Union[str, T]: Reply text, or the validated schema instance.

    Raises:
        LLMError: On any provider, network, or output validation failure.
    """
    if settings.LLM_PROVIDER == "openai":
        return await _openai_complete(messages, schema)
    return _fake_complete(messages, schema)


# ==========================================
# OpenAI-compatible provider
# ==========================================

async def _openai_complete(messages: Messages, schema: Optional[type[T]]) -> Union[str, T]:
    if not settings.LLM_API_KEY:
        raise LLMError("AI provider is not configured (LLM_API_KEY missing)")

    body: dict = {"model": settings.LLM_MODEL, "messages": messages, "temperature": 0.2}
    if schema:
        instruction = (
            "Respond with only a JSON object matching this JSON schema:\n"
            f"{json.dumps(schema.model_json_schema())}"
        )
        body["messages"] = [{"role": "system", "content": instruction}, *messages]
        # Structured output: the provider enforces the schema (models ignore schemas that are only in the prompt).
        body["response_format"] = {"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": schema.model_json_schema()}}

    try:
        async with httpx.AsyncClient(transport=_transport, timeout=settings.LLM_TIMEOUT_SECONDS) as client:
            for attempt in range(ATTEMPTS):
                response = await client.post(
                    f"{settings.LLM_BASE_URL.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {settings.LLM_API_KEY}"},
                    json=body,
                )
                if response.status_code not in RETRY_STATUSES or attempt == ATTEMPTS - 1:
                    break
                await asyncio.sleep(RETRY_DELAY_SECONDS * 2**attempt)
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        logger.warning("LLM request failed: %s", exc)
        raise LLMError("AI provider request failed") from exc

    if not schema:
        return content
    try:
        return schema.model_validate_json(_strip_code_fence(content))
    except ValidationError as exc:
        logger.warning("LLM returned invalid %s: %s", schema.__name__, exc)
        raise LLMError("AI provider returned invalid output") from exc


def _strip_code_fence(text: str) -> str:
    match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    return match.group(1) if match else text


# ==========================================
# Fake provider: offline, deterministic output for tests and key-less demos
# ==========================================

def _fake_complete(messages: Messages, schema: Optional[type[T]]) -> Union[str, T]:
    user_text = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    system_text = "\n".join(m["content"] for m in messages if m["role"] == "system")

    if schema is ProfilerOutput:
        return ProfilerOutput(fields=_fake_questions(_field(user_text, "Business Type / Industry") or "business"))
    if schema is BuilderOutput:
        return _fake_agent(user_text)
    if schema is RefineOutput:
        current = user_text.split("### Current system prompt", 1)[-1].split("### Feedback", 1)[0].strip()
        feedback = user_text.split("### Feedback", 1)[-1].strip()
        return RefineOutput(system_prompt=f"{current}\n\n### Owner feedback\n- {feedback}")
    if schema is not None:
        raise LLMError(f"Fake provider has no output for {schema.__name__}")
    return _fake_reply(system_text, user_text)


def _field(text: str, label: str) -> Optional[str]:
    match = re.search(rf"\*\*{re.escape(label)}\*\*:\s*(.+)", text)
    value = match.group(1).strip() if match else None
    return None if value in (None, "Not specified", "") else value


def _fake_questions(business_type: str) -> list[ProfilerField]:
    return [
        ProfilerField(field_id="top_services", question_text=f"Which services does your {business_type} get asked about most?",
                      ui_type="textarea", is_required=True),
        ProfilerField(field_id="booking_method", question_text="How do customers book or order?",
                      ui_type="select", options=["Walk-in", "Phone", "Online", "Chat"], is_required=True),
        ProfilerField(field_id="price_range", question_text="What is your typical price range?", ui_type="text", is_required=False),
        ProfilerField(field_id="policies", question_text="Any policies customers should know (cancellations, refunds)?",
                      ui_type="textarea", is_required=False),
    ]


def _fake_agent(user_text: str) -> BuilderOutput:
    business = _field(user_text, "Business Name") or "Your Business"
    agent_name = _field(user_text, "Preferred Agent Name") or f"{business} Assistant"
    if agent_name == "Default Assistant":
        agent_name = f"{business} Assistant"
    personality = _field(user_text, "Personality") or "friendly and helpful"
    objective = _field(user_text, "Business Objective") or "help customers with questions, bookings, and support"
    rules = re.findall(r"^- (.+)$", user_text.split("**Custom Rules**:", 1)[-1], re.MULTILINE)
    rules = [r for r in rules if not r.startswith("Standard customer service rules")]
    details = "\n".join(
        f"- **{label}**: {_field(user_text, label) or 'Not specified'}"
        for label in ("Business Type", "Location", "Working Hours", "Offerings & Services")
    )
    rules_text = "".join(f"\n* {rule}" for rule in rules)
    prompt = (
        f"You are {agent_name}, the AI customer service agent for {business}.\n\n"
        f"Your job is to {objective}.\n\n"
        "### Rules\n"
        f"* Be {personality}, concise, and conversational.\n"
        "* Reply in the customer's language.\n"
        "* Use only verified business information. Never guess.\n"
        f"* Escalate to a human when the customer asks or you cannot help.{rules_text}\n\n"
        f"### Business Information\n- **Business Name**: {business}\n{details}"
    )
    return BuilderOutput(
        agent_name=agent_name,
        system_prompt=prompt,
        greeting_message=f"Hello! Welcome to {business}. How can I help you today?",
    )


def _fake_reply(system_text: str, user_text: str) -> str:
    sections = re.findall(r"^## (.+)\n([\s\S]*?)(?=^## |\Z)", system_text, re.MULTILINE)
    words = set(re.findall(r"[a-z]{4,}", user_text.lower()))
    for title, content in sections:
        title_words = set(re.findall(r"[a-z]{4,}", title.lower()))
        if words & (title_words | {w.rstrip("s") for w in title_words}) or words & {w + "s" for w in title_words}:
            return f"Here's what I can tell you about {title.strip()}:\n{content.strip()[:400]}"
    return "Thanks for your message! (Offline demo reply: connect an AI provider for real answers.) How else can I help?"
