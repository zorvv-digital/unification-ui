import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import SegmentCreate, SegmentMembers, SegmentPreview, SegmentResponse, SegmentRules, SegmentUpdate
from app.services.crm_service import SegmentService

router = APIRouter(prefix="/segments", tags=["Contacts"])


@router.get("", response_model=list[SegmentResponse])
async def list_segments(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Lists saved segments with their current member counts."""
    return await SegmentService.list(db=db, workspace_id=user.workspace_id)


@router.post("/preview", response_model=SegmentMembers)
async def preview_segment(data: SegmentPreview, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Evaluates unsaved rules: the current member count and a page of members. Nothing is saved.
    Rules: `tags` + `tags_match` (`any`/`all`), `exclude_tags`, `platforms`, `active_within_days`, `consent`,
    `birthday_within_days`; all given rules must hold.
    """
    return await SegmentService.page(db, user.workspace_id, data.rules, data.limit, data.offset)


@router.post("", response_model=SegmentResponse, status_code=status.HTTP_201_CREATED)
async def create_segment(data: SegmentCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Saves a segment. Membership is evaluated whenever it is used, never stored. Names are unique (409)."""
    segment = await SegmentService.create(db=db, workspace_id=user.workspace_id, data=data)
    return await SegmentService.response(db, segment)


@router.get("/{segment_id}/members", response_model=SegmentMembers)
async def segment_members(
    segment_id: uuid.UUID,
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """The segment's current member count and a page of members."""
    segment = await SegmentService.get(db, user.workspace_id, segment_id)
    return await SegmentService.page(db, user.workspace_id, SegmentRules.model_validate(segment.rules), limit, offset)


@router.patch("/{segment_id}", response_model=SegmentResponse)
async def update_segment(segment_id: uuid.UUID, data: SegmentUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Renames a segment or replaces its rules."""
    segment = await SegmentService.update(db=db, workspace_id=user.workspace_id, segment_id=segment_id, data=data)
    return await SegmentService.response(db, segment)


@router.delete("/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_segment(segment_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Deletes a saved segment."""
    await SegmentService.delete(db=db, workspace_id=user.workspace_id, segment_id=segment_id)
