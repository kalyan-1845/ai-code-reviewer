SECURITY_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

Review this repository codebase batch focusing strictly on SECURITY threats (API leaks, hardcoded credentials, SQL injection, unsafe filesystem usage, insecure patterns, injection risks, authorization issues).
Ignore other aspects like styling or general performance unless they cause a direct security vulnerability.

Here is the repository structure for context:
{structure_text}

Here is the contents of files for this batch:
{contents_text}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after.
Format your JSON precisely as:
{{
  "fileReviews": {{
    "file_path_1": {{
      "security": [
        {{ "type": "threat type", "line": 4, "description": "...", "suggestion": "..." }}
      ]
    }}
  }}
}}

You must obey the JSON output format above."""

PERFORMANCE_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

Review this repository codebase batch focusing strictly on PERFORMANCE optimization opportunities (algorithmic complexity, unnecessary allocations, expensive loops, blocking operations, scalability, resource usage).
Ignore other aspects like styling or security.

Here is the repository structure for context:
{structure_text}

Here is the contents of files for this batch:
{contents_text}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after.
Format your JSON precisely as:
{{
  "fileReviews": {{
    "file_path_1": {{
      "optimization": [
        {{ "type": "slow code", "line": 20, "description": "...", "suggestion": "..." }}
      ]
    }}
  }}
}}

You must obey the JSON output format above."""

STYLE_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

Review this repository codebase batch focusing strictly on Code Quality, logical BUGS, and STYLING (naming/style issues, maintainability, readability, architecture, duplication, best practices, refactoring opportunities).
Ignore security and performance optimizations unless they are direct bugs.

Here is the repository structure for context:
{structure_text}

Here is the contents of files for this batch:
{contents_text}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after.
Format your JSON precisely as:
{{
  "fileReviews": {{
    "file_path_1": {{
      "bugs": [
        {{ "type": "bug name", "line": 12, "description": "...", "suggestion": "..." }}
      ],
      "styling": [
        {{ "type": "convention issue", "line": 15, "description": "...", "suggestion": "..." }}
      ]
    }}
  }}
}}

You must obey the JSON output format above."""

SYNTHESIZER_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

You are the Synthesizer Agent. You are receiving the combined JSON review findings from three specialized agents (Security, Performance, Style) for a batch of files.
Your task is to:
1. Merge the outputs into a single cohesive JSON object.
2. Remove any duplicate or contradictory findings.
3. Keep the findings well-organized in their respective categories.
{readme_mermaid_instructions}

Here is the repository structure for context:
{structure_text}

Here are the specialized agent findings:
{agent_findings}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after.
Format your JSON precisely as:
{{
  "fileReviews": {{
    "file_path_1": {{
      "bugs": [
        {{ "type": "bug name", "line": 12, "description": "...", "suggestion": "..." }}
      ],
      "security": [
        {{ "type": "threat type", "line": 4, "description": "...", "suggestion": "..." }}
      ],
      "optimization": [
        {{ "type": "slow code", "line": 20, "description": "...", "suggestion": "..." }}
      ],
      "styling": [
        {{ "type": "convention issue", "line": 15, "description": "...", "suggestion": "..." }}
      ]
    }}
  }}{readme_mermaid_schema}
}}

You must obey the JSON output format above."""
