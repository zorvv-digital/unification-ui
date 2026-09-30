import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import TagCreate, TagResponse, TagUpdate
from app.services.crm_service import TagService

router = APIRouter(prefix="/tags", tags=["Contacts"])


@router.get("", response_model=list[TagResponse])
async def list_tags(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Lists the workspace's tags by name."""
    return await TagService.list(db=db, workspace_id=user.workspace_id)


@router.post("", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
async def create_tag(data: TagCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Creates a tag (`color` as `#rrggbb`). Names are unique ignoring case (409)."""
    return await TagService.create(db=db, workspace_id=user.workspace_id, data=data)


@router.patch("/{tag_id}", response_model=TagResponse)
async def update_tag(tag_id: uuid.UUID, data: TagUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Renames or recolors a tag (409 when the name is taken)."""
    return await TagService.update(db=db, workspace_id=user.workspace_id, tag_id=tag_id, data=data)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(tag_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Deletes a tag and removes it from all contacts."""
    await TagService.delete(db=db, workspace_id=user.workspace_id, tag_id=tag_id)
