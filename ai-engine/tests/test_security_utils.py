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
