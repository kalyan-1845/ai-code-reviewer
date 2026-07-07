import test from 'node:test';
import assert from 'node:assert';
import { analyzeComplexity } from '../utils/complexityAnalyzer.js';

test('analyzeComplexity should return default stats for empty or non-string input', () => {
  const result1 = analyzeComplexity(null, 'test.js');
  const result2 = analyzeComplexity(123, 'test.js');
  
  assert.deepStrictEqual(result1, {
    totalLines: 0,
    emptyLines: 0,
    commentLines: 0,
    codeLines: 0,
    functionCount: 0,
    complexityScore: 0,
    grade: 'A'
  });
  assert.deepStrictEqual(result2, result1);
});

test('analyzeComplexity should count empty lines correctly', () => {
  const code = `
  
  
`;
  const result = analyzeComplexity(code, 'test.js');
  assert.strictEqual(result.emptyLines, 4);
});

test('analyzeComplexity should analyze JS code correctly', () => {
  const code = `
// Single line comment
function test() {
  /*
   * Block comment
   */
  const a = () => { return 1; };
}
  `;
  const result = analyzeComplexity(code, 'test.js');
  
  assert.strictEqual(result.totalLines, 9);
  assert.strictEqual(result.commentLines, 4);
  assert.strictEqual(result.functionCount, 2);
});

test('analyzeComplexity should analyze Python code correctly', () => {
  const code = `
# This is a comment
def my_function():
    pass
  `;
  const result = analyzeComplexity(code, 'test.py');
  
  assert.strictEqual(result.commentLines, 1);
  assert.strictEqual(result.functionCount, 1);
});

test('analyzeComplexity should analyze Go code correctly', () => {
  const code = `
// comment
func main() {
}
  `;
  const result = analyzeComplexity(code, 'test.go');
  
  assert.strictEqual(result.commentLines, 1);
  assert.strictEqual(result.functionCount, 1);
});

test('analyzeComplexity should analyze SQL code correctly', () => {
  const code = `
-- Single comment
/* block 
comment */
SELECT * FROM table;
  `;
  const result = analyzeComplexity(code, 'test.sql');
  
  assert.strictEqual(result.commentLines, 3);
});

test('analyzeComplexity should calculate complexity score and grade', () => {
  const code = `
function a() {}
function b() {}
function c() {}
function d() {}
function e() {}
\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n
  `;
  const result = analyzeComplexity(code, 'test.js');
  assert.strictEqual(result.functionCount, 5);
  assert.strictEqual(result.grade, 'C');
  assert.strictEqual(result.complexityScore, 16);
});
