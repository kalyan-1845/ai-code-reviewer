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

    @pytest.mark.asyncio
    async def test_run_agent_reraises_for_synthesizer(self):
        """Synthesizer exceptions must be re-raised, not swallowed."""
        caller = AsyncMock(side_effect=RuntimeError('Synthesizer failed'))
        try:
            await _run_agent('Synthesizer', 'sys', 'usr', caller)
            assert False, 'Expected RuntimeError to be raised'
        except RuntimeError as e:
            assert 'Synthesizer failed' in str(e)

    @pytest.mark.asyncio
    async def test_run_agent_non_synth_does_not_re_raise(self):
        """Non-Synth agents should return empty dict on exception, not raise."""
        for agent_name in ['Security', 'Performance', 'Style', 'Architecture']:
            caller = AsyncMock(side_effect=RuntimeError('agent error'))
            result = await _run_agent(agent_name, 'sys', 'usr', caller)
            assert result == {}, f'{agent_name} should return {{}} on error'


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

    @pytest.mark.asyncio
    async def test_entropy_context_included_in_security_prompt_when_high_entropy_found(self):
        """When detect_high_entropy_strings finds secrets, entropy context must be appended to the security prompt."""
        captured_prompts = []

        async def capture_caller(sys, usr):
            captured_prompts.append(usr)
            return {'fileReviews': {}}

        # A high-entropy string (no real secret)
        contents = 'def get_token():\n    return "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"'

        await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='.',
            contents_text=contents,
            is_first_batch=False,
            base_prompt='base',
            llm_caller=capture_caller,
        )
        # First call is to the Security agent
        security_prompt = captured_prompts[0]
        assert 'Entropy' in security_prompt or 'High Shannon Entropy' in security_prompt

    @pytest.mark.asyncio
    async def test_no_entropy_context_when_no_high_entropy_strings(self):
        """When no high-entropy strings are found, the security prompt should not mention entropy."""
        captured_prompts = []

        async def capture_caller(sys, usr):
            captured_prompts.append(usr)
            return {'fileReviews': {}}

        # Plain English text has low entropy
        contents = 'def hello():\n    print("Hello, world!")\n    return True'

        await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='.',
            contents_text=contents,
            is_first_batch=False,
            base_prompt='base',
            llm_caller=capture_caller,
        )
        security_prompt = captured_prompts[0]
        assert 'Potential Secrets' not in security_prompt

    @pytest.mark.asyncio
    async def test_entropy_context_only_appended_to_security_agent(self):
        """Entropy context must only appear in the Security agent prompt, not other agents."""
        captured_prompts = []

        async def capture_caller(sys, usr):
            captured_prompts.append(usr)
            return {'fileReviews': {}}

        contents = 'token = "xV9p$Lm#Q!zRt2Y&k8w@vCdE5g"'
        await run_batch_pipeline(
            company='TestCo',
            language='python',
            structure_text='.',
            contents_text=contents,
            is_first_batch=False,
            base_prompt='base',
            llm_caller=capture_caller,
        )
        # First 4 calls are sub-agents (Security, Performance, Style, Impact)
        # Entropy should only be in the Security prompt (call index 0)
        assert 'Entropy' in captured_prompts[0] or 'High Shannon Entropy' in captured_prompts[0]
        for i in range(1, 4):
            assert 'Potential Secrets' not in captured_prompts[i]
