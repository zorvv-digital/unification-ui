import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import ContactDetailResponse, ContactResponse
from app.services.inbox_service import InboxService

router = APIRouter(prefix="/contacts", tags=["Inbox"])


@router.get("/{contact_id}", response_model=ContactDetailResponse)
async def get_contact(
    contact_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a contact's details and the ids of their conversations.
    """
    contact, conversation_ids = await InboxService.get_contact(db=db, workspace_id=user.workspace_id, contact_id=contact_id)
    return ContactDetailResponse(
        **ContactResponse.model_validate(contact).model_dump(), conversation_ids=conversation_ids
    )
