import math
import re
from typing import List, Tuple

def calculate_shannon_entropy(data: str) -> float:
    """Calculates the Shannon entropy of a string."""
    if not data:
        return 0.0
    entropy = 0.0
    for x in set(data):
        p_x = float(data.count(x)) / len(data)
        entropy -= p_x * math.log2(p_x)
    return entropy


def _extract_quoted_strings(text: str) -> List[str]:
    """
    Extracts the contents of double- and single-quoted string literals from
    `text`, properly handling backslash-escaped quotes within the string.
    """
    results = []
    for quote in ('"', "'"):
        i = 0
        while i < len(text):
            if text[i] == '\\' and i + 1 < len(text):
                # skip escaped character, consume both escape and escaped char
                i += 2
                continue
            if text[i] == quote:
                # found opening quote, now find the closing unescaped quote
                j = i + 1
                while j < len(text):
                    if text[j] == '\\' and j + 1 < len(text):
                        j += 2
                        continue
                    if text[j] == quote:
                        results.append(text[i + 1:j])
                        i = j
                        break
                    j += 1
                else:
                    # no closing quote found, skip past the opener
                    i += 1
                    continue
            i += 1
    return results


def detect_high_entropy_strings(text: str, threshold: float = 4.5, min_length: int = 16) -> List[Tuple[str, float]]:
    """
    Scans text for string literals and returns those with a Shannon entropy
    exceeding the threshold.
    """
    if not text:
        return []

    string_contents = _extract_quoted_strings(text)

    high_entropy_strings = []
    seen_strings = set()

    for string_content in string_contents:
        if len(string_content) >= min_length and string_content not in seen_strings:
            entropy = calculate_shannon_entropy(string_content)
            if entropy > threshold:
                high_entropy_strings.append((string_content, entropy))
                seen_strings.add(string_content)

    return high_entropy_strings
