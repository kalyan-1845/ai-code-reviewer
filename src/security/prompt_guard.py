import re
from typing import Tuple, Dict


class PromptGuard:
    """Pre-flight prompt injection detector using regex heuristic pattern matching."""

    PATTERNS: Dict[str, str] = {
        "Ignore Previous Instructions": r"(?i)(ignore\s+all\s+previous\s+instructions)",
        "System Override": r"(?i)(system\s+override)",
        "New Role": r"(?i)(new\s+role)",
        "Bypass Filters": r"(?i)(bypass\s+filters)",
        "Disregard Prior Instructions": r"(?i)(disregard\s+all\s+prior\s+instructions)",
        "Forget Instructions": r"(?i)(forget\s+all\s+previous\s+instructions)",
        "Jailbreak Mode": r"(?i)(jailbreak\s+mode|do\s+anything\s+now)",
    }

    def __init__(self) -> None:
        self._compiled_patterns = [
            (name, re.compile(pattern)) for name, pattern in self.PATTERNS.items()
        ]

    def scan_payload(self, text: str) -> Tuple[bool, str]:
        """Scan input payload string for high-entropy prompt injection patterns.

        Args:
            text: Raw input text / PR diff string.

        Returns:
            Tuple[bool, str]: (is_malicious, matched_reason)
        """
        if not text:
            return False, ""

        for name, compiled_regex in self._compiled_patterns:
            match = compiled_regex.search(text)
            if match:
                return True, f"Matched pattern '{name}': {match.group(0)}"

        return False, ""
