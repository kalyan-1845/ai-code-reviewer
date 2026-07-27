"""Unit tests for ai-engine/agents/prompts.py agent prompt templates."""

import pytest
from agents.prompts import (
    SECURITY_AGENT_PROMPT,
    PERFORMANCE_AGENT_PROMPT,
    STYLE_AGENT_PROMPT,
    SYNTHESIZER_AGENT_PROMPT,
    IMPACT_ANALYSIS_AGENT_PROMPT,
)


SAMPLE_COMPANY = "Acme Corp"
SAMPLE_LANGUAGE = "Python"
SAMPLE_STRUCTURE = "src/\n  main.py\n  utils.py"
SAMPLE_CONTENTS = "src/main.py:\ndef main():\n    pass"
SAMPLE_FINDINGS = '{"fileReviews": {}}'


class TestPromptExistence:
    """Tests that all prompt constants are defined and non-empty."""

    def test_security_agent_prompt_exists(self):
        assert SECURITY_AGENT_PROMPT
        assert len(SECURITY_AGENT_PROMPT) > 50

    def test_performance_agent_prompt_exists(self):
        assert PERFORMANCE_AGENT_PROMPT
        assert len(PERFORMANCE_AGENT_PROMPT) > 50

    def test_style_agent_prompt_exists(self):
        assert STYLE_AGENT_PROMPT
        assert len(STYLE_AGENT_PROMPT) > 50

    def test_synthesizer_agent_prompt_exists(self):
        assert SYNTHESIZER_AGENT_PROMPT
        assert len(SYNTHESIZER_AGENT_PROMPT) > 50

    def test_impact_analysis_agent_prompt_exists(self):
        assert IMPACT_ANALYSIS_AGENT_PROMPT
        assert len(IMPACT_ANALYSIS_AGENT_PROMPT) > 50


class TestPromptPlaceholders:
    """Tests that prompts contain the required template placeholders."""

    def test_security_prompt_has_company_placeholder(self):
        assert "{company}" in SECURITY_AGENT_PROMPT

    def test_security_prompt_has_language_placeholder(self):
        assert "{language}" in SECURITY_AGENT_PROMPT

    def test_security_prompt_has_structure_placeholder(self):
        assert "{structure_text}" in SECURITY_AGENT_PROMPT

    def test_security_prompt_has_contents_placeholder(self):
        assert "{contents_text}" in SECURITY_AGENT_PROMPT

    def test_performance_prompt_has_required_placeholders(self):
        assert "{company}" in PERFORMANCE_AGENT_PROMPT
        assert "{structure_text}" in PERFORMANCE_AGENT_PROMPT
        assert "{contents_text}" in PERFORMANCE_AGENT_PROMPT

    def test_style_prompt_has_required_placeholders(self):
        assert "{company}" in STYLE_AGENT_PROMPT
        assert "{structure_text}" in STYLE_AGENT_PROMPT
        assert "{contents_text}" in STYLE_AGENT_PROMPT

    def test_synthesizer_prompt_has_required_placeholders(self):
        assert "{company}" in SYNTHESIZER_AGENT_PROMPT
        assert "{agent_findings}" in SYNTHESIZER_AGENT_PROMPT

    def test_impact_prompt_has_required_placeholders(self):
        assert "{company}" in IMPACT_ANALYSIS_AGENT_PROMPT
        assert "{structure_text}" in IMPACT_ANALYSIS_AGENT_PROMPT
        assert "{contents_text}" in IMPACT_ANALYSIS_AGENT_PROMPT


class TestPromptContent:
    """Tests that prompts contain required instructions."""

    def test_security_prompt_requires_json_output(self):
        assert "JSON" in SECURITY_AGENT_PROMPT
        assert "valid json format" in SECURITY_AGENT_PROMPT.lower()

    def test_security_prompt_focuses_on_security(self):
        content_lower = SECURITY_AGENT_PROMPT.lower()
        assert "security" in content_lower
        assert "sql injection" in content_lower or "injection" in content_lower

    def test_performance_prompt_focuses_on_performance(self):
        content_lower = PERFORMANCE_AGENT_PROMPT.lower()
        assert "performance" in content_lower
        assert "optimization" in content_lower

    def test_style_prompt_focuses_on_quality(self):
        content_lower = STYLE_AGENT_PROMPT.lower()
        assert "bug" in content_lower
        assert "style" in content_lower

    def test_synthesizer_prompt_directs_merging(self):
        content_lower = SYNTHESIZER_AGENT_PROMPT.lower()
        assert "merge" in content_lower
        assert "synthesizer" in content_lower


class TestPromptTemplateFormatting:
    """Tests that prompts can be formatted with Python string formatting."""

    def test_security_prompt_formats_correctly(self):
        formatted = SECURITY_AGENT_PROMPT.format(
            company=SAMPLE_COMPANY,
            language=SAMPLE_LANGUAGE,
            structure_text=SAMPLE_STRUCTURE,
            contents_text=SAMPLE_CONTENTS,
        )
        assert SAMPLE_COMPANY in formatted
        assert SAMPLE_LANGUAGE in formatted
        assert SAMPLE_STRUCTURE in formatted
        assert SAMPLE_CONTENTS in formatted

    def test_performance_prompt_formats_correctly(self):
        formatted = PERFORMANCE_AGENT_PROMPT.format(
            company=SAMPLE_COMPANY,
            language=SAMPLE_LANGUAGE,
            structure_text=SAMPLE_STRUCTURE,
            contents_text=SAMPLE_CONTENTS,
        )
        assert SAMPLE_COMPANY in formatted

    def test_style_prompt_formats_correctly(self):
        formatted = STYLE_AGENT_PROMPT.format(
            company=SAMPLE_COMPANY,
            language=SAMPLE_LANGUAGE,
            structure_text=SAMPLE_STRUCTURE,
            contents_text=SAMPLE_CONTENTS,
        )
        assert SAMPLE_COMPANY in formatted

    def test_synthesizer_prompt_formats_correctly(self):
        formatted = SYNTHESIZER_AGENT_PROMPT.format(
            company=SAMPLE_COMPANY,
            language=SAMPLE_LANGUAGE,
            agent_findings=SAMPLE_FINDINGS,
            structure_text=SAMPLE_STRUCTURE,
            readme_mermaid_instructions="",
            readme_mermaid_schema="",
        )
        assert SAMPLE_COMPANY in formatted
        assert SAMPLE_FINDINGS in formatted

    def test_impact_prompt_formats_correctly(self):
        formatted = IMPACT_ANALYSIS_AGENT_PROMPT.format(
            company=SAMPLE_COMPANY,
            language=SAMPLE_LANGUAGE,
            structure_text=SAMPLE_STRUCTURE,
            contents_text=SAMPLE_CONTENTS,
        )
        assert SAMPLE_COMPANY in formatted
