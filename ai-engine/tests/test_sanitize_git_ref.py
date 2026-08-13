"""Unit tests for diff_helper.sanitize_git_ref command-injection prevention."""
import pytest
from diff_helper import sanitize_git_ref


class TestSanitizeGitRef:
    """Tests for sanitize_git_ref command-injection prevention."""

    def test_accepts_simple_branch_name(self):
        assert sanitize_git_ref('main') == 'main'

    def test_accepts_branch_with_slash(self):
        assert sanitize_git_ref('feat/my-branch') == 'feat/my-branch'

    def test_accepts_branch_with_dots(self):
        assert sanitize_git_ref('release/v1.2.3') == 'release/v1.2.3'

    def test_accepts_origin_prefix(self):
        assert sanitize_git_ref('origin/main') == 'origin/main'

    def test_accepts_head(self):
        assert sanitize_git_ref('HEAD') == 'HEAD'

    def test_accepts_commit_hash(self):
        assert sanitize_git_ref('a1b2c3d4e5f6') == 'a1b2c3d4e5f6'

    def test_accepts_long_branch_name_under_limit(self):
        # 256 chars is the limit
        ref = 'feature/' + 'a' * 248
        assert len(ref) == 256
        assert sanitize_git_ref(ref) == ref

    def test_raises_on_non_string_none(self):
        with pytest.raises(ValueError, match='non-empty string'):
            sanitize_git_ref(None)

    def test_raises_on_non_string_int(self):
        with pytest.raises(ValueError, match='non-empty string'):
            sanitize_git_ref(123)

    def test_raises_on_empty_string(self):
        with pytest.raises(ValueError, match='non-empty string'):
            sanitize_git_ref('')

    def test_raises_when_too_long(self):
        long_ref = 'a' * 257
        with pytest.raises(ValueError, match='256'):
            sanitize_git_ref(long_ref)

    def test_raises_when_starts_with_single_hyphen(self):
        with pytest.raises(ValueError, match='hyphen'):
            sanitize_git_ref('-feature')

    def test_raises_when_starts_with_multiple_hyphens(self):
        with pytest.raises(ValueError, match='hyphen'):
            sanitize_git_ref('---bad')

    def test_raises_on_space_in_ref(self):
        with pytest.raises(ValueError, match='invalid characters'):
            sanitize_git_ref('feat branch')

    def test_raises_on_semicolon_in_ref(self):
        with pytest.raises(ValueError, match='invalid characters'):
            sanitize_git_ref('feat;rm-rf')

    def test_raises_on_pipe_in_ref(self):
        with pytest.raises(ValueError, match='invalid characters'):
            sanitize_git_ref('feat|grep')

    def test_raises_on_command_substitution_dollar(self):
        with pytest.raises(ValueError, match='invalid characters'):
            sanitize_git_ref('feat$(whoami)')

    def test_raises_on_backtick_substitution(self):
        with pytest.raises(ValueError, match='invalid characters'):
            sanitize_git_ref('feat`ls`')

    def test_raises_on_ampersand(self):
        with pytest.raises(ValueError, match='invalid characters'):
            sanitize_git_ref('feat&echo')
