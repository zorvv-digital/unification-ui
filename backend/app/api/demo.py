import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import MessageResponse, SimulateCustomerRequest
from app.services.ai_reply_service import AiReplyService
from app.services.demo_service import DemoService

router = APIRouter(prefix="/demo", tags=["Demo"])


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_demo(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Restores the demo workspace's conversations to the seed state. Returns 403 outside the demo workspace.
    """
    await DemoService.reset(db=db, workspace=user.workspace)


@router.post("/conversations/{conversation_id}/simulate", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def simulate_customer(
    conversation_id: uuid.UUID,
    data: SimulateCustomerRequest,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Posts a message as the conversation's customer, exactly like a channel webhook would.
    In `ai` mode the agent answers right after. Returns 403 outside the demo workspace.
    """
    message = await DemoService.simulate_customer(db=db, workspace=user.workspace, conversation_id=conversation_id, content=data.content)
    background_tasks.add_task(AiReplyService.answer, conversation_id)
    return message
