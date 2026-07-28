"""
nodes/model_router.py
~~~~~~~~~~~~~~~~~~~~~
Adaptive Model Router Node for the RepoSage AI Engine.

Evaluates payload complexity dynamically based on diff size, cyclomatic
structure, and file count, routing requests to the optimal model endpoint:
  - Complexity < 30                  -> Gemma ("gemma2-9b-it")
  - 30 <= Complexity < 100           -> Llama 3 ("llama-3.3-70b-versatile")
  - Complexity >= 100 or multi-file  -> DeepSeek ("deepseek-r1-distill-llama-70b")
"""

from __future__ import annotations

import re
from typing import Dict, Any, Tuple

# Control flow and structural keywords used to estimate cyclomatic weight
_CONTROL_KEYWORDS = re.compile(
    r"\b(if|else|for|while|switch|case|try|except|catch|finally|def|class|function|async|await|return|throw|raise)\b|&&|\|\|",
    re.IGNORECASE
)

# Model identifiers
MODEL_GEMMA = "gemma2-9b-it"
MODEL_LLAMA = "llama-3.3-70b-versatile"
MODEL_DEEPSEEK = "deepseek-r1-distill-llama-70b"


def calculate_complexity(diff_text: str, num_files: int = 1) -> Tuple[float, str]:
    """
    Calculate payload complexity score C = diff_lines * cyclomatic_weight.

    Parameters
    ----------
    diff_text : str
        The raw diff or source code text to evaluate.
    num_files : int
        Number of files modified in the review batch.

    Returns
    -------
    Tuple[float, str]
        (complexity_score, selected_model_identifier)
    """
    if not diff_text or not diff_text.strip():
        return 0.0, MODEL_GEMMA

    lines = [l for l in diff_text.splitlines() if l.strip()]
    diff_lines = len(lines)

    # Count control structure keywords
    branch_matches = len(_CONTROL_KEYWORDS.findall(diff_text))
    cyclomatic_weight = 1.0 + (branch_matches * 0.1)

    complexity_score = round(diff_lines * cyclomatic_weight, 2)

    # Routing rules
    if num_files > 3 or complexity_score >= 100.0:
        model = MODEL_DEEPSEEK
    elif complexity_score < 30.0:
        model = MODEL_GEMMA
    else:
        model = MODEL_LLAMA

    return complexity_score, model


def model_router_node(state: Dict[str, Any]) -> dict:
    """
    LangGraph node that calculates complexity and assigns the optimal LLM model.
    """
    raw_diff: str = state.get("raw_diff", "")
    chunks: list = state.get("chunks") or state.get("ast_chunks") or []
    num_files: int = max(1, len(chunks))

    score, selected_model = calculate_complexity(raw_diff, num_files=num_files)

    return {
        "complexity_score": score,
        "selected_model": selected_model,
    }
