"""
LiteLLM provider implementation for local development.

Supports Bedrock, OpenAI, and other providers via LiteLLM.
Includes support for custom endpoints (api_base) for proxy servers.
"""

from typing import Any, Optional

from litellm import LiteLLM

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
            model_name: LiteLLM model identifier (e.g., "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0")
            api_base: Custom API endpoint URL (optional, for proxy servers)
            api_key: Custom API key (optional, overrides default)
        """
        self._model_name = model_name
        self._settings = get_settings()
        self._api_base = api_base or self._settings.LITELLM_API_BASE or None
        self._api_key = api_key or self._settings.LITELLM_API_KEY or None

        # Build LiteLLM kwargs
        litellm_kwargs: dict[str, Any] = {"model": model_name}

        if self._api_base:
            litellm_kwargs["api_base"] = self._api_base

        if self._api_key:
            litellm_kwargs["api_key"] = self._api_key

        self._litellm = LiteLLM(**litellm_kwargs)

    def get_model(self) -> LiteLLM:
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

