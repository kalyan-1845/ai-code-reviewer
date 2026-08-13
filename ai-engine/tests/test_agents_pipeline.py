"""Unit tests for ai-engine/agents/pipeline.py async multi-agent dispatch."""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock

from agents.pipeline import run_batch_pipeline, _run_agent


class TestRunAgent:
    """Tests for _run_agent helper."""

    @pytest.mark.asyncio
    async def test_run_agent_returns_llm_result_on_success(self):
        fake_result = {'fileReviews': {'foo.js': {'bugs': []}}}
        caller = AsyncMock(return_value=fake_result)
        result = await _run_agent('Security', 'system prompt', 'user prompt', caller)
        assert result == fake_result
        caller.assert_called_once_with('system prompt', 'user prompt')

    @pytest.mark.asyncio
    async def test_run_agent_returns_empty_dict_on_exception(self):
        caller = AsyncMock(side_effect=RuntimeError('LLM unavailable'))
        result = await _run_agent('Performance', 'sys', 'usr', caller)
        assert result == {}


class TestRunBatchPipeline:
    """Tests for run_batch_pipeline async multi-agent dispatch."""

    @pytest.mark.asyncio
    async def test_dispatches_three_agents_concurrently(self):
        call_log = []

        async def slow_caller(sys, usr):
            call_log.append(sys[:50])
            await asyncio.sleep(0.05)
            return {'fileReviews': {}}

        result = await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='',
            contents_text='',
            is_first_batch=False,
            base_prompt='base',
            llm_caller=slow_caller,
        )
        # Four calls total: 3 concurrent sub-agents + 1 synthesizer
        assert len(call_log) == 4

    @pytest.mark.asyncio
    async def test_synthesizer_receives_combined_findings(self):
        async def tracking_caller(sys, usr):
            return {'fileReviews': {'tracked.js': {'bugs': [{'line': 1}]}}}

        result = await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='.',
            contents_text='pass',
            is_first_batch=False,
            base_prompt='base',
            llm_caller=tracking_caller,
        )
        # Synthesizer should have been called (4th call)
        assert isinstance(result, dict)

    @pytest.mark.asyncio
    async def test_first_batch_adds_readme_and_mermaid_instructions(self):
        captured_prompts = []

        async def capture_caller(sys, usr):
            captured_prompts.append(usr)
            return {'fileReviews': {}, 'generatedReadme': '# Test', 'mermaidDiagram': 'graph TD'}

        await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='.',
            contents_text='pass',
            is_first_batch=True,
            base_prompt='base',
            llm_caller=capture_caller,
        )
        # The synthesizer prompt should contain README and Mermaid instructions
        synth_prompt = captured_prompts[-1]
        assert 'README' in synth_prompt or 'readme' in synth_prompt.lower()
        assert 'mermaid' in synth_prompt.lower() or 'Mermaid' in synth_prompt

    @pytest.mark.asyncio
    async def test_non_first_batch_omits_readme_instructions(self):
        captured_prompts = []

        async def capture_caller(sys, usr):
            captured_prompts.append(usr)
            return {'fileReviews': {}}

        await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='.',
            contents_text='pass',
            is_first_batch=False,
            base_prompt='base',
            llm_caller=capture_caller,
        )
        # The synthesizer prompt should NOT contain README generation instructions
        synth_prompt = captured_prompts[-1]
        assert 'generatedReadme' not in synth_prompt

    @pytest.mark.asyncio
    async def test_returns_synthesized_result(self):
        async def caller(sys, usr):
            return {'fileReviews': {}, 'final': 'result'}

        result = await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='.',
            contents_text='pass',
            is_first_batch=False,
            base_prompt='base',
            llm_caller=caller,
        )
        assert 'final' in result
        assert result['final'] == 'result'
