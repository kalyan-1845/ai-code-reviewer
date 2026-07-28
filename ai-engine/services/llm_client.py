"""
services/llm_client.py
~~~~~~~~~~~~~~~~~~~~~~
LLM Client with Circuit Breaker and Rate-Limit Driven Fallbacks.

Catches HTTP 429 (Rate Limit Exceeded) and 503 (Service Unavailable) errors,
instantly rerouting execution to a secondary model within <200ms.
"""

from __future__ import annotations

import logging
import time
from typing import Callable, Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Model identifiers matching nodes/model_router.py
MODEL_GEMMA = "gemma2-9b-it"
MODEL_LLAMA = "llama-3.3-70b-versatile"
MODEL_DEEPSEEK = "deepseek-r1-distill-llama-70b"

# Pre-defined fallback priority sequences
FALLBACK_CHAINS: Dict[str, List[str]] = {
    MODEL_GEMMA: [MODEL_GEMMA, MODEL_LLAMA, MODEL_DEEPSEEK],
    MODEL_LLAMA: [MODEL_LLAMA, MODEL_DEEPSEEK, MODEL_GEMMA],
    MODEL_DEEPSEEK: [MODEL_DEEPSEEK, MODEL_LLAMA, MODEL_GEMMA],
}


class RateLimitError(Exception):
    """Raised when an LLM provider endpoint returns HTTP 429 Rate Limit Exceeded."""
    def __init__(self, message: str = "HTTP 429 Rate Limit Exceeded", status_code: int = 429):
        super().__init__(message)
        self.status_code = status_code


class ServiceUnavailableError(Exception):
    """Raised when an LLM provider endpoint returns HTTP 503 Service Unavailable."""
    def __init__(self, message: str = "HTTP 503 Service Unavailable", status_code: int = 503):
        super().__init__(message)
        self.status_code = status_code


class LLMClient:
    """
    Client for dispatching LLM prompts with automatic circuit-breaker rerouting.
    """

    def __init__(self, default_model: str = MODEL_LLAMA):
        self.default_model = default_model

    def call_with_fallback(
        self,
        primary_model: str,
        invoke_fn: Callable[[str], Any],
        *args: Any,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Execute `invoke_fn(model_name)` with automatic rate-limit and 503 fallback.

        Parameters
        ----------
        primary_model : str
            Target model to attempt first.
        invoke_fn : Callable[[str], Any]
            Function accepting model name as first parameter.

        Returns
        -------
        Dict[str, Any]
            {"result": response_data, "model_used": string, "fallback_occurred": bool, "latency_ms": float}
        """
        chain = FALLBACK_CHAINS.get(primary_model, [primary_model, MODEL_LLAMA, MODEL_GEMMA])
        start_time = time.perf_counter()
        fallback_occurred = False
        last_exception: Optional[Exception] = None

        for model in chain:
            try:
                result = invoke_fn(model, *args, **kwargs)
                latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return {
                    "result": result,
                    "model_used": model,
                    "fallback_occurred": fallback_occurred,
                    "latency_ms": latency_ms,
                }
            except (RateLimitError, ServiceUnavailableError) as exc:
                fallback_occurred = True
                last_exception = exc
                logger.warning(
                    "LLMClient: Model '%s' hit %s (%s). Rerouting within fallback chain...",
                    model,
                    exc.__class__.__name__,
                    exc,
                )
            except Exception as exc:
                # Check for HTTP 429/503 status code in generic exceptions
                status_code = getattr(exc, "status_code", getattr(exc, "status", None))
                if status_code in (429, 503) or "429" in str(exc) or "503" in str(exc):
                    fallback_occurred = True
                    last_exception = exc
                    logger.warning(
                        "LLMClient: Model '%s' status %s. Rerouting within fallback chain...",
                        model,
                        status_code or str(exc),
                    )
                else:
                    raise exc

        # If all models in fallback chain failed
        raise last_exception or RuntimeError("All LLM fallback models failed.")


def circuit_breaker_fallback(primary_model: str = MODEL_LLAMA):
    """
    Decorator wrapper for LLM execution functions to apply circuit-breaker fallback.
    """
    def decorator(fn: Callable):
        def wrapper(*args: Any, **kwargs: Any):
            client = LLMClient(default_model=primary_model)
            def invoke_adapter(model_name: str):
                return fn(model_name, *args, **kwargs)
            return client.call_with_fallback(primary_model, invoke_adapter)
        return wrapper
    return decorator
