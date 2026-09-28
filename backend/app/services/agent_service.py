import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Agent, AgentKnowledge, AgentVersion, KnowledgeItem, PlaygroundMessage
from app.models.schemas import (
    AgentGenerateRequest,
    AgentResponse,
    AgentVersionCreate,
    AgentVersionResponse,
    BuilderOutput,
    BusinessProfile,
    ProfilerOutput,
    RefineOutput,
)
from app.providers import llm
from app.services.base import BaseService
from app.services.knowledge_service import KnowledgeService

PROMPT_DIR = Path(__file__).parent / "prompts"
PLAYGROUND_HISTORY = 20


def _prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8")


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


async def ask_llm(messages: list[dict], schema=None):
    """Calls the LLM and turns provider failures into a 502 for the API caller."""
    try:
        return await llm.complete(messages, schema=schema)
    except llm.LLMError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"AI provider unavailable: {exc}")


class AgentService(BaseService):
    """
    Service layer for AI agents: profiling, generation, versioning, activation, and knowledge attachment.
    """

    @classmethod
    async def profiler_questions(cls, profile: BusinessProfile) -> ProfilerOutput:
        """
        Generates follow-up onboarding questions tailored to the business.

        Raises:
            HTTPException: 502 when the AI provider fails.
        """
        user = _prompt("profiler_user").format(
            business_name=profile.business_name,
            business_type=profile.business_type,
            location=profile.location or "Not specified",
            offerings=", ".join(profile.offerings) or "Not specified",
            working_hours=profile.working_hours or "Not specified",
        )
        messages = [{"role": "system", "content": _prompt("profiler_system")}, {"role": "user", "content": user}]
        return await ask_llm(messages, ProfilerOutput)

    @classmethod
    async def generate(cls, db: AsyncSession, workspace_id: uuid.UUID, data: AgentGenerateRequest) -> Agent:
        """
        Generates an agent with the LLM and stores it as version 1. Nothing is stored when the LLM fails.

        Raises:
            HTTPException: 502 when the AI provider fails.
        """
        profile, setup = data.business_profile, data.agent_setup
        answers = "\n".join(f"- **{key}**: {value}" for key, value in data.collected_answers.items())
        rules = "\n".join(f"- {rule}" for rule in (setup.rules if setup else []))
        user = _prompt("builder_user").format(
            business_name=profile.business_name,
            business_type=profile.business_type,
            location=profile.location or "Not specified",
            working_hours=profile.working_hours or "Not specified",
            offerings=", ".join(profile.offerings) or "Not specified",
            collected_answers=answers or "No additional questionnaire answers provided.",
            agent_name=(setup and setup.agent_name) or "Not specified",
            personality=(setup and setup.personality) or "Professional, friendly, and helpful",
            business_objective=(setup and setup.business_objective) or "Assist customers with inquiries and general support",
            custom_rules=rules or "- Standard customer service rules apply.",
        )
        messages = [{"role": "system", "content": _prompt("builder_system")}, {"role": "user", "content": user}]
        output: BuilderOutput = await ask_llm(messages, BuilderOutput)

        agent = Agent(workspace_id=workspace_id, name=output.agent_name, business_profile=profile.model_dump(), active_version_number=1)
        db.add(agent)
        await db.flush()
        db.add(AgentVersion(
            workspace_id=workspace_id,
            agent_id=agent.id,
            version_number=1,
            system_prompt=output.system_prompt,
            greeting_message=output.greeting_message,
            personality=setup.personality if setup else None,
            rules=setup.rules if setup else [],
            skills=[skill.model_dump() for skill in output.skills],
            source="generated",
        ))
        await db.commit()
        return agent

    @classmethod
    async def list_agents(cls, db: AsyncSession, workspace_id: uuid.UUID) -> Sequence[Agent]:
        """
        Lists the workspace's agents, oldest first.
        """
        result = await db.execute(select(Agent).where(Agent.workspace_id == workspace_id).order_by(Agent.created_at))
        return result.scalars().all()

    @classmethod
    async def get_agent(cls, db: AsyncSession, workspace_id: uuid.UUID, agent_id: uuid.UUID) -> Agent:
        """
        Fetches one workspace agent.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.workspace_id == workspace_id))
        agent = result.scalars().first()
        if not agent:
            raise _not_found("Agent")
        return agent

    @classmethod
    async def get_version(cls, db: AsyncSession, agent: Agent, version_number: Optional[int] = None) -> AgentVersion:
        """
        Fetches a version of the agent; the active one when no number is given.

        Raises:
            HTTPException: 404 when the version does not exist.
        """
        number = version_number or agent.active_version_number
        result = await db.execute(
            select(AgentVersion).where(AgentVersion.agent_id == agent.id, AgentVersion.version_number == number)
        )
        version = result.scalars().first()
        if not version:
            raise _not_found("Agent version")
        return version

    @classmethod
    async def list_versions(cls, db: AsyncSession, agent: Agent) -> Sequence[AgentVersion]:
        """
        Lists the agent's versions, newest first.
        """
        result = await db.execute(
            select(AgentVersion).where(AgentVersion.agent_id == agent.id).order_by(AgentVersion.version_number.desc())
        )
        return result.scalars().all()

    @classmethod
    async def create_version(cls, db: AsyncSession, agent: Agent, data: AgentVersionCreate) -> AgentVersion:
        """
        Saves a manual edit as a new version and makes it active. Omitted fields are copied from the active version.
        """
        base = await cls.get_version(db, agent)
        changes = data.model_dump(exclude_unset=True)
        version = await cls._add_version(db, agent, base, source="manual", **changes)
        agent.active_version_number = version.version_number
        await db.commit()
        return version

    @classmethod
    async def refine(cls, db: AsyncSession, agent: Agent, feedback: str) -> AgentVersion:
        """
        Asks the LLM to revise the active prompt from owner feedback and stores it as an inactive draft version.

        Raises:
            HTTPException: 502 when the AI provider fails.
        """
        base = await cls.get_version(db, agent)
        messages = [
            {"role": "system", "content": _prompt("refine_system")},
            {"role": "user", "content": _prompt("refine_user").format(system_prompt=base.system_prompt, feedback=feedback)},
        ]
        output: RefineOutput = await ask_llm(messages, RefineOutput)
        version = await cls._add_version(db, agent, base, source="feedback", system_prompt=output.system_prompt, feedback=feedback)
        await db.commit()
        return version

    @classmethod
    async def activate(cls, db: AsyncSession, agent: Agent, version_number: int) -> Agent:
        """
        Makes an existing version the active one.
        """
        await cls.get_version(db, agent, version_number)
        agent.active_version_number = version_number
        await db.commit()
        return agent

    @classmethod
    async def rename(cls, db: AsyncSession, agent: Agent, name: str) -> Agent:
        agent.name = name
        await db.commit()
        return agent

    @classmethod
    async def delete_agents(cls, db: AsyncSession, agent_ids: list[uuid.UUID]) -> None:
        """
        Deletes agents with their versions, knowledge links, and playground history (no commit).
        """
        for model, column in (
            (PlaygroundMessage, PlaygroundMessage.agent_id),
            (AgentKnowledge, AgentKnowledge.agent_id),
            (AgentVersion, AgentVersion.agent_id),
            (Agent, Agent.id),
        ):
            await db.execute(delete(model).where(column.in_(agent_ids)))

    @classmethod
    async def attach_knowledge(cls, db: AsyncSession, agent: Agent, item_id: uuid.UUID) -> None:
        """
        Attaches a knowledge item from the same workspace to the agent. Attaching twice is a no-op.
        """
        await KnowledgeService.get_item(db, agent.workspace_id, item_id)
        existing = await db.execute(
            select(AgentKnowledge.id).where(AgentKnowledge.agent_id == agent.id, AgentKnowledge.knowledge_item_id == item_id)
        )
        if not existing.first():
            db.add(AgentKnowledge(agent_id=agent.id, knowledge_item_id=item_id))
            await db.commit()

    @classmethod
    async def detach_knowledge(cls, db: AsyncSession, agent: Agent, item_id: uuid.UUID) -> None:
        await db.execute(
            delete(AgentKnowledge).where(AgentKnowledge.agent_id == agent.id, AgentKnowledge.knowledge_item_id == item_id)
        )
        await db.commit()

    @classmethod
    async def knowledge_ids(cls, db: AsyncSession, agent: Agent) -> list[uuid.UUID]:
        result = await db.execute(
            select(AgentKnowledge.knowledge_item_id).where(AgentKnowledge.agent_id == agent.id).order_by(AgentKnowledge.created_at)
        )
        return list(result.scalars().all())

    @classmethod
    async def build_instructions(cls, db: AsyncSession, agent: Agent, version: AgentVersion) -> str:
        """
        Composes the full instructions an agent answers with: the version's prompt plus its enabled, attached knowledge.
        Knowledge is read at call time, so edits apply to the next answer.
        """
        result = await db.execute(
            select(KnowledgeItem)
            .join(AgentKnowledge, AgentKnowledge.knowledge_item_id == KnowledgeItem.id)
            .where(AgentKnowledge.agent_id == agent.id, KnowledgeItem.enabled.is_(True))
            .order_by(AgentKnowledge.created_at)
        )
        sections = "".join(f"\n\n## {item.title}\n{item.content}" for item in result.scalars().all())
        return version.system_prompt + (f"\n\n### Business knowledge{sections}" if sections else "")

    @classmethod
    async def playground_chat(
        cls, db: AsyncSession, agent: Agent, message: str, session_id: Optional[str], version_number: Optional[int]
    ) -> tuple[str, str, int]:
        """
        Answers a test message with the chosen (or active) version, using the session's history.
        Messages are stored only after a successful reply, so a failed call leaves the session unchanged.

        Returns:
            tuple[str, str, int]: Reply text, session id, and the version number used.

        Raises:
            HTTPException: 404 for an unknown version, 502 when the AI provider fails.
        """
        version = await cls.get_version(db, agent, version_number)
        session_id = session_id or uuid.uuid4().hex
        history = await db.execute(
            select(PlaygroundMessage)
            .where(PlaygroundMessage.agent_id == agent.id, PlaygroundMessage.session_id == session_id)
            .order_by(PlaygroundMessage.created_at.desc())
            .limit(PLAYGROUND_HISTORY)
        )
        messages = [
            {"role": "system", "content": await cls.build_instructions(db, agent, version)},
            *({"role": m.role, "content": m.content} for m in reversed(history.scalars().all())),
            {"role": "user", "content": message},
        ]
        reply = await ask_llm(messages)

        # Explicit, ordered timestamps: both rows share one flush and the OS clock can tie them.
        asked_at = datetime.now(timezone.utc)
        for offset, (role, content) in enumerate((("user", message), ("assistant", reply))):
            db.add(PlaygroundMessage(
                workspace_id=agent.workspace_id, agent_id=agent.id, session_id=session_id,
                role=role, content=content, created_at=asked_at + timedelta(microseconds=offset),
            ))
        await db.commit()
        return reply, session_id, version.version_number

    @classmethod
    async def to_response(cls, db: AsyncSession, agent: Agent) -> AgentResponse:
        version = await cls.get_version(db, agent)
        return AgentResponse(
            id=agent.id,
            name=agent.name,
            active_version_number=agent.active_version_number,
            active_version=cls.version_response(agent, version),
            knowledge_ids=await cls.knowledge_ids(db, agent),
        )

    @staticmethod
    def version_response(agent: Agent, version: AgentVersion) -> AgentVersionResponse:
        response = AgentVersionResponse.model_validate(version)
        response.is_active = version.version_number == agent.active_version_number
        return response

    @classmethod
    async def _add_version(cls, db: AsyncSession, agent: Agent, base: AgentVersion, source: str, **changes) -> AgentVersion:
        latest = await db.execute(select(func.max(AgentVersion.version_number)).where(AgentVersion.agent_id == agent.id))
        fields = {
            "system_prompt": base.system_prompt,
            "greeting_message": base.greeting_message,
            "personality": base.personality,
            "rules": base.rules,
            "skills": base.skills,
            **changes,
        }
        version = AgentVersion(
            workspace_id=agent.workspace_id,
            agent_id=agent.id,
            version_number=latest.scalar_one() + 1,
            source=source,
            **fields,
        )
        db.add(version)
        await db.flush()
        return version
