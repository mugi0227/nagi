"""
Available models endpoint.

Returns the list of selectable AI models for the current LLM provider.
"""

import time
from typing import Any

import httpx
from fastapi import APIRouter

from app.api.deps import CurrentUser, LLMProvider
from app.core.config import get_settings
from app.core.logger import logger

router = APIRouter()

# Simple in-memory cache for LiteLLM proxy models
_litellm_models_cache: dict[str, Any] = {
    "models": [],
    "fetched_at": 0.0,
}
_LITELLM_CACHE_TTL = 300  # 5 minutes


async def _fetch_litellm_models() -> list[dict[str, str]]:
    """Fetch available models from LiteLLM proxy server."""
    settings = get_settings()
    if not settings.LITELLM_API_BASE:
        return []

    now = time.time()
    if (
        _litellm_models_cache["models"]
        and now - _litellm_models_cache["fetched_at"] < _LITELLM_CACHE_TTL
    ):
        return _litellm_models_cache["models"]

    try:
        headers: dict[str, str] = {}
        if settings.LITELLM_API_KEY:
            headers["Authorization"] = f"Bearer {settings.LITELLM_API_KEY}"

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{settings.LITELLM_API_BASE}/models",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()

        # OpenAI-compatible format: { "data": [{"id": "model-name", ...}, ...] }
        model_list = data.get("data", [])
        result = [
            {"id": m["id"], "name": m.get("id", "")}
            for m in model_list
            if m.get("id")
        ]

        _litellm_models_cache["models"] = result
        _litellm_models_cache["fetched_at"] = now
        return result

    except Exception as e:
        logger.warning(f"Failed to fetch LiteLLM models: {e}")
        if _litellm_models_cache["models"]:
            return _litellm_models_cache["models"]
        return []


@router.get("")
async def list_available_models(
    user: CurrentUser,
    llm_provider: LLMProvider,
):
    """List available AI models for model selection."""
    settings = get_settings()
    provider_type = settings.LLM_PROVIDER

    # Determine default model ID
    if provider_type in ("gemini-api", "vertex-ai"):
        default_model_id = settings.GEMINI_MODEL
    else:
        default_model_id = settings.LITELLM_MODEL

    # Build model list
    models: list[dict[str, str]] = []

    if provider_type == "litellm" and settings.LITELLM_API_BASE:
        proxy_models = await _fetch_litellm_models()
        if proxy_models:
            models = proxy_models
        else:
            for m in llm_provider.get_available_models():
                models.append({"id": m, "name": m})
    else:
        for m in llm_provider.get_available_models():
            models.append({"id": m, "name": m})

    return {
        "provider": provider_type,
        "default_model_id": default_model_id,
        "models": models,
    }
