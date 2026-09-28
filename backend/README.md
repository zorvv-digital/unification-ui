# Unification Backend

FastAPI backend for the unified inbox platform. Follows the Zeryva-backend layout and style.

## Folder Structure

```text
backend/
├── app/
│   ├── main.py              # FastAPI entrypoint (creates tables, seeds demo workspace)
│   ├── config/settings.py   # Settings from environment / .env
│   ├── db/                  # Async session + all SQLAlchemy models (models.py)
│   ├── models/schemas.py    # All Pydantic request/response schemas
│   ├── services/            # Business logic (classmethod services)
│   ├── api/                 # One router per resource, mounted under /api/v1
│   └── demo/seed.json       # Demo workspace seed data
└── tests/                   # Pytest, runs against a temporary SQLite database
```

## Quickstart

```bash
uv sync                                   # create .venv and install dependencies
cp .env.example .env                      # optional; defaults work for local dev
uv run uvicorn app.main:app --reload --port 8000
```

- Swagger UI: http://localhost:8000/docs
- Demo login (when `DEMO_MODE=true`): `demo@unification.app` / `demo12345`

## Tests

```bash
uv run pytest
```

## Docs

- Manual API testing through Swagger: [`../docs/api-testing-swagger.md`](../docs/api-testing-swagger.md)
- End-to-end UI flow: [`../docs/ui-user-flow.md`](../docs/ui-user-flow.md)
