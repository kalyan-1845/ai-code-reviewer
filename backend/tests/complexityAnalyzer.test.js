import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeComplexity } from '../utils/complexityAnalyzer.js';

test('analyzeComplexity should return zeroed values for empty inputs', () => {
  const result = analyzeComplexity('', 'index.js');
  assert.equal(result.totalLines, 0);
  assert.equal(result.grade, 'A');
});

test('analyzeComplexity should count JSDoc and standard comments in JavaScript correctly', () => {
  const code = `
  // standard comment
  const x = 5;

  /**
   * Block comment
   */
  function foo() {
    return x;
  }
  `;
  const result = analyzeComplexity(code, 'index.js');
  // comment lines are: //, /**, * Block comment, */, * JSDoc lines
  // Let's verify standard comment (1), doc comment open (1), doc comment body (1), doc comment close (1) -> 4 lines of comment.
  assert.ok(result.commentLines >= 4);
  assert.equal(result.functionCount, 1);
});

test('analyzeComplexity should count python comments and functions correctly', () => {
  const code = `
# Python script
def add(a, b):
    # adds two numbers
    return a + b
  `;
  const result = analyzeComplexity(code, 'app.py');
  assert.equal(result.commentLines, 2);
  assert.equal(result.functionCount, 1);
});

test('analyzeComplexity should not count commented-out functions in single-line comments', () => {
  const codeJS = `
  // function commentedOutJS() { }
  // const fakeArrow = () => {};
  `;
  const resultJS = analyzeComplexity(codeJS, 'index.js');
  assert.equal(resultJS.functionCount, 0);

  const codePy = `
  # def commented_out_py():
  #     pass
  `;
  const resultPy = analyzeComplexity(codePy, 'app.py');
  assert.equal(resultPy.functionCount, 0);

  const codeSql = `
  -- function commented_out_sql()
  `;
  const resultSql = analyzeComplexity(codeSql, 'query.sql');
  assert.equal(resultSql.functionCount, 0);
});
