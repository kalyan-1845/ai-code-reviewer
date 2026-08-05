from typing import Dict, Any
from services.secret_scrubber import scrub_secrets
from src.graph.state import AgentState


def secret_scrubber_node(state: AgentState) -> Dict[str, Any]:
    """
    LangGraph node to scrub secrets from diffs and chunks before LLM completion.
    Appends security alert notification flag to state if secrets are detected.
    """
    raw_diff = state.get("raw_diff", "")
    sanitized_diff, detected_secrets = scrub_secrets(raw_diff)

    # Sanitize existing chunks if present
    chunks = state.get("chunks", [])
    sanitized_chunks = []
    for chunk in chunks:
        scrubbed_chunk, secrets_in_chunk = scrub_secrets(chunk)
        sanitized_chunks.append(scrubbed_chunk)
        for sec in secrets_in_chunk:
            if sec not in detected_secrets:
                detected_secrets.append(sec)

    has_leaked = len(detected_secrets) > 0

    security_alert = None
    if has_leaked:
        secrets_str = ", ".join(detected_secrets)
        security_alert = (
            f"⚠️ SECURITY ALERT: Secrets detected in PR diff ({secrets_str})! "
            "Secrets have been scrubbed before LLM processing. Please immediately revoke and rotate these credentials."
        )

    result = {
        "raw_diff": sanitized_diff,
        "detected_secrets": detected_secrets,
        "has_leaked_secrets": has_leaked,
        "security_alert": security_alert
    }
    if chunks:
        result["chunks"] = sanitized_chunks

    return result
