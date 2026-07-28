import json
import asyncio
from typing import Callable, Awaitable, Dict, Any
from .prompts import (
    SECURITY_AGENT_PROMPT,
    PERFORMANCE_AGENT_PROMPT,
    STYLE_AGENT_PROMPT,
    IMPACT_ANALYSIS_AGENT_PROMPT,
    TEST_GENERATION_AGENT_PROMPT,
    ARCHITECTURE_AGENT_PROMPT,
    SYNTHESIZER_AGENT_PROMPT,
    HISTORICAL_BUG_AGENT_PROMPT
)
from .security_utils import detect_high_entropy_strings
import rag
async def _run_agent(agent_name: str, system_prompt: str, user_prompt: str, llm_caller: Callable[[str, str], Awaitable[Dict[Any, Any]]]) -> Dict[Any, Any]:
    try:
        return await llm_caller(system_prompt, user_prompt)
    except Exception as e:
        print(f"⚠️ {agent_name} Agent failed: {e}")
        if agent_name == "Synthesizer":
            raise
        return {}

async def run_batch_pipeline(
    company: str,
    language: str,
    structure_text: str,
    contents_text: str,
    is_first_batch: bool,
    base_prompt: str,
    llm_caller: Callable[[str, str], Awaitable[Dict[Any, Any]]],
    repo_url: str = None
) -> Dict[Any, Any]:
    
    # 1. Detect high-entropy strings for Security Context
    high_entropy_strings = detect_high_entropy_strings(contents_text)
    entropy_context = ""
    if high_entropy_strings:
        entropy_context = "\n\n### Potential Secrets (High Shannon Entropy Detected):\n"
        for s, ent in high_entropy_strings:
            # Safely truncate string to avoid massive token bloat
            s_trunc = s if len(s) < 100 else s[:97] + "..."
            entropy_context += f"- String: `{s_trunc}` (Entropy: {ent:.2f})\n"
        entropy_context += "\nPlease semantically analyze these high-entropy strings. Determine if they are true cryptographic secrets/keys or benign (e.g., test tokens, hashes, UUIDs)."

    # Construct prompts for sub-agents
    security_user_prompt = SECURITY_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text
    ) + entropy_context
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
    impact_user_prompt = IMPACT_ANALYSIS_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text
    )

    test_user_prompt = TEST_GENERATION_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text
    )

    architecture_user_prompt = ARCHITECTURE_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text
    )

    # Query RAG for historical bugs
    historical_bugs_context = "No historical bugs found."
    if repo_url:
        try:
            chunks = rag.query_chunks(query_text=contents_text, n_results=3, repo_url=repo_url)
            if chunks:
                historical_bugs_context = "\n\n".join([f"Bug: {c.get('content')}" for c in chunks])
        except Exception as e:
            print(f"⚠️ Failed to query RAG for historical bugs: {e}")

    historical_bug_user_prompt = HISTORICAL_BUG_AGENT_PROMPT.format(
        company=company,
        language=language,
        structure_text=structure_text,
        contents_text=contents_text,
        historical_bugs_context=historical_bugs_context
    )

    # Dispatch concurrently
    print(f"⏳ Dispatching Security, Performance, Style, Impact, Test, Architecture, and Historical Bug agents concurrently...")
    results = await asyncio.gather(
        _run_agent("Security", base_prompt, security_user_prompt, llm_caller),
        _run_agent("Performance", base_prompt, performance_user_prompt, llm_caller),
        _run_agent("Style", base_prompt, style_user_prompt, llm_caller),
        _run_agent("Impact", base_prompt, impact_user_prompt, llm_caller),
        _run_agent("TestGeneration", base_prompt, test_user_prompt, llm_caller),
        _run_agent("Architecture", base_prompt, architecture_user_prompt, llm_caller),
        _run_agent("HistoricalBug", base_prompt, historical_bug_user_prompt, llm_caller)
    )
    
    security_res, performance_res, style_res, impact_res, test_res, arch_res, historical_res = results
    
    # Combine findings to send to Synthesizer
    combined_findings = {
        "security_findings": security_res.get("fileReviews", {}),
        "performance_findings": performance_res.get("fileReviews", {}),
        "style_findings": style_res.get("fileReviews", {}),
        "impact_findings": impact_res.get("fileReviews", {}),
        "test_findings": test_res.get("fileReviews", {}),
        "architecture_findings": arch_res.get("fileReviews", {}),
        "historical_bug_findings": historical_res.get("fileReviews", {})
    }
    
    readme_mermaid_instructions = ""
    readme_mermaid_schema = ""
    if is_first_batch:
        readme_mermaid_instructions = (
            "4. Additionally, you MUST construct a valid Mermaid.js flowchart (graph TD) that outlines the file structure, architecture, and import/dependency flows of the codebase. Ensure it compiles cleanly (use simple alphanumeric identifiers for node IDs, and wrap node labels in double quotes, e.g. A[\"label\"]).\n"
            "5. Generate a Code Complexity Heatmap (Mermaid.js graph TD) based on your estimation of cyclomatic and cognitive complexity of the changed files. Use classes to color nodes (e.g., Red for high risk, Yellow for medium, Green for low) to help reviewers triage the PR.\n"
            "6. Generate a highly detailed, professional README.md markdown for the entire repository, outlining installation, folder structure, features, tech stack, and usage guidelines."
        )
        readme_mermaid_schema = (
            ",\n  \"generatedReadme\": \"Write a highly detailed, professional README.md markdown...\",\n"
            "  \"mermaidDiagram\": \"graph TD\\n  A[\\\"Entry Point\\\"] --> B[\\\"Module\\\"]\",\n"
            "  \"complexityHeatmap\": \"graph TD\\n  A[\\\"file1.py\\\"]:::high\\n  B[\\\"file2.py\\\"]:::low\\n  classDef high fill:#f96,stroke:#333;\\n  classDef low fill:#9f6,stroke:#333;\""
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
