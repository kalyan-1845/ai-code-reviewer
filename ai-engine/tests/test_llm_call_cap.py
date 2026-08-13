"""Tests for the per-analysis LLM-call cap in ai-engine/app.py (#3549).

_bounded_llm_batches raises the batch size (and, if needed, truncates the
trailing batches) so a caller cannot force one Groq sub-call per tiny file by
setting batchSize=1 on a repo with thousands of files.

Run from the ai-engine/ directory: py -m pytest tests/test_llm_call_cap.py
"""
import app as app_module


class _File:
    def __init__(self, name):
        self.name = name
        self.content = ""


def _files(count):
    return [_File(f"file_{i}.py") for i in range(count)]


class TestBoundLlmBatches:
    def test_small_request_is_not_compressed(self):
        files = _files(3)
        batches, truncated = app_module._bound_llm_batches(files, batch_size=1, max_calls=20)
        assert len(batches) == 3
        assert truncated == 0

    def test_batch_size_one_on_thousands_of_files_is_bounded(self):
        # Batch size is capped at 20 (AnalyzeRequest le=20), so 2000 files
        # need at least 100 batches. The cap must truncate the trailing
        # batches so the call count is never unbounded.
        files = _files(2000)
        batches, truncated = app_module._bound_llm_batches(files, batch_size=1, max_calls=20)
        assert len(batches) <= 20
        assert truncated == 80
        covered = sum(len(b) for b in batches)
        assert covered == 400

    def test_compression_covers_all_files_when_batch_size_can_grow(self):
        # 100 files with a cap of 5 calls compress into 5 batches of 20, so
        # nothing is dropped and the call count stays within the cap.
        files = _files(100)
        batches, truncated = app_module._bound_llm_batches(files, batch_size=1, max_calls=5)
        assert len(batches) == 5
        assert truncated == 0
        covered = sum(len(b) for b in batches)
        assert covered == len(files)

    def test_oversized_request_is_truncated_to_keep_calls_bounded(self):
        # 200 files at a cap of 5 calls exceed even the maximum batch size of
        # 20, so trailing batches must be truncated.
        files = _files(200)
        batches, truncated = app_module._bound_llm_batches(files, batch_size=1, max_calls=5)
        assert len(batches) <= 5
        assert truncated == 5
        covered = sum(len(b) for b in batches)
        assert covered == 100
