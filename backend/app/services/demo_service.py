import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Agent, AgentKnowledge, AgentVersion, Channel, Contact, Conversation, KnowledgeItem, Message, User, Workspace
from app.db.session import AsyncSessionLocal
from app.services.agent_service import AgentService
from app.services.auth_service import AuthService
from app.services.base import BaseService
from app.services.channel_service import InboundMessage
from app.services.inbox_service import InboxService

logger = logging.getLogger("demo")

SEED_PATH = Path(__file__).parent.parent / "demo" / "seed.json"
DEMO_PLATFORMS = ("whatsapp", "instagram", "messenger")


def _load_seed() -> dict:
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


class DemoService(BaseService):
    """
    Service layer for the demo workspace: seeding, reset, and simulated customer replies.
    """

    _reply_tasks: set[asyncio.Task] = set()

    @classmethod
    async def ensure_demo_workspace(cls, db: AsyncSession) -> None:
        """
        Creates the demo workspace, user, simulated channels, and seed conversations when demo mode
        is enabled and no demo workspace exists yet. Safe to call on every startup.

        Args:
            db (AsyncSession): Active asynchronous database session.
        """
        if not settings.DEMO_MODE:
            return
        existing = await db.execute(select(Workspace.id).where(Workspace.is_demo.is_(True)))
        if existing.first():
            return

        seed = _load_seed()
        workspace = Workspace(name=seed["workspace"]["name"], is_demo=True)
        user = User(
            workspace=workspace,
            name=seed["user"]["name"],
            email=settings.DEMO_EMAIL.lower(),
            password_hash=AuthService.hash_password(settings.DEMO_PASSWORD),
        )
        db.add_all([workspace, user])
        await db.flush()
        for platform in DEMO_PLATFORMS:
            db.add(Channel(workspace_id=workspace.id, platform=platform, name=f"Demo {platform.title()}", adapter_type="simulated"))
        await db.flush()
        await cls._seed_conversations(db, workspace.id, seed)
        await cls._seed_ai(db, workspace.id, seed)
        await db.commit()
        logger.info("Demo workspace created; log in with %s", settings.DEMO_EMAIL)

    @classmethod
    async def reset(cls, db: AsyncSession, workspace: Workspace) -> None:
        """
        Restores the demo workspace's contacts, conversations, messages, agent, and knowledge to the seed state.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace (Workspace): Caller's workspace.

        Raises:
            HTTPException: 403 when the workspace is not the demo workspace.
        """
        if not workspace.is_demo:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the demo workspace can be reset")
        await db.execute(delete(Message).where(Message.workspace_id == workspace.id))
        await db.execute(delete(Conversation).where(Conversation.workspace_id == workspace.id))
        await db.execute(delete(Contact).where(Contact.workspace_id == workspace.id))
        agent_ids = await db.execute(select(Agent.id).where(Agent.workspace_id == workspace.id))
        await AgentService.delete_agents(db, list(agent_ids.scalars().all()))
        await db.execute(delete(KnowledgeItem).where(KnowledgeItem.workspace_id == workspace.id))
        seed = _load_seed()
        await cls._seed_conversations(db, workspace.id, seed)
        await cls._seed_ai(db, workspace.id, seed)
        await db.commit()

    @classmethod
    def schedule_reply(cls, conversation_id: uuid.UUID) -> None:
        """
        Schedules a canned customer reply after the configured delay.

        Args:
            conversation_id (uuid.UUID): Demo conversation that just received a staff message.
        """
        task = asyncio.create_task(cls._reply_later(conversation_id))
        cls._reply_tasks.add(task)  # keep a reference so the task is not garbage collected
        task.add_done_callback(cls._reply_tasks.discard)

    @classmethod
    async def _reply_later(cls, conversation_id: uuid.UUID) -> None:
        await asyncio.sleep(settings.DEMO_REPLY_DELAY_SECONDS)
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(Conversation).where(Conversation.id == conversation_id))
            conversation = result.scalars().first()
            if not conversation:
                return  # demo was reset meanwhile
            count = await db.execute(select(func.count()).where(Message.conversation_id == conversation_id))
            replies = _load_seed()["replies"]
            content = replies[count.scalar_one() % len(replies)]
            await InboxService.receive_message(
                db, conversation.channel, InboundMessage(customer_id=conversation.external_id, content=content)
            )

    @classmethod
    async def _seed_conversations(cls, db: AsyncSession, workspace_id: uuid.UUID, seed: dict) -> None:
        channels = await db.execute(select(Channel).where(Channel.workspace_id == workspace_id))
        channel_by_platform = {channel.platform: channel for channel in channels.scalars().all()}
        now = datetime.now(timezone.utc)

        for item in seed["conversations"]:
            channel = channel_by_platform[item["platform"]]
            contact = Contact(workspace_id=workspace_id, **item["contact"])
            conversation = Conversation(
                workspace_id=workspace_id,
                channel=channel,
                contact=contact,
                platform=channel.platform,
                external_id=item["customer_id"],
                status=item.get("status", "open"),
            )
            db.add_all([contact, conversation])
            await db.flush()

            for entry in item["messages"]:
                message = Message(
                    workspace_id=workspace_id,
                    conversation_id=conversation.id,
                    platform=channel.platform,
                    direction=entry["direction"],
                    type="text",
                    content=entry["content"],
                    status=entry["status"],
                    created_at=now - timedelta(minutes=entry["minutes_ago"]),
                )
                db.add(message)
                if entry["direction"] == "inbound" and entry["status"] != "read":
                    conversation.unread_count += 1
                conversation.last_message_at = message.created_at
                conversation.last_message_preview = message.content[:120]

    @classmethod
    async def _seed_ai(cls, db: AsyncSession, workspace_id: uuid.UUID, seed: dict) -> None:
        items = [KnowledgeItem(workspace_id=workspace_id, **item) for item in seed["knowledge"]]
        spec = seed["agent"]
        agent = Agent(workspace_id=workspace_id, name=spec["name"], business_profile=spec["business_profile"], active_version_number=1)
        db.add_all([*items, agent])
        await db.flush()
        db.add(AgentVersion(
            workspace_id=workspace_id,
            agent_id=agent.id,
            version_number=1,
            system_prompt=spec["system_prompt"],
            greeting_message=spec["greeting_message"],
            personality=spec["personality"],
            rules=spec["rules"],
            skills=[],
            source="generated",
        ))
        db.add_all(AgentKnowledge(agent_id=agent.id, knowledge_item_id=item.id) for item in items)
