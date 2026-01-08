"""
LiteLLM provider implementation for local development.

Supports Bedrock, OpenAI, and other providers via LiteLLM.
Includes support for custom endpoints (api_base) for proxy servers.
"""

import os
from typing import Any, Optional

from google.adk.models.lite_llm import LiteLlm

from app.core.config import get_settings
from app.interfaces.llm_provider import ILLMProvider


class LiteLLMProvider(ILLMProvider):
    """LiteLLM provider for local environment with custom endpoint support."""

    def __init__(
        self,
        model_name: str,
        api_base: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """
        Initialize LiteLLM provider.

        Args:
            model_name: LiteLLM model identifier (e.g., "claude-sonnet-4-5-20250929")
            api_base: Custom API endpoint URL (optional, for proxy servers)
                     Note: Do NOT include /v1 suffix - LiteLLM adds it automatically
            api_key: Custom API key (optional, overrides default)
        """
        self._model_name = model_name
        self._settings = get_settings()
        self._api_base = api_base or self._settings.LITELLM_API_BASE or None
        self._api_key = api_key or self._settings.LITELLM_API_KEY or None

        # Enable debug logging if DEBUG is set
        if self._settings.DEBUG:
            os.environ["LITELLM_LOG"] = "DEBUG"

        # Build LiteLLM kwargs for ADK-compatible LiteLLM
        litellm_kwargs: dict[str, Any] = {
            "model": model_name,
        }

        if self._api_base:
            litellm_kwargs["api_base"] = self._api_base

        if self._api_key:
            litellm_kwargs["api_key"] = self._api_key

        # Use ADK's LiteLlm class
        self._litellm = LiteLlm(**litellm_kwargs)

    def get_model(self) -> LiteLlm:
        """
        Get LiteLLM instance for ADK.

        Returns:
            LiteLLM wrapper instance
        """
        return self._litellm

    def get_model_name(self) -> str:
        """Get human-readable model name."""
        if self._api_base:
            return f"LiteLLM ({self._model_name} @ {self._api_base})"
        return f"LiteLLM ({self._model_name})"

    def supports_vision(self) -> bool:
        """
        Check if model supports vision.

        Most modern models via LiteLLM support vision.
        """
        # Claude 3.5 and GPT-4o support vision
        vision_models = ["claude-3", "gpt-4o", "gpt-4-vision"]
        return any(vm in self._model_name.lower() for vm in vision_models)

    def supports_function_calling(self) -> bool:
        """
        Check if model supports function calling.

        Most modern models via LiteLLM support function calling.
        """
        return True

