from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.services.demo_service import DemoService

router = APIRouter(prefix="/demo", tags=["Demo"])


@router.post("/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_demo(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Restores the demo workspace's conversations to the seed state. Returns 403 outside the demo workspace.
    """
    await DemoService.reset(db=db, workspace=user.workspace)
