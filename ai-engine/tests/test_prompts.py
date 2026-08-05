"""
Unit tests for ai-engine/agents/prompts.py.

Covers:
- All 8 agent prompt templates are non-empty strings
- All prompts contain required placeholders
- Prompt.format() does not raise KeyError with valid arguments
- Placeholder substitution produces non-empty strings
"""
import pytest
from agents.prompts import (
    SECURITY_AGENT_PROMPT,
    PERFORMANCE_AGENT_PROMPT,
    STYLE_AGENT_PROMPT,
    IMPACT_ANALYSIS_AGENT_PROMPT,
    TEST_GENERATION_AGENT_PROMPT,
    ARCHITECTURE_AGENT_PROMPT,
    SYNTHESIZER_AGENT_PROMPT,
    HISTORICAL_BUG_AGENT_PROMPT,
)


PROMPTS = {
    "SECURITY_AGENT_PROMPT": SECURITY_AGENT_PROMPT,
    "PERFORMANCE_AGENT_PROMPT": PERFORMANCE_AGENT_PROMPT,
    "STYLE_AGENT_PROMPT": STYLE_AGENT_PROMPT,
    "IMPACT_ANALYSIS_AGENT_PROMPT": IMPACT_ANALYSIS_AGENT_PROMPT,
    "TEST_GENERATION_AGENT_PROMPT": TEST_GENERATION_AGENT_PROMPT,
    "ARCHITECTURE_AGENT_PROMPT": ARCHITECTURE_AGENT_PROMPT,
    "SYNTHESIZER_AGENT_PROMPT": SYNTHESIZER_AGENT_PROMPT,
    "HISTORICAL_BUG_AGENT_PROMPT": HISTORICAL_BUG_AGENT_PROMPT,
}


class TestPromptStrings:
    @pytest.mark.parametrize("name,prompt", list(PROMPTS.items()))
    def test_prompt_is_non_empty_string(self, name, prompt):
        assert isinstance(prompt, str), f"{name} is not a string"
        assert len(prompt) > 0, f"{name} is empty"

    @pytest.mark.parametrize("name,prompt", list(PROMPTS.items()))
    def test_prompt_contains_company_placeholder(self, name, prompt):
        assert "{company}" in prompt, f"{name} missing {{company}} placeholder"

    @pytest.mark.parametrize("name,prompt", list(PROMPTS.items()))
    def test_prompt_contains_language_placeholder(self, name, prompt):
        assert "{language}" in prompt, f"{name} missing {{language}} placeholder"

    @pytest.mark.parametrize("name,prompt", list(PROMPTS.items()))
    def test_prompt_contains_structure_text_placeholder(self, name, prompt):
        # TEST_GENERATION_AGENT_PROMPT does not use {structure_text} — it focuses only on file changes
        if name == "TEST_GENERATION_AGENT_PROMPT":
            pytest.skip(f"{name} intentionally does not use {{structure_text}}")
        assert "{structure_text}" in prompt, f"{name} missing {{structure_text}} placeholder"

    @pytest.mark.parametrize("name,prompt", list(PROMPTS.items()))
    def test_prompt_contains_contents_text_placeholder(self, name, prompt):
        # TEST_GENERATION_AGENT_PROMPT and SYNTHESIZER_AGENT_PROMPT do not use {contents_text}
        if name in ("TEST_GENERATION_AGENT_PROMPT", "SYNTHESIZER_AGENT_PROMPT"):
            pytest.skip(f"{name} intentionally does not use {{contents_text}}")
        assert "{contents_text}" in prompt, f"{name} missing {{contents_text}} placeholder"


class TestPromptSubstitution:
    """Test that prompts.format() succeeds with valid arguments and produces non-empty output."""

    def test_security_prompt_substitution(self):
        result = SECURITY_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/",
            contents_text="print('hello')",
        )
        assert isinstance(result, str)
        assert len(result) > 0
        assert "AcmeCorp" in result

    def test_performance_prompt_substitution(self):
        result = PERFORMANCE_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/",
            contents_text="print('hello')",
        )
        assert isinstance(result, str)
        assert len(result) > 0

    def test_style_prompt_substitution(self):
        result = STYLE_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/",
            contents_text="print('hello')",
        )
        assert isinstance(result, str)
        assert len(result) > 0

    def test_impact_prompt_substitution(self):
        result = IMPACT_ANALYSIS_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/",
            contents_text="print('hello')",
        )
        assert isinstance(result, str)
        assert len(result) > 0

    def test_test_generation_prompt_substitution(self):
        result = TEST_GENERATION_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/main.py",
            contents_text="def main():\n    pass",
        )
        assert isinstance(result, str)
        assert len(result) > 0
        assert "AcmeCorp" in result
        assert "src/main.py" in result

    def test_architecture_prompt_substitution(self):
        result = ARCHITECTURE_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/",
            contents_text="print('hello')",
        )
        assert isinstance(result, str)
        assert len(result) > 0

    def test_historical_bug_prompt_substitution(self):
        result = HISTORICAL_BUG_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/",
            contents_text="print('hello')",
            historical_bugs_context="No historical bugs found.",
        )
        assert isinstance(result, str)
        assert len(result) > 0
        assert "AcmeCorp" in result

    def test_synthesizer_prompt_substitution(self):
        # SYNTHESIZER_AGENT_PROMPT uses {company}, {language}, {structure_text},
        # {readme_mermaid_instructions}, {readme_mermaid_schema}, {agent_findings}
        result = SYNTHESIZER_AGENT_PROMPT.format(
            company="AcmeCorp",
            language="English",
            structure_text="src/",
            readme_mermaid_instructions="",
            readme_mermaid_schema="",
            agent_findings='{"fileReviews": {}}',
        )
        assert isinstance(result, str)
        assert len(result) > 0
        assert "AcmeCorp" in result


class TestSynthesizerPromptHasAgentFindings:
    def test_synthesizer_prompt_contains_agent_findings_placeholder(self):
        assert "{agent_findings}" in SYNTHESIZER_AGENT_PROMPT


class TestHistoricalBugPromptHasHistoricalContext:
    def test_historical_bug_prompt_contains_historical_bugs_context_placeholder(self):
        assert "{historical_bugs_context}" in HISTORICAL_BUG_AGENT_PROMPT
