"""
Unit tests for ai-engine/agents/pipeline.py.

Covers:
- _run_agent: error handling (synthesizer re-raises, others return {})
- run_batch_pipeline: concurrent dispatch, entropy context, RAG integration,
  synthesizer failure handling, combined findings structure
"""
import pytest
from agents.pipeline import run_batch_pipeline, _run_agent


class TestRunAgent:
    @pytest.mark.asyncio
    async def test_run_agent_returns_llm_result(self):
        async def mock_llm(system, user):
            return {"fileReviews": {"a.py": []}}
        result = await _run_agent("Security", "sys", "user", mock_llm)
        assert result == {"fileReviews": {"a.py": []}}

    @pytest.mark.asyncio
    async def test_run_agent_returns_empty_on_non_synthesizer_failure(self):
        async def failing_llm(system, user):
            raise RuntimeError("network error")
        result = await _run_agent("Security", "sys", "user", failing_llm)
        assert result == {}

    @pytest.mark.asyncio
    async def test_synthesizer_failure_raises(self):
        async def failing_llm(system, user):
            raise RuntimeError("synthesizer down")
        with pytest.raises(RuntimeError, match="synthesizer down"):
            await _run_agent("Synthesizer", "sys", "user", failing_llm)


class TestRunBatchPipeline:
    @pytest.mark.asyncio
    async def test_returns_synthesized_result(self):
        # Mock llm_caller that returns a deterministic result
        call_log = []

        async def mock_llm(system_prompt, user_prompt):
            call_log.append(system_prompt[:20])
            return {"fileReviews": {"test.py": [{"type": "style", "line": 1, "description": "ok"}]}}

        result = await run_batch_pipeline(
            company="TestCorp",
            language="English",
            structure_text="src/",
            contents_text="x = 1",
            is_first_batch=False,
            base_prompt="You are a code reviewer.",
            llm_caller=mock_llm,
            repo_url=None,
        )
        assert "fileReviews" in result
        # 7 sub-agents + 1 synthesizer = 8 calls
        assert len(call_log) == 8

    @pytest.mark.asyncio
    async def test_entropy_context_added_to_security_prompt_when_high_entropy_found(self):
        # A base64-like string with Shannon entropy > 4.5 (detected as potential secret)
        high_entropy_str = "ghp_Test123ABC456DEF789GHI012JKL345MNO"
        contents_with_entropy = f'const apiKey = "{high_entropy_str}"'
        call_log = []

        async def mock_llm(system_prompt, user_prompt):
            call_log.append((system_prompt, user_prompt))
            return {"fileReviews": {}}

        await run_batch_pipeline(
            company="TestCorp",
            language="English",
            structure_text="src/",
            contents_text=contents_with_entropy,
            is_first_batch=False,
            base_prompt="You are a code reviewer.",
            llm_caller=mock_llm,
            repo_url=None,
        )
        # First call is Security agent
        security_user_prompt = call_log[0][1]
        assert "Potential Secrets" in security_user_prompt or "Entropy" in security_user_prompt

    @pytest.mark.asyncio
    async def test_no_entropy_context_when_content_is_clean(self):
        clean_contents = "def foo():\n    return 42"
        call_log = []

        async def mock_llm(system_prompt, user_prompt):
            call_log.append(user_prompt)
            return {"fileReviews": {}}

        await run_batch_pipeline(
            company="TestCorp",
            language="English",
            structure_text="src/",
            contents_text=clean_contents,
            is_first_batch=False,
            base_prompt="You are a code reviewer.",
            llm_caller=mock_llm,
            repo_url=None,
        )
        # Security prompt should not contain entropy context for clean code
        security_prompt = call_log[0]
        assert "Potential Secrets" not in security_prompt

    @pytest.mark.asyncio
    async def test_combined_findings_structure(self):
        call_log = []

        async def mock_llm(system_prompt, user_prompt):
            return {"fileReviews": {"sample.py": [{"type": "bug", "line": 1}]}}

        result = await run_batch_pipeline(
            company="TestCorp",
            language="English",
            structure_text="src/",
            contents_text="x = 1",
            is_first_batch=False,
            base_prompt="You are a code reviewer.",
            llm_caller=mock_llm,
            repo_url=None,
        )
        # Result is the synthesized output (mocked), not the combined findings directly
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_rag_queried_when_repo_url_provided(self):
        import unittest.mock as mock

        call_log = []

        async def mock_llm(system_prompt, user_prompt):
            return {"fileReviews": {}}

        with mock.patch("agents.pipeline.rag.query_chunks") as mock_query:
            mock_query.return_value = [{"content": "Historical bug: SQL injection in login"}]
            await run_batch_pipeline(
                company="TestCorp",
                language="English",
                structure_text="src/",
                contents_text="x = 1",
                is_first_batch=False,
                base_prompt="You are a code reviewer.",
                llm_caller=mock_llm,
                repo_url="https://github.com/test/repo",
            )
            mock_query.assert_called_once()
            call_kwargs = mock_query.call_args.kwargs
            assert call_kwargs.get("repo_url") == "https://github.com/test/repo"

    @pytest.mark.asyncio
    async def test_rag_failure_does_not_break_pipeline(self):
        import unittest.mock as mock

        async def mock_llm(system_prompt, user_prompt):
            return {"fileReviews": {}}

        with mock.patch("agents.pipeline.rag.query_chunks") as mock_query:
            mock_query.side_effect = RuntimeError("RAG unavailable")
            # Should not raise
            result = await run_batch_pipeline(
                company="TestCorp",
                language="English",
                structure_text="src/",
                contents_text="x = 1",
                is_first_batch=False,
                base_prompt="You are a code reviewer.",
                llm_caller=mock_llm,
                repo_url="https://github.com/test/repo",
            )
            assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_synthesizer_returns_empty_raises_runtimeerror(self):
        async def mock_llm(system_prompt, user_prompt):
            return {}  # Empty result simulates synthesizer failure

        with pytest.raises(RuntimeError, match="Synthesizer agent failed"):
            await run_batch_pipeline(
                company="TestCorp",
                language="English",
                structure_text="src/",
                contents_text="x = 1",
                is_first_batch=False,
                base_prompt="You are a code reviewer.",
                llm_caller=mock_llm,
                repo_url=None,
            )
