"""Token usage cost calculation utilities."""

from __future__ import annotations

from typing import Optional

from app.core.logger import logger


def calculate_cost(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
) -> Optional[float]:
    """Calculate cost in USD from model name and token counts.

    Uses litellm's pricing data. Falls back to cost_per_token()
    for models that require name resolution (e.g. bedrock/).
    Returns None if pricing is unavailable.
    """
    if input_tokens == 0 and output_tokens == 0:
        return None

    try:
        import litellm

        # Try direct map lookup first (fast path)
        cost_map = litellm.model_cost
        entry = cost_map.get(model_name) or cost_map.get(f"gemini/{model_name}")
        if entry:
            input_cost = (entry.get("input_cost_per_token", 0) or 0) * input_tokens
            output_cost = (entry.get("output_cost_per_token", 0) or 0) * output_tokens
            return round(input_cost + output_cost, 6)

        # Fallback: litellm's cost_per_token handles model name resolution
        input_cost, output_cost = litellm.cost_per_token(
            model=model_name,
            prompt_tokens=input_tokens,
            completion_tokens=output_tokens,
        )
        return round(input_cost + output_cost, 6)
    except Exception:
        logger.debug(f"No pricing data for model: {model_name}")
        return None
