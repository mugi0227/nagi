"""
LLM provider interface.

Defines the contract for LLM (Large Language Model) access.
Implementations: Gemini, LiteLLM (for Bedrock, OpenAI, etc.)
"""

from abc import ABC, abstractmethod
from typing import Any, Union


class ILLMProvider(ABC):
    """Abstract interface for LLM providers."""

    @abstractmethod
    def get_model(self) -> Union[str, Any]:
        """
        Get the model instance or identifier for ADK.

        For Gemini: Returns model name string (e.g., "gemini-2.0-flash")
        For LiteLLM: Returns LiteLlm wrapper instance

        Returns:
            Model identifier or instance compatible with ADK
        """
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        """
        Get the human-readable model name.

        Returns:
            Model name string for logging/display
        """
        pass

    @abstractmethod
    def supports_vision(self) -> bool:
        """
        Check if the model supports vision (image) inputs.

        Returns:
            True if vision is supported
        """
        pass

    @abstractmethod
    def supports_function_calling(self) -> bool:
        """
        Check if the model supports function calling.

        Returns:
            True if function calling is supported
        """
        pass

    @abstractmethod
    def get_available_models(self) -> list[str]:
        """
        Get list of available model identifiers for selection.

        Returns:
            List of model identifier strings
        """
        pass

    def with_model(self, model_id: str) -> "ILLMProvider":
        """
        Create a new provider instance using a different model.

        Returns a new ILLMProvider configured for the given model_id.
        Default implementation returns self (no override).
        """
        return self
