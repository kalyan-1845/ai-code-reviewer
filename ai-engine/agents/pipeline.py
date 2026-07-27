import json
import asyncio
from typing import Callable, Awaitable, Dict, Any
from .prompts import (
    SECURITY_AGENT_PROMPT,
    PERFORMANCE_AGENT_PROMPT,
    STYLE_AGENT_PROMPT,
    SYNTHESIZER_AGENT_PROMPT
)

async def _run_agent(agent_name: str, system_prompt: str, user_prompt: str, llm_caller: Callable[[str, str], Awaitable[Dict[Any, Any]]]) -> Dict[Any, Any]:
    try:
        return await llm_caller(system_prompt, user_prompt)
    except Exception as e:
        print(f"⚠️ {agent_name} Agent failed: {e}")
        return {}

async def run_batch_pipeline(
    company: str,
    language: str,
    structure_text: str,
    contents_text: str,
    is_first_batch: bool,
    base_prompt: str,
    llm_caller: Callable[[str, str], Awaitable[Dict[Any, Any]]]
) -> Dict[Any, Any]:
    # Construct prompts for sub-agents
    security_user_prompt = SECURITY_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text
    )
    performance_user_prompt = PERFORMANCE_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text
    )
    style_user_prompt = STYLE_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text
    )

    # Dispatch concurrently
    print(f"⏳ Dispatching Security, Performance, and Style agents concurrently...")
    results = await asyncio.gather(
        _run_agent("Security", base_prompt, security_user_prompt, llm_caller),
        _run_agent("Performance", base_prompt, performance_user_prompt, llm_caller),
        _run_agent("Style", base_prompt, style_user_prompt, llm_caller)
    )
    
    security_res, performance_res, style_res = results
    
    # Combine findings to send to Synthesizer
    combined_findings = {
        "security_findings": security_res.get("fileReviews", {}),
        "performance_findings": performance_res.get("fileReviews", {}),
        "style_findings": style_res.get("fileReviews", {})
    }
    
    readme_mermaid_instructions = ""
    readme_mermaid_schema = ""
    if is_first_batch:
        readme_mermaid_instructions = (
            "4. Additionally, you MUST construct a valid Mermaid.js flowchart (graph TD) that outlines the file structure, architecture, and import/dependency flows of the codebase. Ensure it compiles cleanly (use simple alphanumeric identifiers for node IDs, and wrap node labels in double quotes, e.g. A[\"label\"]).\n"
            "5. Generate a highly detailed, professional README.md markdown for the entire repository, outlining installation, folder structure, features, tech stack, and usage guidelines."
        )
        readme_mermaid_schema = (
            ",\n  \"generatedReadme\": \"Write a highly detailed, professional README.md markdown...\",\n"
            "  \"mermaidDiagram\": \"graph TD\\n  A[\\\"Entry Point\\\"] --> B[\\\"Module\\\"]\""
        )
        
    synthesizer_user_prompt = SYNTHESIZER_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        readme_mermaid_instructions=readme_mermaid_instructions,
        readme_mermaid_schema=readme_mermaid_schema,
        agent_findings=json.dumps(combined_findings, indent=2)
    )
    
    # Run synthesizer
    print(f"⏳ Synthesizing specialized agent findings...")
    synthesized_result = await _run_agent("Synthesizer", base_prompt, synthesizer_user_prompt, llm_caller)
    if not synthesized_result:
        raise RuntimeError("Synthesizer agent failed to produce a valid response.")
    
    return synthesized_result
