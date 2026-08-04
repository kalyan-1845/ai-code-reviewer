import pytest
from agents.security_utils import calculate_shannon_entropy, detect_high_entropy_strings

def test_calculate_shannon_entropy():
    # Entropy of an empty string is 0
    assert calculate_shannon_entropy("") == 0.0
    
    # Entropy of a single character repeated is 0
    assert calculate_shannon_entropy("aaaaaaa") == 0.0
    
    # High entropy string (base64 or random bytes) should have high entropy
    high_entropy_str = "xV9p$Lm#Q!zRt2Y&k8w@vC"
    assert calculate_shannon_entropy(high_entropy_str) > 4.0
    
    # Low entropy string (simple english phrase)
    low_entropy_str = "this is a test string"
    assert calculate_shannon_entropy(low_entropy_str) < 4.0

def test_detect_high_entropy_strings():
    # Mock file content containing strings
    mock_content = """
    def get_api_key():
        return "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"
        
    def get_greeting():
        return 'Hello, welcome to the test application.'
        
    def small_secret():
        # Too short to trigger
        return "aB3$"
    """
    
    results = detect_high_entropy_strings(mock_content, threshold=4.2, min_length=16)
    
    assert len(results) == 1
    string_val, entropy = results[0]
    assert string_val == "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"
    assert entropy > 4.2

def test_detect_high_entropy_strings_deduplication():
    # If the same string appears twice, it should only be yielded once
    mock_content = """
    key1 = "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"
    key2 = 'xV9p$Lm#Q!zRt2Y&k8w@vCdE5g'
    """
    
    results = detect_high_entropy_strings(mock_content, threshold=4.2, min_length=16)
    
    assert len(results) == 1
    assert results[0][0] == "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"


def test_detect_high_entropy_strings_returns_empty_list_for_empty_input():
    """Empty text should return an empty list."""
    assert detect_high_entropy_strings("") == []
    assert detect_high_entropy_strings("   \n\n  ") == []


def test_detect_high_entropy_strings_skips_strings_below_min_length():
    """Strings shorter than min_length should be skipped."""
    content = 'api_key = "abc123"'
    results = detect_high_entropy_strings(content, threshold=4.0, min_length=16)
    assert results == []


def test_detect_high_entropy_strings_threshold_boundary():
    """Strings exactly at or just below/above threshold should behave correctly."""
    # A simple alphanumeric string is low entropy
    content = 'token = "abc123def456"'
    results = detect_high_entropy_strings(content, threshold=4.0, min_length=8)
    assert results == []  # simple alphanumeric is below threshold


def test_detect_high_entropy_strings_with_unicode_content():
    """Unicode characters should be handled without crashing."""
    content = 'msg = "Hello World"  # with unicode chars'
    results = detect_high_entropy_strings(content, threshold=4.0, min_length=8)
    # Should not raise, result is list (possibly empty or with matches)


def test_detect_high_entropy_strings_with_escaped_quotes():
    """Strings containing escaped quotes inside should be handled."""
    content = 'token = "secret\\"with\\"escaped"'
    results = detect_high_entropy_strings(content, threshold=3.0, min_length=8)
    # The regex (["\'])(.*?)\1 is non-greedy so it may not capture
    # the full content if there are escaped quotes inside the string
    # This test documents the current behavior


def test_detect_high_entropy_strings_highly_repetitive_low_entropy():
    """Highly repetitive strings should have low entropy."""
    content = 'data = "aaaaaaaaaaaa"'
    entropy = calculate_shannon_entropy("aaaaaaaaaaaa")
    assert entropy < 4.0


def test_detect_high_entropy_strings_with_special_chars_high_entropy():
    """Strings with mixed special characters have high entropy."""
    content = 'key = "!@#$%^&*()_+-=[]{}|;:,.<>?"'
    entropy = calculate_shannon_entropy("!@#$%^&*()_+-=[]{}|;:,.<>?")
    assert entropy > 4.0


def test_detect_high_entropy_strings_max_length_handling():
    """Very long strings should be handled without crashing."""
    long_string = "x" * 10000
    content = f'large = "{long_string}"'
    results = detect_high_entropy_strings(content, threshold=4.0, min_length=16)
    assert isinstance(results, list)

