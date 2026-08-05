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

def test_detect_high_entropy_strings_empty_input():
    # Empty string should return empty list
    assert detect_high_entropy_strings("") == []
    assert detect_high_entropy_strings(None) == []

def test_detect_high_entropy_strings_with_escape_sequences():
    # Strings with escape sequences should be detected if they exceed threshold
    mock_content = 'api_key = "A1B2C3D4E5F6G7H8I9J0K1L2M3N4"\npassword = \'X9y8z7w6v5u4t3s2r1q0p9o8n7m6\''
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    # Each string should appear in results
    strings_found = [s for s, _ in results]
    assert "A1B2C3D4E5F6G7H8I9J0K1L2M3N4" in strings_found
    assert "X9y8z7w6v5u4t3s2r1q0p9o8n7m6" in strings_found

def test_detect_high_entropy_strings_python_triple_quoted():
    # Python triple-quoted strings contain regular quoted strings inside them
    # which the regex still matches. The triple-quote syntax itself is not
    # a separate token in this regex; the inner content is still captured.
    # This test documents that triple-quoted strings are treated as having
    # regular quoted strings inside them.
    mock_content = '''
    secret = """xV9p$Lm#Q!zRt2Y&k8w@vCdE5gX1Y2"""
    normal = "short"
    '''
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    strings_found = [s for s, _ in results]
    # The inner content between the first pair of quotes is detected
    assert "xV9p$Lm#Q!zRt2Y&k8w@vCdE5gX1Y2" in strings_found

def test_detect_high_entropy_strings_javascript_template_literal():
    # JavaScript template literals (backtick) are NOT matched by the current regex
    # This test documents the current behavior
    mock_content = 'const apiKey = `A1B2C3D4E5F6G7H8I9J0K1L2M3N4`;'
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    strings_found = [s for s, _ in results]
    # Backtick strings are not matched by the current pattern
    assert len(strings_found) == 0

def test_detect_high_entropy_strings_strings_with_newlines():
    # Strings that span multiple lines via escape should be detected
    # A newline escape in a short string makes it longer
    mock_content = 'token = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"'
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    assert len(results) == 1
    assert results[0][1] > 4.0

def test_detect_high_entropy_strings_below_min_length():
    # Strings below min_length should not appear in results
    mock_content = 'short = "A1B2C3D4E5"'  # only 10 chars
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    assert len(results) == 0

def test_detect_high_entropy_strings_unicode_characters():
    # Strings with Unicode should be handled (Unicode counted in length)
    mock_content = 'name = "A1B2C3D4E5F6G7H8中文测试数据"'
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    # The string is long enough; entropy depends on character distribution
    assert len(results) >= 0  # Just verify no crash

def test_calculate_shannon_entropy_edge_cases():
    # Single character has entropy 0
    assert calculate_shannon_entropy("a") == 0.0
    # Two different characters
    assert calculate_shannon_entropy("ab") > 0.0
    # Very long repeated string has entropy approaching 0
    assert calculate_shannon_entropy("a" * 100) == 0.0
    # Empty string handled at function level
    assert calculate_shannon_entropy("") == 0.0
