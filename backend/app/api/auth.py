from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Registers a new business: creates the workspace and its first user, and returns an access token.
    """
    user = await AuthService.register(db=db, data=data)
    return TokenResponse(access_token=AuthService.create_token(user))


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Exchanges email and password for an access token.
    """
    return TokenResponse(access_token=await AuthService.login(db=db, email=data.email, password=data.password))


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(current_user)):
    """
    Returns the authenticated user and their workspace.
    """
    return user
