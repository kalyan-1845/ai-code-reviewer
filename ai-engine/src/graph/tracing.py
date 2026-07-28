import os
import logging
from typing import Optional, List, Dict, Any

logger = logging.getLogger("ai_engine.tracing")

_telemetry_initialized = False


def init_telemetry() -> bool:
    """
    Initialize OpenTelemetry and LangChain instrumentation.
    Uses BatchSpanProcessor to ensure asynchronous, non-blocking telemetry exports.
    Degrades gracefully if dependencies are missing or endpoints are unconfigured.
    """
    global _telemetry_initialized
    if _telemetry_initialized:
        return True

    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    tracing_enabled = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"

    if not otlp_endpoint and not tracing_enabled:
        logger.info("Telemetry disabled: neither OTEL_EXPORTER_OTLP_ENDPOINT nor LANGCHAIN_TRACING_V2 is active.")
        return False

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME

        # Configure TracerProvider if not already set
        current_provider = trace.get_tracer_provider()
        if not isinstance(current_provider, TracerProvider):
            resource = Resource.create({SERVICE_NAME: os.getenv("LANGCHAIN_PROJECT", "reposage-ai-engine")})
            provider = TracerProvider(resource=resource)

            if otlp_endpoint:
                try:
                    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
                    exporter = OTLPSpanExporter(endpoint=f"{otlp_endpoint.rstrip('/')}/v1/traces")
                    # BatchSpanProcessor guarantees non-blocking async telemetry exports
                    provider.add_span_processor(BatchSpanProcessor(exporter))
                    logger.info(f"OpenTelemetry OTLP Exporter initialized pointing to {otlp_endpoint}")
                except Exception as otlp_err:
                    logger.warning(f"Failed to initialize OTLP Span Exporter: {otlp_err}")

            trace.set_tracer_provider(provider)

        # Instrument LangChain node calls
        try:
            from opentelemetry.instrumentation.langchain import LangchainInstrumentor
            instrumentor = LangchainInstrumentor()
            if not instrumentor.is_instrumented_by_opentelemetry:
                instrumentor.instrument()
                logger.info("LangchainInstrumentor successfully activated.")
        except Exception as inst_err:
            logger.debug(f"LangchainInstrumentor note: {inst_err}")

        _telemetry_initialized = True
        return True
    except ImportError as imp_err:
        logger.warning(f"OpenTelemetry packages missing; skipping OTel instrumentation: {imp_err}")
        return False
    except Exception as err:
        logger.warning(f"Failed to initialize telemetry layer: {err}")
        return False


def get_tracing_config(callbacks: Optional[List[Any]] = None) -> Dict[str, Any]:
    """
    Construct RunnableConfig dictionary populated with LangSmith tracer callbacks
    if LANGCHAIN_TRACING_V2 is enabled and LANGCHAIN_API_KEY is configured.
    """
    callbacks_list = list(callbacks) if callbacks else []

    tracing_v2 = os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"
    api_key = os.getenv("LANGCHAIN_API_KEY")

    if tracing_v2 and api_key:
        try:
            from langchain_core.tracers import LangChainTracer
            project_name = os.getenv("LANGCHAIN_PROJECT", "reposage-ai-engine")
            tracer = LangChainTracer(project_name=project_name)
            callbacks_list.append(tracer)
            logger.debug(f"Added LangChainTracer for project '{project_name}' to RunnableConfig.")
        except Exception as tracer_err:
            logger.warning(f"Could not instantiate LangChainTracer: {tracer_err}")

    config: Dict[str, Any] = {}
    if callbacks_list:
        config["callbacks"] = callbacks_list

    return config
