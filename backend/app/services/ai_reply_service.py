import logging
import re
import uuid
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Agent, Conversation, Message
from app.db.session import AsyncSessionLocal
from app.models.schemas import ConversationResponse, MessageCreate
from app.providers import llm
from app.services.agent_service import AgentService, ask_llm
from app.services.base import BaseService
from app.services.event_service import EventService
from app.services.inbox_service import InboxService

logger = logging.getLogger("ai_replies")

CONTEXT_MESSAGES = 20
HANDOFF = "HANDOFF"
HANDOFF_RULE = f"If you cannot help with this request from the information you have, reply with exactly {HANDOFF}."
# ponytail: English keywords only; ask the model to classify when multilingual escalation matters.
ASKS_FOR_PERSON = re.compile(
    r"\b(real person|human|talk to (someone|a person|staff)|speak (to|with) (someone|a person|staff)|manager|representative)\b",
    re.IGNORECASE,
)


class AiReplyService(BaseService):
    """
    Service layer for AI replies in the inbox: auto-answers on `ai` mode conversations, escalation, and suggestions.
    """

    @classmethod
    async def answer(cls, conversation_id: uuid.UUID) -> None:
        """
        Answers the latest customer message with the channel's agent when the conversation is in `ai` mode and
        its channel has auto-reply on. Escalates to a human when the customer asks for one, the model hands off,
        or the provider fails. Runs as a background task with its own session.

        Args:
            conversation_id (uuid.UUID): Conversation that just received a customer message.
        """
        async with AsyncSessionLocal() as db:
            conversation = await db.get(Conversation, conversation_id)
            if not conversation or conversation.mode != "ai":
                return
            channel = conversation.channel
            if not channel.ai_enabled or not channel.ai_agent_id:
                return

            history = await cls._recent_messages(db, conversation.id)
            if history and history[-1].direction == "inbound" and ASKS_FOR_PERSON.search(history[-1].content):
                return await cls._escalate(db, conversation)

            agent = await AgentService.get_agent(db, conversation.workspace_id, channel.ai_agent_id)
            try:
                reply = await llm.complete(await cls._prompt(db, agent, history, with_handoff=True))
            except llm.LLMError as exc:
                logger.warning("AI reply failed for conversation %s: %s", conversation.id, exc)
                return await cls._escalate(db, conversation)
            if reply.strip() == HANDOFF:
                return await cls._escalate(db, conversation)

            await db.refresh(conversation)
            if conversation.mode != "ai":
                return  # staff took over while the model was thinking
            await InboxService.send_message(
                db, conversation.workspace_id, conversation.id, MessageCreate(content=reply), author="agent"
            )

    @classmethod
    async def suggest(cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> str:
        """
        Drafts a reply for staff with the channel's agent (or the workspace's first agent). Nothing is sent or stored.

        Raises:
            HTTPException: 404 for an unknown conversation, 400 when the workspace has no agent, 502 on provider failure.
        """
        conversation = await InboxService.get_conversation(db, workspace_id, conversation_id)
        agent_id = conversation.channel.ai_agent_id
        if agent_id:
            agent = await AgentService.get_agent(db, workspace_id, agent_id)
        else:
            agents = await AgentService.list_agents(db, workspace_id)
            if not agents:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Create an AI agent first")
            agent = agents[0]
        history = await cls._recent_messages(db, conversation.id)
        return await ask_llm(await cls._prompt(db, agent, history, with_handoff=False))

    @classmethod
    async def _prompt(cls, db: AsyncSession, agent: Agent, history: Sequence[Message], with_handoff: bool) -> list[dict]:
        version = await AgentService.get_version(db, agent)
        instructions = await AgentService.build_instructions(db, agent, version)
        system = f"{HANDOFF_RULE}\n\n{instructions}" if with_handoff else instructions
        return [
            {"role": "system", "content": system},
            *({"role": "user" if m.direction == "inbound" else "assistant", "content": m.content} for m in history),
        ]

    @staticmethod
    async def _recent_messages(db: AsyncSession, conversation_id: uuid.UUID) -> Sequence[Message]:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(CONTEXT_MESSAGES)
        )
        return list(reversed(result.scalars().all()))

    @staticmethod
    async def _escalate(db: AsyncSession, conversation: Conversation) -> None:
        conversation.mode = "human"
        conversation.needs_human = True
        await db.commit()
        EventService.publish(conversation.workspace_id, "conversation.updated", ConversationResponse.model_validate(conversation))
