import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeComplexity } from '../utils/complexityAnalyzer.js';

// ---------- PHP block comment detection ----------

test('analyzeComplexity detects PHP C-style block comments', () => {
  const code = [
    '<?php',
    '/* This is a',
    '   multi-line comment */',
    'function test() {',
    '    return true;',
    '}',
  ].join('\n');
  const result = analyzeComplexity(code, 'main.php');
  // .php is in cStyleExts so C-style block comments are detected
  assert.equal(result.commentLines, 2);
});

test('analyzeComplexity PHP // single-line comments are detected', () => {
  const code = [
    '<?php',
    '// comment one',
    'function greet($name) {',
    '    // inside function',
    '    return "Hello";',
    '}',
  ].join('\n');
  const result = analyzeComplexity(code, 'main.php');
  // PHP is in cStyleExts so // single-line comments ARE detected
  assert.equal(result.commentLines, 2);  // the // comment is detected
  assert.equal(result.functionCount, 0);  // PHP function detection not implemented
  assert.equal(result.codeLines, 4);
});

test('analyzeComplexity PHP file without functions returns grade A', () => {
  const code = '<?php\necho "Hello";\n';
  const result = analyzeComplexity(code, 'hello.php');
  assert.equal(result.grade, 'A');
  assert.equal(result.functionCount, 0);
});

// ---------- Ruby comment detection ----------

test('analyzeComplexity detects Ruby hash comments', () => {
  const code = [
    '# This is a Ruby comment',
    'def foo',
    '  # Inside method comment',
    '  42',
    'end',
    '# After end comment',
  ].join('\n');
  const result = analyzeComplexity(code, 'sample.rb');
  // Ruby uses # for comments, detected via: else if (ext === '.py' || ext === '.rb')
  assert.equal(result.commentLines >= 3, true);
});

test('analyzeComplexity Ruby does not detect C-style block comments', () => {
  // .rb is not in cStyleExts, so C-style /* */ block comments are not detected
  const code = [
    '/* This should not be detected */',
    'def hello',
    '  puts "Hi"',
    'end',
  ].join('\n');
  const result = analyzeComplexity(code, 'greeter.rb');
  assert.equal(result.commentLines, 0);  // C-style not detected for Ruby
  assert.equal(result.functionCount, 0);  // Ruby def detection not implemented

});

// ---------- Rust block comment detection ----------

test('analyzeComplexity detects Rust C-style block comments', () => {
  const code = [
    '/* Multi-line',
    '   Rust block comment */',
    'fn main() {',
    '    println!("Hello");',
    '}',
  ].join('\n');
  const result = analyzeComplexity(code, 'main.rs');
  // .rs is in cStyleExts so C-style block comments are detected
  assert.equal(result.commentLines, 2);
});

test('analyzeComplexity detects Rust doc comments', () => {
  const code = [
    '/**',
    ' * Doc comment',
    ' * for a function',
    ' */',
    'fn add(a: i32, b: i32) -> i32 {',
    '    a + b',
    '}',
  ].join('\n');
  const result = analyzeComplexity(code, 'lib.rs');
  // /* opens block, * lines counted, */ closes = 4 lines
  assert.equal(result.commentLines, 4);
});

// ---------- Grade boundary tests ----------

test('analyzeComplexity grade A at exactly score 8', () => {
  // 0 functions, 200 lines -> 200/25 = 8 -> round(8) = 8 -> NOT > 8 -> grade A
  const code = 'x = 1\n'.repeat(200);
  const result = analyzeComplexity(code, 'a.py');
  assert.equal(result.complexityScore, 8);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity grade B just above score 8', () => {
  // 1 function, 175 lines -> 175/25 + 3 = 7 + 3 = 10 -> round(10) = 10 -> > 8 -> grade B
  const code = ['def foo(): pass', ...Array(175).fill('x = 1')].join('\n');
  const result = analyzeComplexity(code, 'b.py');
  assert.equal(result.grade, 'B');
  assert.equal(result.complexityScore > 8, true);
});

test('analyzeComplexity grade B at exactly score 15', () => {
  // 4 functions, 75 lines -> 75/25 + 12 = 3 + 12 = 15 -> NOT > 15 -> grade B
  const code = Array(4).fill('def f(): pass').concat(Array(75).fill('x = 1')).join('\n');
  const result = analyzeComplexity(code, 'c.py');
  assert.equal(result.complexityScore, 15);
  assert.equal(result.grade, 'B');
});

test('analyzeComplexity grade C just above score 15', () => {
  // 5 functions, 76 lines -> 76/25 + 15 = 3.04 + 15 = 18.04 -> round(18.04) = 18 -> > 15 -> grade C
  const code = Array(5).fill('def f(): pass').concat(Array(76).fill('x = 1')).join('\n');
  const result = analyzeComplexity(code, 'd.py');
  assert.equal(result.grade, 'C');
  assert.equal(result.complexityScore > 15, true);
});

test('analyzeComplexity grade D at score between 25 and 40', () => {
  // 9 functions, 25 lines -> 25/25 + 27 = 28 -> 25 < 28 < 40 -> grade D
  const code = Array(9).fill('def f(): pass').concat(Array(25).fill('x = 1')).join('\n');
  const result = analyzeComplexity(code, 'e.py');
  assert.equal(result.complexityScore > 25, true);
  assert.equal(result.complexityScore < 40, true);
  assert.equal(result.grade, 'D');
});

test('analyzeComplexity grade D at score 37 (between 25 and 40)', () => {
  // 12 functions, 25 lines -> 25/25 + 36 = 37 -> 25 < 37 < 40 -> grade D
  const code = Array(12).fill('def f(): pass').concat(Array(25).fill('x = 1')).join('\n');
  const result = analyzeComplexity(code, 'f.py');
  assert.equal(result.complexityScore, 37);
  assert.equal(result.grade, 'D');
});

test('analyzeComplexity grade F just above score 40', () => {
  // 14 functions, 25 lines -> 25/25 + 42 = 43 -> > 40 -> grade F
  const code = Array(14).fill('def f(): pass').concat(Array(25).fill('x = 1')).join('\n');
  const result = analyzeComplexity(code, 'g.py');
  assert.equal(result.grade, 'F');
  assert.equal(result.complexityScore > 40, true);
});

// ---------- Empty lines and code lines ----------

test('analyzeComplexity counts empty lines correctly', () => {
  const code = '\n\n\nconst x = 1;\n\nconst y = 2;\n\n';
  const result = analyzeComplexity(code, 'index.js');
  assert.equal(result.emptyLines, 6);
  assert.equal(result.totalLines, 8);
  assert.equal(result.codeLines, 2);
});

test('analyzeComplexity codeLines equals total minus empty minus comment', () => {
  const code = [
    '// comment',
    '',
    'def foo():',
    '    pass',
    '',
    '# another comment',
    'x = 1',
  ].join('\n');
  const result = analyzeComplexity(code, 'test.py');
  assert.equal(result.codeLines, result.totalLines - result.emptyLines - result.commentLines);
});

test('analyzeComplexity file with only empty lines returns grade A', () => {
  // '\n\n\n\n' split: ['', '', '', '', ''] = 5 items, all empty
  const code = '\n\n\n\n';
  const result = analyzeComplexity(code, 'empty.py');
  assert.equal(result.emptyLines, 5);
  assert.equal(result.codeLines, 0);
  assert.equal(result.commentLines, 0);
  assert.equal(result.functionCount, 0);
  assert.equal(result.grade, 'A');
});

// ---------- SQL multi-line block comment ----------

test('analyzeComplexity handles SQL multi-line block comment', () => {
  const code = [
    '/* This is a',
    '   multi-line',
    '   SQL block comment */',
    'SELECT * FROM users;',
    '-- single line comment',
    'INSERT INTO users VALUES (1);',
  ].join('\n');
  const result = analyzeComplexity(code, 'query.sql');
  assert.equal(result.commentLines >= 4, true);
  assert.equal(result.codeLines, 2);
});

// ---------- CSS block comment detection ----------

test('analyzeComplexity detects CSS block comments', () => {
  const code = [
    '/* This is a',
    '   CSS comment */',
    '.foo {',
    '  color: red;',
    '}',
  ].join('\n');
  const result = analyzeComplexity(code, 'style.css');
  assert.equal(result.commentLines >= 2, true);
});

// ---------- HTML multi-line block comment ----------

test('analyzeComplexity handles HTML multi-line block comments', () => {
  const code = [
    '<!-- This is a',
    '   multi-line HTML',
    '   block comment -->',
    '<div>Hello</div>',
  ].join('\n');
  const result = analyzeComplexity(code, 'index.html');
  assert.equal(result.commentLines, 3);
  assert.equal(result.codeLines, 1);
});
