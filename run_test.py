import json
import pytest
import sys

prompt = """Here are the specialized agent findings:
{"security_findings": {"c.py": {}}}

You MUST reply ONLY in a valid JSON format. Do not write markdown wrapping, do not write explanations before or after."""

start_marker = "Here are the specialized agent findings:\n"
end_marker = "\n\nYou MUST reply ONLY in a valid JSON format."
start = prompt.find(start_marker)
end = prompt.find(end_marker)
print(f"start={start}, end={end}")
if start != -1 and end != -1:
    findings_str = prompt[start + len(start_marker):end]
    print(f"findings_str={repr(findings_str)}")
    findings = json.loads(findings_str)
    print("success")
