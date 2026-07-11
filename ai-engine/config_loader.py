"""
config_loader.py

Loads and applies `.codereviewer.yml`, letting a team disable noisy checks,
adjust severities, and ignore generated/vendored file paths instead of
every project being forced to accept the same fixed default behavior.

The ai-engine never touches the filesystem of the repository being
reviewed — the backend already walks the repo and sends every readable
file (including `.yml`/`.yaml` files) as part of the `files` list on
POST /analyze. So `.codereviewer.yml`, if present, arrives as just
another entry in that list; `load_config_from_files` looks for it there
rather than opening a path directly.
"""

import fnmatch
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import yaml

CONFIG_FILENAME = ".codereviewer.yml"

VALID_SEVERITIES = {"off", "info", "warning", "error"}


class ConfigValidationError(Exception):
    """Raised for a malformed .codereviewer.yml. The caller should halt the
    review rather than silently ignoring the invalid entry."""


@dataclass
class CodeReviewerConfig:
    version: int = 1
    rules: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    ignore_paths: List[str] = field(default_factory=list)
    languages: Dict[str, Dict[str, Any]] = field(default_factory=dict)

    def get_rule_severity(self, rule_name: str, default: str = "error") -> str:
        """
        Look up the configured severity for a rule. Falls back to `default`
        (the rule's normal severity) when the rule isn't mentioned in the
        config at all — unspecified rules retain their defaults.
        """
        rule_config = self.rules.get(rule_name)
        if not rule_config:
            return default
        return rule_config.get("severity", default)

    def is_rule_off(self, rule_name: str) -> bool:
        return self.get_rule_severity(rule_name, default="error") == "off"

    def is_path_ignored(self, path: str) -> bool:
        normalized = path.replace("\\", "/")
        return any(fnmatch.fnmatch(normalized, pattern) for pattern in self.ignore_paths)

    def is_language_enabled(self, language_key: str) -> bool:
        lang_config = self.languages.get(language_key)
        if not lang_config:
            return True
        return lang_config.get("enabled", True) is not False


class ConfigLoader:
    """
    Thin wrapper matching the shape requested in the issue
    (`load(path)` / `get_rule_severity(rule_name)`), backed by
    `parse_config_text` so both a raw path (CLI/local use) and content
    already read into memory (this project's actual request flow) share
    the same parsing and validation logic.
    """

    def __init__(self):
        self.config: CodeReviewerConfig = CodeReviewerConfig()

    def load(self, path: str) -> CodeReviewerConfig:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        self.config = parse_config_text(text)
        return self.config

    def get_rule_severity(self, rule_name: str, default: str = "error") -> str:
        return self.config.get_rule_severity(rule_name, default)


def _normalize_yaml_bool_severities(rules: Dict[str, Any]) -> None:
    """
    YAML 1.1 (which PyYAML's safe_load follows) treats the unquoted scalar
    `off` as the boolean False (and `on`/`yes`/`no` similarly), so
    `severity: off` in a real .codereviewer.yml parses as
    {"severity": False}, not the string "off". Normalize that back to the
    string authors actually wrote, in place, before validation.
    """
    for rule_settings in rules.values():
        if isinstance(rule_settings, dict) and rule_settings.get("severity") is False:
            rule_settings["severity"] = "off"


def _validate_raw_config(raw: Dict[str, Any]) -> None:
    if not isinstance(raw, dict):
        raise ConfigValidationError(f"{CONFIG_FILENAME} must contain a YAML mapping at the top level.")

    rules = raw.get("rules") or {}
    if not isinstance(rules, dict):
        raise ConfigValidationError("'rules' must be a mapping of rule name to settings.")

    _normalize_yaml_bool_severities(rules)

    for rule_name, rule_settings in rules.items():
        if not isinstance(rule_settings, dict):
            raise ConfigValidationError(f"Rule '{rule_name}' must map to a settings object.")
        severity = rule_settings.get("severity")
        if severity is not None and severity not in VALID_SEVERITIES:
            raise ConfigValidationError(
                f"Invalid severity '{severity}' for rule '{rule_name}'. "
                f"Must be one of: {', '.join(sorted(VALID_SEVERITIES))}."
            )

    ignore_paths = raw.get("ignore_paths") or []
    if not isinstance(ignore_paths, list) or not all(isinstance(p, str) for p in ignore_paths):
        raise ConfigValidationError("'ignore_paths' must be a list of glob string patterns.")

    languages = raw.get("languages") or {}
    if not isinstance(languages, dict):
        raise ConfigValidationError("'languages' must be a mapping of language name to settings.")
    for lang_name, lang_settings in languages.items():
        if not isinstance(lang_settings, dict):
            raise ConfigValidationError(f"Language entry '{lang_name}' must map to a settings object.")


def parse_config_text(text: str) -> CodeReviewerConfig:
    """Parse and validate raw YAML text into a CodeReviewerConfig."""
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as e:
        raise ConfigValidationError(f"{CONFIG_FILENAME} is not valid YAML: {e}")

    if raw is None:
        raw = {}

    _validate_raw_config(raw)

    return CodeReviewerConfig(
        version=raw.get("version", 1),
        rules=raw.get("rules") or {},
        ignore_paths=raw.get("ignore_paths") or [],
        languages=raw.get("languages") or {},
    )


def load_config_from_files(files: List[Any]) -> Optional[CodeReviewerConfig]:
    """
    Find `.codereviewer.yml` at the repository root among an already-loaded
    list of files (objects/dicts with `.name`/`.content` or `["name"]`/
    `["content"]`) and parse it. Returns None if the file isn't present,
    which callers should treat as "use all defaults, unchanged" per the
    issue's acceptance criteria. Raises ConfigValidationError if the file
    is present but malformed — callers should let this halt the review.
    """
    for f in files:
        name = getattr(f, "name", None) if not isinstance(f, dict) else f.get("name")
        if name == CONFIG_FILENAME:
            content = getattr(f, "content", None) if not isinstance(f, dict) else f.get("content")
            return parse_config_text(content or "")
    return None
