import pytest
from pydantic import BaseModel
from utils.dependency_graph import build_dependency_graph, smart_batch_files

class DummyFile(BaseModel):
    name: str
    content: str

def test_build_dependency_graph_extracts_imports():
    f1 = DummyFile(name="src/UserService.ts", content='import { UserRepo } from "./UserRepository";\nclass UserService {}')
    f2 = DummyFile(name="src/UserRepository.ts", content='export class UserRepository {}')
    f3 = DummyFile(name="src/Utils.ts", content='export const noop = () => {};')
    
    files = [f1, f2, f3]
    graph = build_dependency_graph(files)
    
    assert graph["src/UserService.ts"] == {"src/UserRepository.ts"}
    assert graph["src/UserRepository.ts"] == {"src/UserService.ts"}
    assert graph["src/Utils.ts"] == set()

def test_smart_batching_groups_coupled_files():
    f1 = DummyFile(name="a.py", content="import b\nimport c")
    f2 = DummyFile(name="b.py", content="x = 1")
    f3 = DummyFile(name="c.py", content="y = 2")
    f4 = DummyFile(name="d.py", content="import e")
    f5 = DummyFile(name="e.py", content="z = 3")
    f6 = DummyFile(name="f.py", content="w = 4")
    
    files = [f1, f2, f3, f4, f5, f6]
    batches = smart_batch_files(files, batch_size=4)
    
    # Expect component (a, b, c) -> size 3, fits in one batch
    # Expect component (d, e) -> size 2
    # Expect component (f) -> size 1
    # Sorting by size: (a,b,c), (d,e), (f)
    # Batch 1 should be [a, b, c, f] since 3 + 1 = 4 (Wait! Let's trace)
    # Iter 1: current = [a,b,c]
    # Iter 2: len(current)+2 = 5 > 4. Yield [a,b,c]. current = [d,e].
    # Iter 3: len(current)+1 = 3 <= 4. current = [d,e,f].
    # Yield [d,e,f].
    
    assert len(batches) == 2
    names1 = set(f.name for f in batches[0])
    names2 = set(f.name for f in batches[1])
    
    # It might depend on exact grouping behavior, but (a,b,c) should be together.
    # Because (a,b,c) is size 3, (d,e) is size 2, (f) is size 1.
    assert {"a.py", "b.py", "c.py"}.issubset(names1) or {"a.py", "b.py", "c.py"}.issubset(names2)
    assert {"d.py", "e.py"}.issubset(names1) or {"d.py", "e.py"}.issubset(names2)

def test_smart_batch_files_large_component_split():
    # A single large component of size 6, batch size 2
    files = [
        DummyFile(name="f1.py", content="import f2"),
        DummyFile(name="f2.py", content="import f3"),
        DummyFile(name="f3.py", content="import f4"),
        DummyFile(name="f4.py", content="import f5"),
        DummyFile(name="f5.py", content="import f6"),
        DummyFile(name="f6.py", content="x = 1")
    ]
    batches = smart_batch_files(files, batch_size=2)
    assert len(batches) == 3
    assert len(batches[0]) == 2
    assert len(batches[1]) == 2
    assert len(batches[2]) == 2

def test_smart_batch_empty():
    assert smart_batch_files([], batch_size=5) == []
