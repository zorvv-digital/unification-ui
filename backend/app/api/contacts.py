import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import (
    ContactDetailResponse,
    ContactImport,
    ContactListItem,
    ContactMerge,
    ContactResponse,
    ContactUpdate,
    ImportResult,
)
from app.services.crm_service import ContactService
from app.services.inbox_service import InboxService

router = APIRouter(prefix="/contacts", tags=["Contacts"])


@router.get("", response_model=list[ContactListItem])
async def list_contacts(
    q: Optional[str] = None,
    tag_ids: list[uuid.UUID] = Query(default=[]),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists contacts with their channels and last activity, most recently active first. `q` searches name, phone,
    and email; `tag_ids` (repeatable) keeps contacts having any of those tags.
    """
    return await ContactService.list_items(db=db, workspace_id=user.workspace_id, q=q, tag_ids=tag_ids)


@router.post("/import", response_model=ImportResult)
async def import_contacts(data: ContactImport, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Imports contacts from CSV text (header row: name, phone, email, birthday, anniversary as YYYY-MM-DD, tags separated
    by `;`). Rows matching a contact by phone or email update it; invalid rows are skipped and reported by row number.
    """
    return await ContactService.import_csv(db=db, workspace_id=user.workspace_id, data=data)


@router.get("/{contact_id}", response_model=ContactDetailResponse)
async def get_contact(
    contact_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns a contact's details, tags, and the ids of their conversations.
    """
    contact, conversation_ids = await InboxService.get_contact(db=db, workspace_id=user.workspace_id, contact_id=contact_id)
    return ContactDetailResponse(
        **ContactResponse.model_validate(contact).model_dump(), conversation_ids=conversation_ids
    )


@router.patch("/{contact_id}", response_model=ContactResponse)
async def update_contact(contact_id: uuid.UUID, data: ContactUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Edits the profile: name, phone, email, birthday and anniversary (YYYY-MM-DD), notes, and marketing `consent`
    (`opted_in`, `opted_out`, `unknown`; its change time is recorded). Invalid values give 422 and change nothing.
    """
    return await ContactService.update(db=db, workspace_id=user.workspace_id, contact_id=contact_id, data=data)


@router.post("/{contact_id}/tags/{tag_id}", response_model=ContactResponse)
async def add_tag(contact_id: uuid.UUID, tag_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Assigns a tag to the contact (no-op if already assigned)."""
    return await ContactService.set_tag(db=db, workspace_id=user.workspace_id, contact_id=contact_id, tag_id=tag_id, on=True)


@router.delete("/{contact_id}/tags/{tag_id}", response_model=ContactResponse)
async def remove_tag(contact_id: uuid.UUID, tag_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Removes a tag from the contact (no-op if not assigned)."""
    return await ContactService.set_tag(db=db, workspace_id=user.workspace_id, contact_id=contact_id, tag_id=tag_id, on=False)


@router.post("/{contact_id}/merge", response_model=ContactResponse)
async def merge_contact(contact_id: uuid.UUID, data: ContactMerge, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Merges `source_contact_id` into this contact: its conversations and tags move here, empty fields here are filled
    from it, and it is deleted. Use it when one customer wrote in on several channels.
    """
    return await ContactService.merge(db=db, workspace_id=user.workspace_id, target_id=contact_id, source_id=data.source_contact_id)
