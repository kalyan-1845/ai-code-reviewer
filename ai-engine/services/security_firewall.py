import re
from typing import Tuple, List, Optional

DEFAULT_INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?previous\s+instructions",
    r"system\s+override",
    r"forget\s+all",
    r"output\s+[\"']?lgtm",
    r"you\s+are\s+now",
]


class SecurityFirewall:
    """
    Pre-flight regex-based heuristic firewall for scanning git diff payloads against prompt injection attacks.
    """

    def __init__(self, patterns: Optional[List[str]] = None):
        patterns = patterns or DEFAULT_INJECTION_PATTERNS
        self.compiled_patterns = [re.compile(p, re.IGNORECASE) for p in patterns]

    def scan(self, diff: str) -> Tuple[bool, str]:
        """
        Scans a git diff string for prompt injection signatures.

        Returns:
            Tuple[bool, str]: (is_safe, reason)
                - (True, "") if the diff payload is safe.
                - (False, reason_string) if a prompt injection signature is detected.
        """
        if not diff or not isinstance(diff, str):
            return True, ""

        for pattern in self.compiled_patterns:
            match = pattern.search(diff)
            if match:
                matched_text = match.group(0)
                reason = f"Security Warning: Prompt injection pattern detected: '{matched_text}'"
                return False, reason

        return True, ""


def scan_diff(diff: str) -> Tuple[bool, str]:
    """
    Convenience function to scan a git diff payload using default SecurityFirewall rules.
    """
    firewall = SecurityFirewall()
    return firewall.scan(diff)
