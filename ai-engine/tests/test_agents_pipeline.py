import pytest
import asyncio
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from agents.pipeline import _run_agent, run_batch_pipeline


class TestRunAgent:
    def test_returns_result_on_success(self):
        async def mock_caller(system, user):
            return {"fileReviews": {"test.py": {"bugs": []}}}

        result = asyncio.run(_run_agent("TestAgent", "system", "user", mock_caller))
        assert result == {"fileReviews": {"test.py": {"bugs": []}}}

    def test_returns_empty_dict_on_exception(self, capsys):
        async def failing_caller(system, user):
            raise RuntimeError("intentional failure")

        result = asyncio.run(_run_agent("TestAgent", "system", "user", failing_caller))
        assert result == {}


class TestRunBatchPipeline:
    def test_dispatches_all_three_agents_concurrently(self):
        call_log = []

        async def mock_caller(system, user):
            call_log.append(system)
            return {"fileReviews": {}}

        asyncio.run(
            run_batch_pipeline(
                company="Acme Corp",
                language="English",
                structure_text=".",
                contents_text=".",
                is_first_batch=True,
                base_prompt="base",
                llm_caller=mock_caller,
            )
        )
        # Security, Performance, Style, and Synthesizer all get called (4 calls)
        assert len(call_log) == 4

    def test_raises_runtime_error_when_synthesizer_fails(self):
        call_count = {"count": 0}

        async def mock_caller(system, user):
            call_count["count"] += 1
            # First 3 calls are agents, 4th is synthesizer
            if call_count["count"] <= 3:
                return {"fileReviews": {}}
            return {}

        with pytest.raises(RuntimeError, match="Synthesizer agent failed"):
            asyncio.run(
                run_batch_pipeline(
                    company="Acme Corp",
                    language="English",
                    structure_text=".",
                    contents_text=".",
                    is_first_batch=True,
                    base_prompt="base",
                    llm_caller=mock_caller,
                )
            )

    def test_omits_readme_mermaid_when_not_first_batch(self):
        received_user_prompts = []

        async def mock_caller(system, user):
            received_user_prompts.append(user)
            if len(received_user_prompts) == 4:
                return {"fileReviews": {}}
            return {"fileReviews": {}}

        asyncio.run(
            run_batch_pipeline(
                company="Acme Corp",
                language="English",
                structure_text=".",
                contents_text=".",
                is_first_batch=False,
                base_prompt="base",
                llm_caller=mock_caller,
            )
        )
        # The 4th call is to the synthesizer
        synthesizer_prompt = received_user_prompts[3]
        assert "README.md" not in synthesizer_prompt
        assert "Mermaid" not in synthesizer_prompt

    def test_includes_readme_mermaid_when_first_batch(self):
        received_user_prompts = []

        async def mock_caller(system, user):
            received_user_prompts.append(user)
            if len(received_user_prompts) == 4:
                return {"fileReviews": {}}
            return {"fileReviews": {}}

        asyncio.run(
            run_batch_pipeline(
                company="Acme Corp",
                language="English",
                structure_text=".",
                contents_text=".",
                is_first_batch=True,
                base_prompt="base",
                llm_caller=mock_caller,
            )
        )
        synthesizer_prompt = received_user_prompts[3]
        assert "README.md" in synthesizer_prompt
        assert "Mermaid" in synthesizer_prompt

    def test_combined_findings_passed_to_synthesizer(self):
        received_user_prompts = []

        async def mock_caller(system, user):
            received_user_prompts.append(user)
            if len(received_user_prompts) == 4:
                return {"fileReviews": {}}
            return {"fileReviews": {"file_" + system[:6]: {}}}

        asyncio.run(
            run_batch_pipeline(
                company="Acme Corp",
                language="English",
                structure_text=".",
                contents_text=".",
                is_first_batch=True,
                base_prompt="base",
                llm_caller=mock_caller,
            )
        )
        synthesizer_prompt = received_user_prompts[3]
        assert "security_findings" in synthesizer_prompt
        assert "performance_findings" in synthesizer_prompt
        assert "style_findings" in synthesizer_prompt
