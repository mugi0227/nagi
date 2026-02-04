"""
Shared LLM invocation utilities for text generation.
"""

from __future__ import annotations

import json
from typing import Optional

from app.core.config import get_settings
from app.core.logger import logger
from app.interfaces.llm_provider import ILLMProvider


def _is_litellm_provider(llm_provider: ILLMProvider) -> bool:
    settings = getattr(llm_provider, "_settings", None) or get_settings()
    if getattr(settings, "LLM_PROVIDER", None) == "litellm":
        return True
    try:
        from app.infrastructure.local.litellm_provider import LiteLLMProvider
    except Exception:
        return False
    return isinstance(llm_provider, LiteLLMProvider)


def generate_text(
    llm_provider: ILLMProvider,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int = 600,
    response_schema: Optional[dict] = None,
    response_mime_type: Optional[str] = None,
    system_instruction: Optional[str] = None,
) -> Optional[str]:
    """
    Generate text from the configured LLM provider.

    Returns None when the provider is unavailable or the call fails.
    """
    if not prompt:
        return None

    if _is_litellm_provider(llm_provider):
        return _generate_text_litellm(
            llm_provider=llm_provider,
            prompt=prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            response_schema=response_schema,
            system_instruction=system_instruction,
        )

    settings = getattr(llm_provider, "_settings", None)
    api_key = getattr(settings, "GOOGLE_API_KEY", None)
    if not api_key:
        return None

    try:
        from google import genai
        from google.genai.types import Content, GenerateContentConfig, Part
    except Exception as exc:
        logger.warning(f"GenAI import failed: {exc}")
        return None

    config_kwargs: dict = {
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
    }
    if response_schema:
        config_kwargs["response_schema"] = response_schema
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction

    try:
        client = genai.Client(api_key=api_key)
        model_name = llm_provider.get_model()
        response = client.models.generate_content(
            model=model_name,
            contents=[Content(role="user", parts=[Part(text=prompt)])],
            config=GenerateContentConfig(**config_kwargs),
        )
        text = (response.text or "").strip()
        return text or None
    except Exception as exc:
        logger.warning(f"GenAI request failed: {exc}")
    return None


def generate_text_with_status(
    llm_provider: ILLMProvider,
    prompt: str,
    temperature: float = 0.2,
    max_output_tokens: int = 600,
    response_schema: Optional[dict] = None,
    response_mime_type: Optional[str] = None,
    system_instruction: Optional[str] = None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Generate text with error status.

    Returns (text, error_code, error_detail).
    """
    if not prompt:
        return None, "empty_prompt", None

    if _is_litellm_provider(llm_provider):
        return _generate_text_litellm_with_status(
            llm_provider=llm_provider,
            prompt=prompt,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            response_schema=response_schema,
            system_instruction=system_instruction,
        )

    settings = getattr(llm_provider, "_settings", None)
    api_key = getattr(settings, "GOOGLE_API_KEY", None)
    if not api_key:
        return None, "missing_google_api_key", None

    try:
        from google import genai
        from google.genai.types import Content, GenerateContentConfig, Part
    except Exception as exc:
        logger.warning(f"GenAI import failed: {exc}")
        return None, "genai_import_failed", _maybe_detail(exc)

    config_kwargs: dict = {
        "temperature": temperature,
        "max_output_tokens": max_output_tokens,
    }
    if response_schema:
        config_kwargs["response_schema"] = response_schema
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction

    try:
        client = genai.Client(api_key=api_key)
        model_name = llm_provider.get_model()
        response = client.models.generate_content(
            model=model_name,
            contents=[Content(role="user", parts=[Part(text=prompt)])],
            config=GenerateContentConfig(**config_kwargs),
        )
        text = (response.text or "").strip()
        if not text:
            return None, "genai_empty_response", None
        return text, None, None
    except Exception as exc:
        logger.warning(f"GenAI request failed: {exc}")
        return None, "genai_request_failed", _maybe_detail(exc)


def _generate_text_litellm(
    llm_provider: ILLMProvider,
    prompt: str,
    temperature: float,
    max_output_tokens: int,
    response_schema: Optional[dict],
    system_instruction: Optional[str],
) -> Optional[str]:
    try:
        import litellm
    except Exception as exc:
        logger.warning(f"LiteLLM import failed: {exc}")
        return None

    try:
        from app.infrastructure.local.litellm_provider import LiteLLMProvider
    except Exception as exc:
        logger.warning(f"LiteLLM provider import failed: {exc}")
        return None

    if not isinstance(llm_provider, LiteLLMProvider):
        return None

    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})

    user_prompt = prompt
    if response_schema:
        schema_text = json.dumps(response_schema, ensure_ascii=False)
        user_prompt = f"{prompt}\n\nReturn JSON only. Schema:\n{schema_text}"
    messages.append({"role": "user", "content": user_prompt})

    kwargs: dict = {
        "model": llm_provider.get_model_id(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_output_tokens,
    }
    if llm_provider.get_api_base():
        kwargs["api_base"] = llm_provider.get_api_base()
    if llm_provider.get_api_key():
        kwargs["api_key"] = llm_provider.get_api_key()

    try:
        response = litellm.completion(**kwargs)
        content = response.choices[0].message.content
        text = (content or "").strip()
        return text or None
    except Exception as exc:
        logger.warning(f"LiteLLM request failed: {exc}")
        return None


def _generate_text_litellm_with_status(
    llm_provider: ILLMProvider,
    prompt: str,
    temperature: float,
    max_output_tokens: int,
    response_schema: Optional[dict],
    system_instruction: Optional[str],
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    try:
        import litellm
    except Exception as exc:
        logger.warning(f"LiteLLM import failed: {exc}")
        return None, "litellm_import_failed", _maybe_detail(exc)

    try:
        from app.infrastructure.local.litellm_provider import LiteLLMProvider
    except Exception as exc:
        logger.warning(f"LiteLLM provider import failed: {exc}")
        return None, "litellm_provider_import_failed", _maybe_detail(exc)

    if not isinstance(llm_provider, LiteLLMProvider):
        return None, "litellm_provider_mismatch", None

    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})

    user_prompt = prompt
    if response_schema:
        schema_text = json.dumps(response_schema, ensure_ascii=False)
        user_prompt = f"{prompt}\n\nReturn JSON only. Schema:\n{schema_text}"
    messages.append({"role": "user", "content": user_prompt})

    kwargs: dict = {
        "model": llm_provider.get_model_id(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_output_tokens,
    }
    if llm_provider.get_api_base():
        kwargs["api_base"] = llm_provider.get_api_base()
    if llm_provider.get_api_key():
        kwargs["api_key"] = llm_provider.get_api_key()

    try:
        response = litellm.completion(**kwargs)
        content = response.choices[0].message.content if response.choices else ""
        text = (content or "").strip()
        if not text:
            return None, "litellm_empty_response", None
        return text, None, None
    except Exception as exc:
        logger.warning(f"LiteLLM request failed: {exc}")
        return None, "litellm_request_failed", _maybe_detail(exc)


def _maybe_detail(exc: Exception) -> Optional[str]:
    settings = get_settings()
    if not settings.DEBUG:
        return None
    return f"{type(exc).__name__}: {exc}"
