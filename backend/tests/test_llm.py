"""
LLM provider: fake output validity and OpenAI-compatible HTTP handling.
"""

import asyncio
import json

import httpx
import pytest
from pydantic import BaseModel

from app.config.settings import settings
from app.providers import llm
from app.models.schemas import RefineOutput


class Answer(BaseModel):
    answer: str
    confidence: int


def _run(coro):
    return asyncio.run(coro)


def _use_openai(monkeypatch, handler):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(settings, "LLM_MODEL", "test-model")
    monkeypatch.setattr(settings, "LLM_BASE_URL", "https://llm.test/v1")
    monkeypatch.setattr(llm, "_transport", httpx.MockTransport(handler))
    monkeypatch.setattr(llm, "RETRY_DELAY_SECONDS", 0)


def _completion(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def test_fake_provider_returns_text_and_schema_objects(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "fake")
    text = _run(llm.complete([{"role": "user", "content": "Hello there"}]))
    assert isinstance(text, str) and text

    parsed = _run(llm.complete([{"role": "user", "content": "x"}], schema=RefineOutput))
    assert isinstance(parsed, RefineOutput)


def test_openai_text_completion(monkeypatch):
    seen = {}

    def handler(request: httpx.Request):
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["authorization"]
        seen["body"] = json.loads(request.content)
        return _completion("Hi from the model")

    _use_openai(monkeypatch, handler)
    assert _run(llm.complete([{"role": "user", "content": "Hi"}])) == "Hi from the model"
    assert seen["url"] == "https://llm.test/v1/chat/completions"
    assert seen["auth"] == "Bearer test-key"
    assert seen["body"]["model"] == "test-model"
    assert "response_format" not in seen["body"]


def test_openai_schema_completion_requests_and_validates_json(monkeypatch):
    seen = {}

    def handler(request):
        seen["body"] = json.loads(request.content)
        return _completion('```json\n{"answer": "yes", "confidence": 9}\n```')

    _use_openai(monkeypatch, handler)
    result = _run(llm.complete([{"role": "user", "content": "Q"}], schema=Answer))
    assert result == Answer(answer="yes", confidence=9)
    assert seen["body"]["response_format"] == {
        "type": "json_schema", "json_schema": {"name": "Answer", "schema": Answer.model_json_schema()},
    }
    assert "confidence" in seen["body"]["messages"][0]["content"]


@pytest.mark.parametrize("handler", [
    lambda request: httpx.Response(500, json={"error": "boom"}),
    lambda request: _completion("not json at all"),
    lambda request: _completion('{"answer": "missing confidence"}'),
    lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("slow")),
])
def test_openai_failures_raise_llm_error(monkeypatch, handler):
    _use_openai(monkeypatch, handler)
    with pytest.raises(llm.LLMError):
        _run(llm.complete([{"role": "user", "content": "Q"}], schema=Answer))


@pytest.mark.parametrize("status", [429, 503])
def test_openai_retries_once_on_overload(monkeypatch, status):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, json={"error": "busy"}) if len(calls) == 1 else _completion("Back again")

    _use_openai(monkeypatch, handler)
    assert _run(llm.complete([{"role": "user", "content": "Hi"}])) == "Back again"
    assert len(calls) == 2


def test_openai_gives_up_after_three_attempts(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503, json={"error": "high demand"}) if len(calls) < 3 else _completion("Third time lucky")

    _use_openai(monkeypatch, handler)
    assert _run(llm.complete([{"role": "user", "content": "Hi"}])) == "Third time lucky"
    calls.clear()
    monkeypatch.setattr(llm, "_transport", httpx.MockTransport(lambda request: calls.append(request) or httpx.Response(503)))
    with pytest.raises(llm.LLMError):
        _run(llm.complete([{"role": "user", "content": "Hi"}]))
    assert len(calls) == 3


def test_openai_does_not_retry_client_errors(monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(404, json={"error": "no such model"})

    _use_openai(monkeypatch, handler)
    with pytest.raises(llm.LLMError):
        _run(llm.complete([{"role": "user", "content": "Hi"}]))
    assert len(calls) == 1


def test_openai_without_key_raises_llm_error(monkeypatch):
    monkeypatch.setattr(settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(settings, "LLM_API_KEY", None)
    with pytest.raises(llm.LLMError):
        _run(llm.complete([{"role": "user", "content": "Q"}]))
