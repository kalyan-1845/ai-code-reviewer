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

You are the Synthesizer Agent. You are receiving the combined JSON review findings from specialized agents (Security, Performance, Style, Impact, Architecture) for a batch of files.
Your task is to:
1. Merge the outputs into a single cohesive JSON object.
2. Remove any duplicate or contradictory findings.
3. Keep the findings well-organized in their respective categories.
4. Identify any high-value, large-scale refactoring opportunities (e.g. extracting massive functions) and output them in the `refactoring_suggestions` array. Provide the completely refactored code.
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
      ],
      "historical_bugs": [
        {{ "type": "historical bug regression", "line": 10, "description": "...", "suggestion": "..." }}
      ],
      "impact": [
        {{ "type": "breaking change", "line": 5, "description": "...", "suggestion": "..." }}
      ],
      "tests": [
        {{ "type": "missing test", "line": 10, "description": "...", "suggestion": "..." }}
      ]
    }}
  }},
  "refactoring_suggestions": [
    {{
      "file_path": "file_path_1",
      "refactored_content": "fully refactored file content...",
      "pr_title": "Refactor: Extract massive function",
      "pr_body": "This PR extracts a massive function into a dedicated class for better maintainability."
    }}
  ]{readme_mermaid_schema}
}}

You must obey the JSON output format above."""

IMPACT_ANALYSIS_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

Review this repository codebase batch focusing strictly on CROSS-REPOSITORY DEPENDENCY IMPACT. Look for backwards-incompatible API changes, removed exports, signature modifications, or any changes that could break downstream repositories relying on these contracts.
Ignore other aspects like styling, security, or general performance.

Here is the repository structure for context:
{structure_text}

Here is the contents of files for this batch:
{contents_text}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after.
Format your JSON precisely as:
{{
  "fileReviews": {{
    "file_path_1": {{
      "impact": [
        {{ "type": "breaking change", "line": 5, "description": "...", "suggestion": "..." }}
      ]
    }}
  }}
}}

You must obey the JSON output format above."""

TEST_GENERATION_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

Review this repository codebase batch focusing strictly on MISSING UNIT TESTS. If you detect logic changes in a function or a complex new function without corresponding tests, you should automatically generate the missing unit test code or suggest updates to existing tests.
Ignore styling, security, and general performance.

You must obey the JSON output format above."""

HISTORICAL_BUG_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

Review this repository codebase batch focusing strictly on Historical Bug Pattern Recognition. You are the "Historical Bug Agent".
You will be provided with a list of historical, closed bugs from this repository that were retrieved via RAG similarity search.
Your job is to determine if the CURRENT code changes re-introduce or violate the same domain-specific patterns seen in these historical bugs (e.g. missing tenant ID, uncaught edge case, etc.).
Ignore security, style, and performance unless they directly relate to the retrieved historical bugs.

Here is the repository structure for context:
{structure_text}

Here is the contents of files for this batch:
{contents_text}

Here are the retrieved historical bugs for context:
{historical_bugs_context}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after.
Format your JSON precisely as:
{{
  "fileReviews": {{
    "file_path_1": {{
      "historical_bugs": [
        {{ "type": "historical bug regression", "line": 10, "description": "...", "suggestion": "..." }}
      ]
    }}
  }}
}}

You must obey the JSON output format above."""

ARCHITECTURE_AGENT_PROMPT = """Target Company Persona: {company}
Response Language: {language}

Review this repository codebase batch focusing strictly on ARCHITECTURAL REGRESSION. Detect if developers are bypassing layered architecture constraints (e.g., UI directly querying databases, controllers importing repositories, or violating separation of concerns).
Ignore styling, security, and general performance.

Here is the repository structure for context:
{structure_text}

Here is the contents of files for this batch:
{contents_text}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after.
Format your JSON precisely as:
{{
  "fileReviews": {{
    "file_path_1": {{
      "architecture": [
        {{ "type": "layer bypass", "line": 22, "description": "...", "suggestion": "..." }}
      ],
      "historical_bugs": [
        {{ "type": "historical bug regression", "line": 10, "description": "...", "suggestion": "..." }}
      ]
    }}
  }}
}}

You must obey the JSON output format above."""
