import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeComplexity } from '../utils/complexityAnalyzer.js';

// Tests from upstream/main
test('analyzeComplexity should return grade A for very simple files', () => {
  const code = 'const x = 1;\nconst y = 2;';
  const result = analyzeComplexity(code, 'index.js');
  assert.equal(result.grade, 'A');
  assert.equal(result.codeLines, 2);
  assert.equal(result.functionCount, 0);
  assert.equal(result.complexityScore, Math.round((4 / 25) + 0));
});

test('analyzeComplexity should return grade B for moderate complexity', () => {
  const code = [
    'function a() { return 1; }',
    'function b() { return 2; }',
    'function c() { return 3; }',
    'const x = 1; const y = 2; const z = 3;',
  ].join('\n');
  const result = analyzeComplexity(code, 'index.js');
  assert.ok(result.grade === 'B' || result.complexityScore > 8);
});

test('analyzeComplexity should return grade C for higher complexity', () => {
  const code = Array.from({ length: 10 }, (_, i) => `function fn${i}() { return ${i}; }`).join('\n');
  const result = analyzeComplexity(code, 'index.js');
  assert.equal(result.functionCount, 10);
  assert.ok(result.complexityScore > 15);
});

test('analyzeComplexity should return grade F for very high complexity', () => {
  const code = Array.from({ length: 20 }, (_, i) => `function fn${i}() { return ${i}; }`).join('\n');
  const result = analyzeComplexity(code, 'index.js');
  assert.ok(result.grade === 'F' || result.complexityScore > 40);
});

test('analyzeComplexity should detect Go functions', () => {
  const code = `
func add(a int, b int) int {
    return a + b
}

func main() {
    fmt.Println("hello")
}
  `;
  const result = analyzeComplexity(code, 'main.go');
  assert.equal(result.functionCount, 2);
  assert.ok(result.codeLines > 0);
});

test('analyzeComplexity should detect Java methods', () => {
  const code = `
public class Main {
    public void run() {
        System.out.println("hello");
    }
}
  `;
  const result = analyzeComplexity(code, 'Main.java');
  assert.ok(result.functionCount >= 1);
});

test('analyzeComplexity should detect C++ methods', () => {
  const code = `
class Foo {
public:
    void bar() { }
    int baz() { return 0; }
};
  `;
  const result = analyzeComplexity(code, 'foo.cpp');
  assert.ok(result.functionCount >= 2);
});

test('analyzeComplexity handles null fileContent gracefully', () => {
  const result = analyzeComplexity(null, 'index.js');
  assert.equal(result.totalLines, 0);
  assert.equal(result.functionCount, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity handles undefined fileContent gracefully', () => {
  const result = analyzeComplexity(undefined, 'index.js');
  assert.equal(result.totalLines, 0);
  assert.equal(result.functionCount, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity handles non-string input gracefully', () => {
  const result = analyzeComplexity(12345, 'index.js');
  assert.equal(result.totalLines, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity handles SQL block comments', () => {
  const code = `
-- single line comment
SELECT * FROM users;
/* multi-line
   comment */
SELECT id FROM orders;
  `;
  const result = analyzeComplexity(code, 'query.sql');
  assert.ok(result.commentLines >= 3);
  assert.equal(result.functionCount, 0);
});

test('analyzeComplexity handles HTML comments', () => {
  const code = `
<html>
<body>
<!-- This is a comment -->
<p>Hello</p>
</body>
</html>
  `;
  const result = analyzeComplexity(code, 'index.html');
  assert.ok(result.commentLines >= 1);
});

test('analyzeComplexity counts empty lines correctly', () => {
  const code = '\n\n\nconst x = 1;\n\nconst y = 2;\n\n';
  const result = analyzeComplexity(code, 'index.js');
  assert.ok(result.emptyLines >= 5);
});

test('analyzeComplexity grade boundary at exactly 8', () => {
  const code = Array.from({ length: 3 }, (_, i) => `function fn${i}() { return ${i}; }`).join('\n');
  const result = analyzeComplexity(code, 'index.js');
  assert.ok(result.complexityScore > 8);
  assert.ok(['B', 'C', 'D', 'F'].includes(result.grade));
});

test('analyzeComplexity grade boundary at exactly 15', () => {
  const code = Array.from({ length: 6 }, (_, i) => `function fn${i}() { return ${i}; }`).join('\n');
  const result = analyzeComplexity(code, 'index.js');
  assert.ok(result.complexityScore > 15, `expected > 15, got ${result.complexityScore}`);
  assert.equal(result.grade, 'C');
});

// Tests from #298 (tmdeveloper007)
test('analyzeComplexity handles null/undefined content gracefully', () => {
  const result = analyzeComplexity(null, 'index.js');
  assert.equal(result.totalLines, 0);
  assert.equal(result.emptyLines, 0);
  assert.equal(result.codeLines, 0);
  assert.equal(result.complexityScore, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity handles non-string content', () => {
  const result = analyzeComplexity(123, 'index.js');
  assert.equal(result.totalLines, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity counts multi-line C-style block comments in JS', () => {
  const code = [
    '/*',
    ' * This is a multi-line',
    ' * block comment',
    ' */',
    'const x = 1;',
  ].join('\n');
  const result = analyzeComplexity(code, 'index.js');
  assert.equal(result.commentLines, 4);
  assert.equal(result.codeLines, 1);
  assert.equal(result.totalLines, 5);
});

test('analyzeComplexity detects opening HTML comment line', () => {
  const code = [
    '<!-- HTML comment start',
    '  Multi-line content inside',
    '  HTML comment end -->',
    '<div>Hello</div>',
  ].join('\n');
  const result = analyzeComplexity(code, 'page.html');
  assert.equal(result.commentLines, 3);
  assert.equal(result.codeLines, 1);
});

test('analyzeComplexity detects Go functions', () => {
  const code = [
    'package main',
    '',
    'func main() {',
    '  fmt.Println("hello")',
    '}',
    '',
    'func helper() string {',
    '  return "world"',
    '}',
  ].join('\n');
  const result = analyzeComplexity(code, 'main.go');
  assert.equal(result.functionCount, 2);
  assert.equal(result.codeLines >= 2, true);
});

test('analyzeComplexity detects Java methods', () => {
  const code = [
    'public class Main {',
    '  public void run() {',
    '    System.out.println("hi");',
    '  }',
    '  private int compute() {',
    '    return 42;',
    '  }',
    '}',
  ].join('\n');
  const result = analyzeComplexity(code, 'Main.java');
  assert.equal(result.functionCount, 2);
});

test('analyzeComplexity detects C++ methods', () => {
  const code = [
    'class Foo {',
    'public:',
    '  void bar() { }',
    '  int baz() { return 0; }',
    '};',
  ].join('\n');
  const result = analyzeComplexity(code, 'foo.cpp');
  assert.equal(result.functionCount, 2);
});

test('analyzeComplexity detects SQL comments', () => {
  const code = [
    '-- single line SQL comment',
    'SELECT id, name FROM users;',
    '/* block',
    '   SQL comment */',
    'SELECT * FROM orders;',
  ].join('\n');
  const result = analyzeComplexity(code, 'query.sql');
  assert.equal(result.commentLines, 3);
  assert.equal(result.codeLines, 2);
});

test('analyzeComplexity computes complexity score and grade correctly', () => {
  const code = [
    'def foo(): pass',
    'def bar(): pass',
    'def baz(): pass',
    'x = 1',
    'y = 2',
    'z = 3',
    'a = 4',
    'b = 5',
    'c = 6',
    'd = 7',
  ].join('\n');
  const result = analyzeComplexity(code, 'app.py');
  assert.equal(result.functionCount, 3);
  assert.equal(result.totalLines, 10);
  assert.equal(result.complexityScore, 9);
  assert.equal(result.grade, 'B');
});

test('analyzeComplexity grade thresholds', () => {
  const resultA = analyzeComplexity('x = 1\n'.repeat(5), 'a.py');
  assert.equal(resultA.grade, 'A');

  const resultF = analyzeComplexity('def f(): pass\n'.repeat(20), 'b.py');
  assert.equal(resultF.grade, 'F');
});

// --- Ruby comment tests from PR #414 ---
test('analyzeComplexity counts Ruby single-line comments in .rb files', () => {
  const code = [
    '# This is a Ruby comment',
    'def hello',
    '  # indented Ruby comment',
    '  puts "world"',
    '# another comment at bottom',
  ].join('\n');
  const result = analyzeComplexity(code, 'script.rb');
  // 3 comment lines (#, # indented, # bottom), 2 code lines
  assert.equal(result.commentLines, 3);
  assert.equal(result.codeLines, 2);
  assert.equal(result.totalLines, 5);
});

test('analyzeComplexity handles empty Ruby file', () => {
  const result = analyzeComplexity('', 'empty.rb');
  assert.equal(result.totalLines, 0);
  assert.equal(result.emptyLines, 0);
  assert.equal(result.codeLines, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity handles empty SQL file', () => {
  const result = analyzeComplexity('', 'empty.sql');
  assert.equal(result.totalLines, 0);
  assert.equal(result.emptyLines, 0);
  assert.equal(result.codeLines, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity counts multi-line SQL block comments spanning multiple lines', () => {
  const code = [
    '/*',
    '  Multi-line SQL block comment',
    '  spanning several lines',
    '*/',
    'SELECT * FROM users;',
    'SELECT id FROM orders;',
  ].join('\n');
  const result = analyzeComplexity(code, 'query.sql');
  assert.equal(result.commentLines, 4);
  assert.equal(result.codeLines, 2);
});

test('analyzeComplexity SQL file with only block comment returns correct counts', () => {
  const code = '/* only a block comment here */';
  const result = analyzeComplexity(code, 'only_comments.sql');
  assert.equal(result.commentLines, 1);
  assert.equal(result.codeLines, 0);
  assert.equal(result.totalLines, 1);
});

test('analyzeComplexity mixed Ruby and Python style in non-Ruby file ignores Ruby comments', () => {
  const code = [
    '# this looks like a Ruby comment but is Python',
    'print("hello")',
  ].join('\n');
  const result = analyzeComplexity(code, 'script.py');
  assert.equal(result.commentLines, 1);
  assert.equal(result.codeLines, 1);
});

test('analyzeComplexity closes SQL block comment correctly mid-file', () => {
  const code = [
    'SELECT a FROM t1;',
    '/* unclosed until here',
    '   still inside */',
    'SELECT b FROM t2;',
  ].join('\n');
  const result = analyzeComplexity(code, 'query.sql');
  assert.equal(result.codeLines, 2);
  assert.equal(result.commentLines, 2);
});

test('analyzeComplexity Ruby file with only comment returns zero code lines', () => {
  const code = '# only a ruby comment here\n# another line of comment';
  const result = analyzeComplexity(code, 'script.rb');
  assert.equal(result.commentLines, 2);
  assert.equal(result.codeLines, 0);
  assert.equal(result.totalLines, 2);
});

test('analyzeComplexity ignores function keywords inside string literals', () => {
  const code = `
  const msg1 = "Click => to submit";
  const msg2 = 'This function is deprecated';
  const msg3 = \`another => arrow function\`;
  `;
  const result = analyzeComplexity(code, 'index.js');
  assert.equal(result.functionCount, 0, 'Should not match function indicators inside strings');
});

test('analyzeComplexity tracks Python triple-quoted docstrings and ignores inner defs', () => {
  const code = `
def real_func():
    """
    def fake_func_inside_docstring():
        pass
    """
    pass
  `;
  const result = analyzeComplexity(code, 'app.py');
  // comment lines are: triple quotes block (4 lines)
  assert.equal(result.commentLines, 4);
  assert.equal(result.functionCount, 1, 'Should only count real_func, ignoring fake_func_inside_docstring');
});
