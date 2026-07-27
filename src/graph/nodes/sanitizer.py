from typing import Dict, Any
from src.graph.state import AgentState
from src.security.prompt_guard import PromptGuard


def sanitizer_node(state: AgentState) -> Dict[str, Any]:
    """Sanitizer node to detect and short-circuit prompt injection attacks in PR payloads."""
    raw_diff = state.get("raw_diff", "")
    guard = PromptGuard()
    is_malicious, reason = guard.scan_payload(raw_diff)

    if is_malicious:
        return {
            "is_malicious": True,
            "security_reason": reason,
            "final_review": "🚨 SECURITY ALERT: Potential Prompt Injection detected in PR payload. Review aborted."
        }

    return {
        "is_malicious": False,
        "security_reason": ""
    }
