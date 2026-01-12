"""
LiteLLM provider implementation for local development.

Supports Bedrock, OpenAI, and other providers via LiteLLM.
Includes support for custom endpoints (api_base) for proxy servers.
Supports separate vision model for image processing.
"""

import base64
import os
from typing import Any, Optional

from google.adk.models.lite_llm import LiteLlm

from app.core.config import get_settings
from app.core.logger import logger
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
        self._vision_model = self._settings.LITELLM_VISION_MODEL or None

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

    def get_model_id(self) -> str:
        """Get the raw LiteLLM model identifier."""
        return self._model_name

    def get_api_base(self) -> Optional[str]:
        """Get the configured LiteLLM API base, if any."""
        return self._api_base

    def get_api_key(self) -> Optional[str]:
        """Get the configured LiteLLM API key, if any."""
        return self._api_key

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

    def has_vision_model(self) -> bool:
        """Check if a separate vision model is configured."""
        return bool(self._vision_model)

    async def analyze_image(
        self,
        image_bytes: bytes,
        mime_type: str,
        prompt: str,
    ) -> str:
        """
        Analyze an image using the vision model.

        If LITELLM_VISION_MODEL is not set, returns empty string.
        The main agent will handle the image directly.

        Args:
            image_bytes: Raw image bytes
            mime_type: MIME type of the image (e.g., "image/png")
            prompt: Text prompt describing what to analyze

        Returns:
            Text description of the image from the vision model
        """
        if not self._vision_model:
            return ""

        try:
            import litellm

            # Convert image to base64 data URL
            base64_data = base64.b64encode(image_bytes).decode("utf-8")
            image_url = f"data:{mime_type};base64,{base64_data}"

            # Build message with image content
            messages = [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": image_url},
                        },
                        {
                            "type": "text",
                            "text": prompt,
                        },
                    ],
                }
            ]

            # Call vision model via LiteLLM
            kwargs: dict[str, Any] = {
                "model": self._vision_model,
                "messages": messages,
            }

            if self._api_base:
                kwargs["api_base"] = self._api_base
            if self._api_key:
                kwargs["api_key"] = self._api_key

            logger.info(f"Calling vision model: {self._vision_model}")
            response = await litellm.acompletion(**kwargs)

            result = response.choices[0].message.content
            logger.info(f"Vision model response: {result[:200]}...")
            return result

        except Exception as e:
            logger.error(f"Vision model analysis failed: {e}")
            return f"[Vision analysis failed: {str(e)}]"

