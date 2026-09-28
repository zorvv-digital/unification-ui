import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import User, Workspace
from app.models.schemas import RegisterRequest
from app.services.base import BaseService

PBKDF2_ITERATIONS = 200_000


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


class AuthService(BaseService):
    """
    Service layer handling workspace registration, password hashing, and JWT access tokens.
    """

    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hashes a password with salted PBKDF2-SHA256.

        Args:
            password (str): Plain text password.

        Returns:
            str: Encoded hash in the form `pbkdf2_sha256$iterations$salt$hash`.
        """
        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS).hex()
        return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"

    @staticmethod
    def verify_password(password: str, encoded: str) -> bool:
        """
        Checks a plain password against an encoded hash in constant time.

        Args:
            password (str): Plain text password to check.
            encoded (str): Hash produced by `hash_password`.

        Returns:
            bool: True when the password matches.
        """
        _, iterations, salt, digest = encoded.split("$")
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
        return hmac.compare_digest(candidate, digest)

    @staticmethod
    def create_token(user: User) -> str:
        """
        Issues a signed, expiring access token identifying the user and their workspace.

        Args:
            user (User): Authenticated user.

        Returns:
            str: Encoded JWT.
        """
        payload = {
            "sub": str(user.id),
            "wid": str(user.workspace_id),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        }
        return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")

    @classmethod
    async def register(cls, db: AsyncSession, data: RegisterRequest) -> User:
        """
        Creates a workspace and its first user in one transaction.

        Args:
            db (AsyncSession): Active asynchronous database session.
            data (RegisterRequest): Workspace name, user name, email, and password.

        Returns:
            User: The newly created user.

        Raises:
            HTTPException: 409 when the email is already registered.
        """
        email = data.email.lower()
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalars().first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

        workspace = Workspace(name=data.workspace_name)
        user = User(workspace=workspace, name=data.name, email=email, password_hash=cls.hash_password(data.password))
        db.add_all([workspace, user])
        await db.commit()
        await db.refresh(user)
        return user

    @classmethod
    async def login(cls, db: AsyncSession, email: str, password: str) -> str:
        """
        Verifies credentials and returns an access token.

        Args:
            db (AsyncSession): Active asynchronous database session.
            email (str): Login email.
            password (str): Plain text password.

        Returns:
            str: Encoded JWT.

        Raises:
            HTTPException: 401 with the same message for unknown email and wrong password.
        """
        result = await db.execute(select(User).where(User.email == email.lower()))
        user = result.scalars().first()
        if not user or not cls.verify_password(password, user.password_hash):
            raise _unauthorized("Invalid email or password")
        return cls.create_token(user)

    @classmethod
    async def get_user_from_token(cls, db: AsyncSession, token: str) -> User:
        """
        Resolves an access token to its user.

        Args:
            db (AsyncSession): Active asynchronous database session.
            token (str): Encoded JWT.

        Returns:
            User: The token's user, with workspace loaded.

        Raises:
            HTTPException: 401 when the token is malformed, expired, or its user no longer exists.
        """
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = uuid.UUID(payload["sub"])
        except (jwt.PyJWTError, KeyError, ValueError):
            raise _unauthorized("Invalid or expired token")

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalars().first()
        if not user:
            raise _unauthorized("Invalid or expired token")
        return user
