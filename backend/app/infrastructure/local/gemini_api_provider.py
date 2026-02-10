"""
Gemini API provider for local development.

Uses Gemini API with API Key (no GCP project required).
"""

from app.core.config import get_settings
from app.interfaces.llm_provider import ILLMProvider


class GeminiAPIProvider(ILLMProvider):
    """Gemini API provider using API Key (works in local/gcp)."""

    def __init__(self, model_name: str):
        """
        Initialize Gemini API provider.

        Args:
            model_name: Gemini model name (e.g., "gemini-2.0-flash")
        """
        self._model_name = model_name
        self._settings = get_settings()

        if not self._settings.GOOGLE_API_KEY:
            raise ValueError(
                "GOOGLE_API_KEY is required for Gemini API provider. "
                "Get your API key from https://aistudio.google.com/apikey"
            )

    def get_model(self) -> str:
        """
        Get Gemini model name for ADK.

        ADK will use GOOGLE_API_KEY environment variable automatically.

        Returns:
            Model name string
        """
        return self._model_name

    def get_model_name(self) -> str:
        """Get human-readable model name."""
        return f"Gemini API ({self._model_name})"

    def supports_vision(self) -> bool:
        """Gemini models support vision."""
        return True

    def supports_function_calling(self) -> bool:
        """Gemini models support function calling."""
        return True

    def get_available_models(self) -> list[str]:
        """Return models from AVAILABLE_MODELS config, or default model."""
        models = self._settings.available_models
        if not models:
            return [self._model_name]
        if self._model_name not in models:
            return [self._model_name] + models
        return models

    def with_model(self, model_id: str) -> "GeminiAPIProvider":
        """Create a new provider with a different model name."""
        if model_id == self._model_name:
            return self
        return GeminiAPIProvider(model_name=model_id)

