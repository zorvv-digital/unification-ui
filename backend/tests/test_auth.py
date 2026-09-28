"""
Workspaces and auth: registration, login, token checks, and password privacy.
"""

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config.settings import settings
from tests.conftest import API, auth_headers


def test_health(client):
    assert client.get(f"{API}/health").json() == {"status": "ok"}


def test_register_returns_token_and_me(client):
    email = f"new-{uuid.uuid4().hex[:8]}@Example.com"
    response = client.post(f"{API}/auth/register", json={
        "workspace_name": "Sunrise Bakery", "name": "Asha", "email": email, "password": "password123",
    })
    assert response.status_code == 201
    me = client.get(f"{API}/auth/me", headers=auth_headers(response.json()["access_token"])).json()
    assert me["name"] == "Asha"
    assert me["email"] == email.lower()
    assert me["workspace"]["name"] == "Sunrise Bakery"
    assert me["workspace"]["is_demo"] is False
    assert not any("password" in key for key in me)


def test_register_duplicate_email_conflicts(client):
    body = {"workspace_name": "A", "name": "A", "email": f"dup-{uuid.uuid4().hex[:8]}@example.com", "password": "password123"}
    assert client.post(f"{API}/auth/register", json=body).status_code == 201
    assert client.post(f"{API}/auth/register", json=body).status_code == 409


def test_register_short_password_rejected(client):
    body = {"workspace_name": "A", "name": "A", "email": "short@example.com", "password": "short"}
    assert client.post(f"{API}/auth/register", json=body).status_code == 422


def test_login_wrong_credentials_same_message(client):
    unknown = client.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    wrong = client.post(f"{API}/auth/login", json={"email": settings.DEMO_EMAIL, "password": "wrong-password"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_protected_routes_reject_bad_tokens(client):
    expired = jwt.encode(
        {"sub": str(uuid.uuid4()), "wid": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
        settings.SECRET_KEY, algorithm="HS256",
    )
    assert client.get(f"{API}/conversations").status_code == 401
    assert client.get(f"{API}/conversations", headers=auth_headers("not-a-jwt")).status_code == 401
    assert client.get(f"{API}/conversations", headers=auth_headers(expired)).status_code == 401
