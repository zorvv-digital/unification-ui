import uuid
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AgentKnowledge, KnowledgeItem
from app.models.schemas import KnowledgeCreate, KnowledgeUpdate
from app.services.base import BaseService


class KnowledgeService(BaseService):
    """
    Service layer for workspace knowledge items that agents use when answering.
    """

    @classmethod
    async def list_items(cls, db: AsyncSession, workspace_id: uuid.UUID) -> Sequence[KnowledgeItem]:
        """
        Lists the workspace's knowledge items, oldest first.
        """
        result = await db.execute(
            select(KnowledgeItem).where(KnowledgeItem.workspace_id == workspace_id).order_by(KnowledgeItem.created_at)
        )
        return result.scalars().all()

    @classmethod
    async def get_item(cls, db: AsyncSession, workspace_id: uuid.UUID, item_id: uuid.UUID) -> KnowledgeItem:
        """
        Fetches one workspace knowledge item.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(
            select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.workspace_id == workspace_id)
        )
        item = result.scalars().first()
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Knowledge item not found")
        return item

    @classmethod
    async def create_item(cls, db: AsyncSession, workspace_id: uuid.UUID, data: KnowledgeCreate) -> KnowledgeItem:
        """
        Creates a knowledge item.
        """
        item = KnowledgeItem(workspace_id=workspace_id, **data.model_dump())
        db.add(item)
        await db.commit()
        return item

    @classmethod
    async def update_item(
        cls, db: AsyncSession, workspace_id: uuid.UUID, item_id: uuid.UUID, data: KnowledgeUpdate
    ) -> KnowledgeItem:
        """
        Updates the given fields of a knowledge item. Agents use the new content on their next answer.
        """
        item = await cls.get_item(db, workspace_id, item_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(item, field, value)
        await db.commit()
        return item

    @classmethod
    async def delete_item(cls, db: AsyncSession, workspace_id: uuid.UUID, item_id: uuid.UUID) -> None:
        """
        Deletes a knowledge item and detaches it from all agents.
        """
        item = await cls.get_item(db, workspace_id, item_id)
        await db.execute(delete(AgentKnowledge).where(AgentKnowledge.knowledge_item_id == item.id))
        await db.delete(item)
        await db.commit()
