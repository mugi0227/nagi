"""
Boto3 Bedrock provider implementation for direct AWS Bedrock access.

This provider uses boto3 directly to call AWS Bedrock APIs,
providing more control over the API interaction compared to LiteLLM.
"""

from typing import Any, Optional

from app.core.config import get_settings
from app.interfaces.llm_provider import ILLMProvider


class Boto3BedrockModel:
    """
    Wrapper class for boto3 Bedrock client that implements ADK-compatible interface.

    This class wraps the boto3 bedrock-runtime client and provides
    methods compatible with Google ADK's model interface.
    """

    def __init__(
        self,
        model_id: str,
        region_name: str,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        endpoint_url: Optional[str] = None,
    ):
        """
        Initialize Boto3 Bedrock model.

        Args:
            model_id: Bedrock model ID (e.g., "anthropic.claude-3-5-sonnet-20241022-v2:0")
            region_name: AWS region
            aws_access_key_id: AWS access key (optional, uses default credentials if not provided)
            aws_secret_access_key: AWS secret key (optional)
            endpoint_url: Custom endpoint URL (optional, for VPC endpoints or proxies)
        """
        import boto3

        self._model_id = model_id
        self._region_name = region_name
        self._endpoint_url = endpoint_url

        # Build client kwargs
        client_kwargs: dict[str, Any] = {
            "service_name": "bedrock-runtime",
            "region_name": region_name,
        }

        if aws_access_key_id and aws_secret_access_key:
            client_kwargs["aws_access_key_id"] = aws_access_key_id
            client_kwargs["aws_secret_access_key"] = aws_secret_access_key

        if endpoint_url:
            client_kwargs["endpoint_url"] = endpoint_url

        self._client = boto3.client(**client_kwargs)

    @property
    def model_id(self) -> str:
        """Get the model ID."""
        return self._model_id

    def invoke(
        self,
        messages: list[dict[str, Any]],
        system: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Invoke the Bedrock model synchronously.

        Args:
            messages: List of message dicts with 'role' and 'content'
            system: System prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            **kwargs: Additional parameters

        Returns:
            Response dict with 'content' and 'usage' keys
        """
        import json

        # Build request body for Claude models
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages,
        }

        if system:
            body["system"] = system

        response = self._client.invoke_model(
            modelId=self._model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )

        response_body = json.loads(response["body"].read())
        return response_body

    async def invoke_async(
        self,
        messages: list[dict[str, Any]],
        system: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """
        Invoke the Bedrock model asynchronously.

        Uses asyncio to run the synchronous call in a thread pool.

        Args:
            messages: List of message dicts with 'role' and 'content'
            system: System prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            **kwargs: Additional parameters

        Returns:
            Response dict with 'content' and 'usage' keys
        """
        import asyncio

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self.invoke(messages, system, max_tokens, temperature, **kwargs),
        )

    def invoke_stream(
        self,
        messages: list[dict[str, Any]],
        system: Optional[str] = None,
        max_tokens: int = 4096,
        temperature: float = 0.7,
        **kwargs: Any,
    ):
        """
        Invoke the Bedrock model with streaming response.

        Args:
            messages: List of message dicts with 'role' and 'content'
            system: System prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            **kwargs: Additional parameters

        Yields:
            Response chunks
        """
        import json

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages,
        }

        if system:
            body["system"] = system

        response = self._client.invoke_model_with_response_stream(
            modelId=self._model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body),
        )

        for event in response["body"]:
            chunk = json.loads(event["chunk"]["bytes"])
            yield chunk


class Boto3BedrockProvider(ILLMProvider):
    """
    Boto3 Bedrock provider for direct AWS Bedrock access.

    This provider uses boto3 directly instead of LiteLLM,
    providing more control and supporting custom endpoints.
    """

    def __init__(
        self,
        model_id: str,
        region_name: Optional[str] = None,
        endpoint_url: Optional[str] = None,
    ):
        """
        Initialize Boto3 Bedrock provider.

        Args:
            model_id: Bedrock model ID (e.g., "anthropic.claude-3-5-sonnet-20241022-v2:0")
            region_name: AWS region (defaults to settings.AWS_REGION)
            endpoint_url: Custom endpoint URL (optional)
        """
        self._settings = get_settings()
        self._model_id = model_id
        self._region_name = region_name or self._settings.AWS_REGION
        self._endpoint_url = endpoint_url or self._settings.BEDROCK_ENDPOINT_URL or None

        # Validate credentials
        if not self._settings.AWS_ACCESS_KEY_ID and not self._has_default_credentials():
            raise ValueError(
                "AWS credentials required. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, "
                "or configure default AWS credentials."
            )

        self._model = Boto3BedrockModel(
            model_id=self._model_id,
            region_name=self._region_name,
            aws_access_key_id=self._settings.AWS_ACCESS_KEY_ID or None,
            aws_secret_access_key=self._settings.AWS_SECRET_ACCESS_KEY or None,
            endpoint_url=self._endpoint_url,
        )

    def _has_default_credentials(self) -> bool:
        """Check if default AWS credentials are available."""
        try:
            import boto3

            session = boto3.Session()
            credentials = session.get_credentials()
            return credentials is not None
        except Exception:
            return False

    def get_model(self) -> Boto3BedrockModel:
        """
        Get Boto3 Bedrock model instance.

        Returns:
            Boto3BedrockModel instance
        """
        return self._model

    def get_model_name(self) -> str:
        """Get human-readable model name."""
        return f"Bedrock ({self._model_id})"

    def supports_vision(self) -> bool:
        """
        Check if model supports vision.

        Claude 3+ models support vision.
        """
        vision_models = ["claude-3", "claude-3-5"]
        return any(vm in self._model_id.lower() for vm in vision_models)

    def supports_function_calling(self) -> bool:
        """
        Check if model supports function calling.

        Claude 3+ models support function calling.
        """
        return True
