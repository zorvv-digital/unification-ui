import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import (
    AgentGenerateRequest,
    AgentRename,
    AgentResponse,
    AgentSummary,
    AgentVersionCreate,
    AgentVersionResponse,
    BusinessProfile,
    PlaygroundChatRequest,
    PlaygroundChatResponse,
    ProfilerOutput,
    RefineRequest,
)
from app.services.agent_service import AgentService

router = APIRouter(prefix="/agents", tags=["AI Agents"])


@router.post("/profiler/questions", response_model=ProfilerOutput)
async def profiler_questions(profile: BusinessProfile, user: User = Depends(current_user)):
    """
    Returns follow-up onboarding questions tailored to the business type. 502 when the AI provider fails.
    """
    return await AgentService.profiler_questions(profile)


@router.post("/generate", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def generate_agent(data: AgentGenerateRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Generates an agent from the business profile, questionnaire answers, and optional setup; stored as version 1.
    """
    agent = await AgentService.generate(db=db, workspace_id=user.workspace_id, data=data)
    return await AgentService.to_response(db, agent)


@router.get("", response_model=list[AgentSummary])
async def list_agents(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Lists the workspace's agents.
    """
    return await AgentService.list_agents(db=db, workspace_id=user.workspace_id)


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Returns the agent with its active version and attached knowledge ids.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    return await AgentService.to_response(db, agent)


@router.patch("/{agent_id}", response_model=AgentResponse)
async def rename_agent(
    agent_id: uuid.UUID, data: AgentRename, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Renames the agent.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    await AgentService.rename(db, agent, data.name)
    return await AgentService.to_response(db, agent)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Deletes the agent and all its versions.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    await AgentService.delete_agents(db, [agent.id])
    await db.commit()


@router.get("/{agent_id}/versions", response_model=list[AgentVersionResponse])
async def list_versions(agent_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Lists all versions, newest first; `is_active` marks the live one.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    return [AgentService.version_response(agent, v) for v in await AgentService.list_versions(db, agent)]


@router.post("/{agent_id}/versions", response_model=AgentVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_version(
    agent_id: uuid.UUID, data: AgentVersionCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Saves a manual edit as a new active version. Omitted fields are copied from the current active version.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    version = await AgentService.create_version(db, agent, data)
    return AgentService.version_response(agent, version)


@router.post("/{agent_id}/refine", response_model=AgentVersionResponse, status_code=status.HTTP_201_CREATED)
async def refine_agent(
    agent_id: uuid.UUID, data: RefineRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Turns plain-language feedback into a revised prompt, saved as an inactive draft version. Test it in the
    playground with `version_number`, then activate it.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    version = await AgentService.refine(db, agent, data.feedback)
    return AgentService.version_response(agent, version)


@router.post("/{agent_id}/versions/{version_number}/activate", response_model=AgentResponse)
async def activate_version(
    agent_id: uuid.UUID, version_number: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Makes the given version live (also used to roll back).
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    await AgentService.activate(db, agent, version_number)
    return await AgentService.to_response(db, agent)


@router.post("/{agent_id}/knowledge/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def attach_knowledge(
    agent_id: uuid.UUID, item_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Attaches a knowledge item to the agent.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    await AgentService.attach_knowledge(db, agent, item_id)


@router.delete("/{agent_id}/knowledge/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def detach_knowledge(
    agent_id: uuid.UUID, item_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Detaches a knowledge item from the agent.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    await AgentService.detach_knowledge(db, agent, item_id)


@router.post("/{agent_id}/playground/chat", response_model=PlaygroundChatResponse)
async def playground_chat(
    agent_id: uuid.UUID, data: PlaygroundChatRequest, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Private test chat. Omit `session_id` to start a new session; pass the returned one to continue it.
    Set `version_number` to test a draft before activating it. Nothing reaches customers or the inbox.
    """
    agent = await AgentService.get_agent(db, user.workspace_id, agent_id)
    reply, session_id, version_number = await AgentService.playground_chat(
        db, agent, data.message, data.session_id, data.version_number
    )
    return PlaygroundChatResponse(reply=reply, session_id=session_id, version_number=version_number)
