import re
from typing import Tuple, List

# Regex patterns for credential signatures
AWS_KEY_PATTERN = re.compile(r'AKIA[0-9A-Z]{16}')
RSA_KEY_PATTERN = re.compile(r'-----BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY-----(?:[\s\S]*?-----END (?:RSA|OPENSSH|EC) PRIVATE KEY-----|[\s\S]*)')
API_KEY_PATTERN = re.compile(r'(?i)\b(api[_-]?key|secret[_-]?key|bearer)(\s*[:=]\s*)(["\'])[A-Za-z0-9%_-]{16,}\3')
DB_URI_PATTERN = re.compile(r'(?i)\b(postgres|mysql|mongodb|redis)://([^:\s]+):([^@\s]+)@')


def scrub_secrets(content: str) -> Tuple[str, List[str]]:
    """
    Scrub common secret signatures from text content.
    
    Returns a tuple of (sanitized_content, list_of_detected_secret_types).
    """
    if not content or not isinstance(content, str):
        return content or "", []

    detected_secrets: List[str] = []
    sanitized = content

    # 1. AWS Access Key ID
    if AWS_KEY_PATTERN.search(sanitized):
        detected_secrets.append("AWS_KEY")
        sanitized = AWS_KEY_PATTERN.sub("[REDACTED_AWS_KEY]", sanitized)

    # 2. RSA/PEM Private Keys
    if RSA_KEY_PATTERN.search(sanitized):
        detected_secrets.append("RSA_PRIVATE_KEY")
        sanitized = RSA_KEY_PATTERN.sub("[REDACTED_PRIVATE_KEY]", sanitized)

    # 3. Generic API Keys / Tokens
    if API_KEY_PATTERN.search(sanitized):
        detected_secrets.append("API_KEY")
        def replace_api_key(match):
            key_name = match.group(1)
            sep = match.group(2)
            quote = match.group(3)
            return f"{key_name}{sep}{quote}[REDACTED_API_KEY]{quote}"
        sanitized = API_KEY_PATTERN.sub(replace_api_key, sanitized)

    # 4. Database URIs
    if DB_URI_PATTERN.search(sanitized):
        detected_secrets.append("DB_PASSWORD")
        def replace_db_uri(match):
            scheme = match.group(1)
            user = match.group(2)
            return f"{scheme}://{user}:[REDACTED_DB_PASSWORD]@"
        sanitized = DB_URI_PATTERN.sub(replace_db_uri, sanitized)

    return sanitized, detected_secrets
