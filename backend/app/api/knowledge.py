import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import KnowledgeCreate, KnowledgeResponse, KnowledgeUpdate
from app.services.knowledge_service import KnowledgeService

router = APIRouter(prefix="/knowledge", tags=["Knowledge"])


@router.get("", response_model=list[KnowledgeResponse])
async def list_knowledge(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Lists the workspace's knowledge items.
    """
    return await KnowledgeService.list_items(db=db, workspace_id=user.workspace_id)


@router.post("", response_model=KnowledgeResponse, status_code=status.HTTP_201_CREATED)
async def create_knowledge(data: KnowledgeCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Creates a knowledge item (content up to 20,000 characters). Attach it to an agent to use it.
    """
    return await KnowledgeService.create_item(db=db, workspace_id=user.workspace_id, data=data)


@router.patch("/{item_id}", response_model=KnowledgeResponse)
async def update_knowledge(
    item_id: uuid.UUID, data: KnowledgeUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
):
    """
    Updates a knowledge item; changes apply to the agent's next answer.
    """
    return await KnowledgeService.update_item(db=db, workspace_id=user.workspace_id, item_id=item_id, data=data)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge(item_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Deletes a knowledge item and detaches it from all agents.
    """
    await KnowledgeService.delete_item(db=db, workspace_id=user.workspace_id, item_id=item_id)
