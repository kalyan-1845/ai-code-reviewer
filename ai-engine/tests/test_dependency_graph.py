"""Unit tests for ai-engine/utils/dependency_graph.py"""

import pytest
from unittest.mock import MagicMock
from utils.dependency_graph import (
    extract_imports,
    _extract_basename,
    build_dependency_graph,
    _get_connected_components,
    smart_batch_files,
)


class MockFile:
    def __init__(self, name: str, content: str):
        self.name = name
        self.content = content


class TestExtractBasename:
    """Tests for _extract_basename()"""

    def test_slash_separated_path(self):
        assert _extract_basename('./UserService') == 'UserService'
        assert _extract_basename('services/UserRepository') == 'UserRepository'
        assert _extract_basename('/absolute/path/Config') == 'Config'

    def test_python_module_path(self):
        assert _extract_basename('models.User') == 'User'
        assert _extract_basename('controllers.api.routes') == 'routes'
        assert _extract_basename('pkg.subpkg.module') == 'module'

    def test_combined_slash_and_dot(self):
        assert _extract_basename('controllers/UserService') == 'UserService'
        assert _extract_basename('./utils/helpers') == 'helpers'

    def test_no_separator(self):
        assert _extract_basename('main') == 'main'


class TestExtractImports:
    """Tests for extract_imports()"""

    def test_python_import_statement(self):
        code = 'import os\nimport sys\nfrom collections import defaultdict'
        imports = extract_imports(code, 'test.py')
        assert 'os' in imports
        assert 'sys' in imports
        assert 'collections' in imports

    def test_python_from_import(self):
        code = 'from typing import List, Dict\nfrom pathlib import Path'
        imports = extract_imports(code, 'main.py')
        assert 'typing' in imports
        assert 'pathlib' in imports

    def test_javascript_import_statement(self):
        code = 'import React from "react"\nimport { useState } from "react"'
        imports = extract_imports(code, 'App.js')
        assert 'react' in imports

    def test_typescript_import(self):
        code = 'import { Component } from "react"\nimport type { Props } from "./types"'
        imports = extract_imports(code, 'Component.tsx')
        assert 'react' in imports

    def test_unsupported_language_uses_fallback(self):
        code = 'import "some-package"'
        imports = extract_imports(code, 'test.java')
        assert 'some-package' in imports

    def test_empty_source_returns_empty_set(self):
        imports = extract_imports('', 'test.py')
        assert isinstance(imports, set)
        assert len(imports) == 0

    def test_python_requires_syntax(self):
        code = 'import invalid syntax here'
        imports = extract_imports(code, 'test.py')
        assert isinstance(imports, set)


class TestGetConnectedComponents:
    """Tests for _get_connected_components()"""

    def test_single_node_is_one_component(self):
        graph = {'a': set()}
        components = _get_connected_components(graph)
        assert len(components) == 1
        assert 'a' in components[0]

    def test_two_connected_nodes(self):
        graph = {'a': {'b'}, 'b': {'a'}}
        components = _get_connected_components(graph)
        assert len(components) == 1
        assert set(components[0]) == {'a', 'b'}

    def test_three_separate_components(self):
        graph = {'a': set(), 'b': set(), 'c': set()}
        components = _get_connected_components(graph)
        assert len(components) == 3
        component_sets = [set(c) for c in components]
        assert {'a'} in component_sets
        assert {'b'} in component_sets
        assert {'c'} in component_sets

    def test_complex_graph_two_components(self):
        graph = {
            'a': {'b', 'c'},
            'b': {'a'},
            'c': {'a'},
            'd': {'e'},
            'e': {'d'},
        }
        components = _get_connected_components(graph)
        component_sets = [set(c) for c in components]
        assert {'a', 'b', 'c'} in component_sets
        assert {'d', 'e'} in component_sets


class TestBuildDependencyGraph:
    """Tests for build_dependency_graph()"""

    def test_single_file_no_imports(self):
        f = MockFile('main.py', 'print("hello")')
        graph = build_dependency_graph([f])
        assert 'main.py' in graph
        assert len(graph['main.py']) == 0

    def test_two_files_with_cross_import(self):
        f1 = MockFile('a.py', 'from b import B')
        f2 = MockFile('b.py', 'class B:\n    pass')
        graph = build_dependency_graph([f1, f2])
        assert 'a.py' in graph
        assert 'b.py' in graph
        assert 'a.py' in graph['b.py']
        assert 'b.py' in graph['a.py']

    def test_file_importing_external_module_not_in_graph(self):
        f = MockFile('main.py', 'import os\nimport sys')
        graph = build_dependency_graph([f])
        assert graph['main.py'] == set()


class TestSmartBatchFiles:
    """Tests for smart_batch_files()"""

    def test_empty_list_returns_empty(self):
        result = smart_batch_files([], batch_size=5)
        assert result == []

    def test_zero_batch_size_uses_default(self):
        f1 = MockFile('a.py', 'import b')
        f2 = MockFile('b.py', 'pass')
        result = smart_batch_files([f1, f2], batch_size=0)
        assert len(result) >= 1

    def test_negative_batch_size_uses_default(self):
        f1 = MockFile('a.py', 'import b')
        f2 = MockFile('b.py', 'pass')
        result = smart_batch_files([f1, f2], batch_size=-1)
        assert len(result) >= 1

    def test_single_file_single_batch(self):
        f = MockFile('main.py', 'pass')
        result = smart_batch_files([f], batch_size=5)
        assert len(result) == 1
        assert len(result[0]) == 1

    def test_batch_size_larger_than_file_count(self):
        f1 = MockFile('a.py', 'pass')
        f2 = MockFile('b.py', 'pass')
        result = smart_batch_files([f1, f2], batch_size=10)
        assert len(result) == 1
        assert len(result[0]) == 2

    def test_files_split_across_batches(self):
        files = [MockFile(f'{chr(97+i)}.py', 'pass') for i in range(6)]
        result = smart_batch_files(files, batch_size=2)
        total = sum(len(batch) for batch in result)
        assert total == 6
