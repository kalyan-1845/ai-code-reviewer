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

def detect_high_entropy_strings(text: str, threshold: float = 4.5, min_length: int = 16) -> List[Tuple[str, float]]:
    """
    Scans text for string literals and returns those with a Shannon entropy 
    exceeding the threshold.
    """
    if not text:
        return []
        
    # Match double or single quoted strings
    pattern = r'(["\'])(.*?)\1'
    matches = re.findall(pattern, text)
    
    high_entropy_strings = []
    seen_strings = set()
    
    for _, string_content in matches:
        if len(string_content) >= min_length and string_content not in seen_strings:
            entropy = calculate_shannon_entropy(string_content)
            if entropy > threshold:
                high_entropy_strings.append((string_content, entropy))
                seen_strings.add(string_content)
                
    return high_entropy_strings
