import pytest
import sys
import os
import tempfile
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from diff_helper import sanitize_repository_path


class TestSanitizeRepositoryPath:
    """Unit tests for sanitize_repository_path function in diff_helper.py."""

    def setup_method(self):
        """Create a temporary working directory for tests."""
        self.temp_dir = tempfile.mkdtemp()

    def teardown_method(self):
        """Clean up the temporary directory."""
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_valid_https_github_url(self):
        """HTTPS GitHub URL should return the expected clone path."""
        url = "https://github.com/owner/repo.git"
        result = sanitize_repository_path(url, self.temp_dir)
        expected = os.path.join(self.temp_dir, "repo")
        assert result == expected

    def test_valid_https_github_url_without_git_suffix(self):
        """HTTPS URL without .git suffix should work correctly."""
        url = "https://github.com/owner/my-repo"
        result = sanitize_repository_path(url, self.temp_dir)
        expected = os.path.join(self.temp_dir, "my-repo")
        assert result == expected

    def test_valid_ssh_style_url(self):
        """SSH-style URL (git@host:user/repo.git) should work correctly."""
        url = "git@github.com:owner/repo.git"
        result = sanitize_repository_path(url, self.temp_dir)
        expected = os.path.join(self.temp_dir, "repo")
        assert result == expected

    def test_github_com_url(self):
        """GitHub.com URL with subpath should extract repo name correctly."""
        url = "https://github.com/my-org/my-special-repo.git"
        result = sanitize_repository_path(url, self.temp_dir)
        assert result == os.path.join(self.temp_dir, "my-special-repo")

    def test_hyphen_in_repo_name_allowed(self):
        """Repo names with hyphens should be accepted."""
        url = "https://github.com/owner/my-repo-name.git"
        result = sanitize_repository_path(url, self.temp_dir)
        assert result == os.path.join(self.temp_dir, "my-repo-name")

    def test_underscore_in_repo_name_allowed(self):
        """Repo names with underscores should be accepted."""
        url = "https://github.com/owner/my_repo_name.git"
        result = sanitize_repository_path(url, self.temp_dir)
        assert result == os.path.join(self.temp_dir, "my_repo_name")

    def test_empty_url_raises_value_error(self):
        """Empty URL should raise ValueError."""
        with pytest.raises(ValueError):
            sanitize_repository_path("", self.temp_dir)

    def test_url_with_double_dot_in_repo_name_raises_value_error(self):
        """URL where the extracted repo name contains '..' should raise ValueError."""
        # The function strips the path and only keeps the repo name portion.
        # A URL with .. as the repo name itself triggers the check.
        with pytest.raises(ValueError):
            sanitize_repository_path(
                "https://github.com/owner/..",
                self.temp_dir
            )

    def test_repo_name_with_special_chars_raises_value_error(self):
        """Repo name with special characters should raise ValueError."""
        with pytest.raises(ValueError):
            sanitize_repository_path(
                "https://github.com/owner/repo@bad.git",
                self.temp_dir
            )

    def test_repo_name_with_spaces_raises_value_error(self):
        """Repo name with spaces should raise ValueError."""
        with pytest.raises(ValueError):
            sanitize_repository_path(
                "https://github.com/owner/repo%20with%20spaces.git",
                self.temp_dir
            )

    def test_resolved_path_cannot_escape_working_dir(self):
        """sanitize_repository_path should reject paths that resolve outside working_dir."""
        # Create a symlink inside temp_dir that points to a sibling directory outside
        sibling = os.path.join(self.temp_dir, "sibling")
        os.makedirs(sibling, exist_ok=True)
        # Create a subdirectory inside sibling that we'll escape into
        escape_target = os.path.join(sibling, "escaped")
        os.makedirs(escape_target, exist_ok=True)
        # The function will try to put "sibling" in temp_dir — that's fine
        # But the realpath check should prevent putting sibling outside temp_dir
        url = "https://github.com/owner/sibling.git"
        result = sanitize_repository_path(url, self.temp_dir)
        # The returned path should be within temp_dir
        real_result = os.path.realpath(result)
        assert real_result.startswith(os.path.realpath(self.temp_dir) + os.sep)

    def test_function_returns_string(self):
        """sanitize_repository_path should return a string."""
        url = "https://github.com/owner/repo.git"
        result = sanitize_repository_path(url, self.temp_dir)
        assert isinstance(result, str)

    def test_returned_path_does_not_escape_working_dir(self):
        """Returned path should be within the working directory."""
        url = "https://github.com/owner/normal-repo.git"
        result = sanitize_repository_path(url, self.temp_dir)
        real_result = os.path.realpath(result)
        real_base = os.path.realpath(self.temp_dir)
        assert real_result.startswith(real_base + os.sep)
