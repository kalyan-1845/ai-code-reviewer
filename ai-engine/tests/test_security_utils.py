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

def test_detect_high_entropy_strings_escaped_quotes():
    # A secret nested inside escaped quotes must still be captured as one
    # string literal and reported (the old non-greedy regex stopped at the
    # escaped quote and skipped the rest of the string).
    mock_content = 'config = "password=\\"abc123def456ghi789\\""'
    
    results = detect_high_entropy_strings(mock_content, threshold=4.5, min_length=16)
    
    assert len(results) == 1
    string_val, entropy = results[0]
    assert string_val == 'password=\\"abc123def456ghi789\\"'
    assert "abc123def456ghi789" in string_val
    assert entropy > 4.5


def test_detect_high_entropy_strings_empty_input():
    assert detect_high_entropy_strings("") == []
    assert detect_high_entropy_strings(None) == []


def test_detect_high_entropy_strings_python_triple_quoted():
    mock_content = '''x = """xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"""'''
    results = detect_high_entropy_strings(mock_content, threshold=4.2, min_length=16)
    assert len(results) >= 1


def test_detect_high_entropy_strings_js_template_literal():
    # Template literals use backticks which aren't matched by the single/double
    # quote regex — verify the function gracefully skips them.
    mock_content = '`xV9p$Lm#Q!zRt2Y&k8w@vCdE5g`'
    results = detect_high_entropy_strings(mock_content, threshold=4.2, min_length=16)
    assert len(results) == 0


def test_detect_high_entropy_strings_escape_sequences():
    mock_content = '"xV9p$Lm#Q!zRt\\n2Y&k8w@vCdE5g"'
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    assert len(results) >= 1


def test_detect_high_entropy_strings_below_min_length():
    mock_content = '"aB3$xV9"'
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    assert len(results) == 0


def test_detect_high_entropy_strings_mixed_ascii_nonascii():
    mock_content = '"xV9p$Lm#Q!zRt2Y&k8w@vC Über café"'
    results = detect_high_entropy_strings(mock_content, threshold=4.0, min_length=16)
    assert isinstance(results, list)


def test_detect_high_entropy_strings_dedup_across_quotes():
    content = 'a = "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"\nb = \'xV9p$Lm#Q!zRt2Y&k8w@vCdE5g\''
    results = detect_high_entropy_strings(content, threshold=4.2, min_length=16)
    assert len(results) == 1


def test_detect_high_entropy_strings_multiple_matches():
    mock_content = '''
    key1 = "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"
    key2 = "aB3$xV9p$Lm#Q!zRt2Y&k8"
    '''
    results = detect_high_entropy_strings(mock_content, threshold=4.2, min_length=16)
    assert len(results) == 2
