import os
import sys
import pytest
import tempfile
import json

# Patch VECTORS_FILE to a temp location before importing vectorstore
_temp_vectors_file = None


@pytest.fixture(autouse=True)
def fresh_vectorstore():
    """Reset vectorstore state and use a temp file for each test."""
    import vectorstore as vs

    # Create a unique temp file per test, pre-initialized to empty
    fd, tmp_path = tempfile.mkstemp(suffix='.json')
    os.close(fd)
    # Write empty list so _load() picks up [] (avoids UnboundLocalError from _load's assignment)
    with open(tmp_path, 'w') as f:
        json.dump([], f)
    old_file = vs.VECTORS_FILE
    vs.VECTORS_FILE = tmp_path
    vs._vectors = []

    yield tmp_path

    # Cleanup
    vs.VECTORS_FILE = old_file
    vs._vectors = []
    if os.path.exists(tmp_path):
        os.remove(tmp_path)


class TestAddVector:
    def test_add_vector_returns_entry_with_hash(self, fresh_vectorstore):
        import vectorstore as vs
        entry = vs.add_vector('src/main.py', 'print("hello")', [0.1, 0.2, 0.3])
        assert entry['file_path'] == 'src/main.py'
        assert entry['content_hash'] is not None
        assert len(entry['content_hash']) > 0
        assert entry['chunk_index'] == 0
        assert entry['embedding'] == [0.1, 0.2, 0.3]

    def test_add_vector_with_custom_chunk_index(self, fresh_vectorstore):
        import vectorstore as vs
        entry = vs.add_vector('src/main.py', 'chunk 1', [0.1], chunk_index=3)
        assert entry['chunk_index'] == 3

    def test_add_vector_stores_content_hash(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('a.py', 'same content', [0.1])
        vs.add_vector('b.py', 'same content', [0.1])
        # Both should have the same content_hash
        all_vecs = vs.get_all_vectors()
        assert len(all_vecs) == 2
        assert all_vecs[0]['content_hash'] == all_vecs[1]['content_hash']

    def test_add_vector_persists_to_disk(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('persist.py', 'content here', [0.1, 0.2])
        # Read the file directly to verify persistence
        with open(fresh_vectorstore) as f:
            data = json.load(f)
        assert len(data) == 1
        assert data[0]['file_path'] == 'persist.py'

    def test_add_vector_uses_unique_temp_file(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('unique.py', 'content', [0.1])
        # Ensure no residual static .tmp files were left behind
        assert not os.path.exists(fresh_vectorstore + '.tmp')


class TestDeleteVectorsForFile:
    def test_delete_vectors_for_file_removes_all_entries(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('target.py', 'chunk1', [0.1])
        vs.add_vector('target.py', 'chunk2', [0.2])
        vs.add_vector('other.py', 'chunk3', [0.3])
        removed = vs.delete_vectors_for_file('target.py')
        assert removed == 2
        remaining = vs.get_all_vectors()
        assert len(remaining) == 1
        assert remaining[0]['file_path'] == 'other.py'

    def test_delete_vectors_for_file_returns_zero_when_none_exist(self, fresh_vectorstore):
        import vectorstore as vs
        removed = vs.delete_vectors_for_file('nonexistent.py')
        assert removed == 0

    def test_delete_vectors_for_file_persists_change(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('to_delete.py', 'content', [0.1])
        vs.delete_vectors_for_file('to_delete.py')
        # Reload from disk
        vs._vectors = []
        with open(fresh_vectorstore) as f:
            data = json.load(f)
        assert len(data) == 0


class TestCleanupStaleVectors:
    def test_cleanup_stale_vectors_removes_untracked_files(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('keep.py', 'content', [0.1])
        vs.add_vector('stale.py', 'content', [0.1])
        result = vs.cleanup_stale_vectors({'keep.py'})
        assert 'stale.py' in result['stale_paths']
        assert result['removed_count'] == 1
        assert result['remaining_count'] == 1

    def test_cleanup_stale_vectors_with_empty_current_files(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('a.py', 'c', [0.1])
        vs.add_vector('b.py', 'c', [0.1])
        result = vs.cleanup_stale_vectors(set())
        assert result['removed_count'] == 2
        assert result['remaining_count'] == 0

    def test_cleanup_stale_vectors_all_current(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('a.py', 'c', [0.1])
        vs.add_vector('b.py', 'c', [0.1])
        result = vs.cleanup_stale_vectors({'a.py', 'b.py'})
        assert result['removed_count'] == 0
        assert result['remaining_count'] == 2


class TestGetAllVectors:
    def test_get_all_vectors_returns_list(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('a.py', 'c', [0.1])
        vs.add_vector('b.py', 'c', [0.2])
        all_vecs = vs.get_all_vectors()
        assert isinstance(all_vecs, list)
        assert len(all_vecs) == 2

    def test_get_all_vectors_empty_when_no_vectors(self, fresh_vectorstore):
        import vectorstore as vs
        all_vecs = vs.get_all_vectors()
        assert all_vecs == []


class TestGetVectorsForFile:
    def test_get_vectors_for_file_returns_matching(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('target.py', 'chunk0', [0.1], chunk_index=0)
        vs.add_vector('target.py', 'chunk1', [0.2], chunk_index=1)
        vs.add_vector('other.py', 'chunk2', [0.3], chunk_index=0)
        result = vs.get_vectors_for_file('target.py')
        assert len(result) == 2
        assert all(v['file_path'] == 'target.py' for v in result)

    def test_get_vectors_for_file_returns_empty_for_nonexistent(self, fresh_vectorstore):
        import vectorstore as vs
        result = vs.get_vectors_for_file('does_not_exist.py')
        assert result == []


class TestClearAllVectors:
    def test_clear_all_vectors_returns_count(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('a.py', 'c', [0.1])
        vs.add_vector('b.py', 'c', [0.2])
        vs.add_vector('c.py', 'c', [0.3])
        count = vs.clear_all_vectors()
        assert count == 3

    def test_clear_all_vectors_removes_all(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('a.py', 'c', [0.1])
        vs.clear_all_vectors()
        assert vs.get_all_vectors() == []

    def test_clear_all_vectors_persists_to_disk(self, fresh_vectorstore):
        import vectorstore as vs
        vs.add_vector('a.py', 'c', [0.1])
        vs.clear_all_vectors()
        with open(fresh_vectorstore) as f:
            data = json.load(f)
        assert len(data) == 0


class TestComputeContentHash:
    """Unit tests for _compute_content_hash function in vectorstore.py."""

    def test_empty_string_returns_valid_sha256(self):
        import vectorstore as vs
        result = vs._compute_content_hash('')
        assert isinstance(result, str)
        assert len(result) == 64  # SHA-256 hex digest is 64 chars
        assert all(c in '0123456789abcdef' for c in result)

    def test_same_content_produces_same_hash(self):
        import vectorstore as vs
        h1 = vs._compute_content_hash('hello world')
        h2 = vs._compute_content_hash('hello world')
        assert h1 == h2

    def test_different_content_produces_different_hash(self):
        import vectorstore as vs
        h1 = vs._compute_content_hash('hello')
        h2 = vs._compute_content_hash('world')
        assert h1 != h2

    def test_unicode_content_produces_valid_hash(self):
        import vectorstore as vs
        result = vs._compute_content_hash('\u4e2d\u6587\u4e16\u754c')  # Chinese "world"
        assert isinstance(result, str)
        assert len(result) == 64
        assert all(c in '0123456789abcdef' for c in result)

    def test_emoji_content_produces_valid_hash(self):
        import vectorstore as vs
        result = vs._compute_content_hash('\U0001F600\U0001F4BB\U0001F40D')  # emoji
        assert isinstance(result, str)
        assert len(result) == 64

    def test_whitespace_only_produces_valid_hash(self):
        import vectorstore as vs
        result = vs._compute_content_hash('   \n\t\n  ')
        assert isinstance(result, str)
        assert len(result) == 64

    def test_large_content_produces_valid_hash(self):
        import vectorstore as vs
        large = 'x' * 100_000
        result = vs._compute_content_hash(large)
        assert isinstance(result, str)
        assert len(result) == 64

    def test_deterministic_across_multiple_calls(self):
        import vectorstore as vs
        hashes = [vs._compute_content_hash('test content') for _ in range(5)]
        assert len(set(hashes)) == 1  # All identical

    def test_special_characters_preserved_in_hash(self):
        import vectorstore as vs
        content = 'line1\nline2\ttab\0null'
        result = vs._compute_content_hash(content)
        assert len(result) == 64
        # Hash of 'hello' should always be the same
        assert vs._compute_content_hash('hello') == '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
