import base64
import hashlib

from cryptography.fernet import Fernet

from app.config.settings import settings

# ponytail: key derived from SECRET_KEY, so rotating it makes stored channel secrets unreadable (channels must
# reconnect); add a dedicated ENCRYPTION_KEY with rotation when deploying for real customers.
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()))


def encrypt_secret(value: str) -> str:
    """Encrypts a channel secret (access token, app secret) for storage."""
    return _fernet.encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    """Decrypts a value produced by `encrypt_secret`."""
    return _fernet.decrypt(value.encode()).decode()
