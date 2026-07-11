import test from 'node:test';
import assert from 'node:assert/strict';
import { mockAIReview } from '../utils/mockAIReview.js';

test('mockAIReview handles null files gracefully', () => {
  const result = mockAIReview(null);
  assert.deepEqual(result, {
    fileReviews: {},
    generatedReadme: '',
    mermaidDiagram: ''
  });
});

test('mockAIReview handles undefined files gracefully', () => {
  const result = mockAIReview(undefined);
  assert.deepEqual(result, {
    fileReviews: {},
    generatedReadme: '',
    mermaidDiagram: ''
  });
});

test('mockAIReview handles non-array files gracefully', () => {
  const result = mockAIReview('not an array');
  assert.deepEqual(result, {
    fileReviews: {},
    generatedReadme: '',
    mermaidDiagram: ''
  });
});

test('mockAIReview handles empty array', () => {
  const result = mockAIReview([]);
  assert.deepEqual(result, {
    fileReviews: {},
    generatedReadme: '',
    mermaidDiagram: ''
  });
});

test('mockAIReview generates review for single file', () => {
  const files = [{ name: 'main.py', content: 'print("hello")' }];
  const result = mockAIReview(files);
  assert.ok(result.fileReviews['main.py']);
  assert.ok(result.fileReviews['main.py'].bugs);
  assert.ok(result.fileReviews['main.py'].security);
  assert.ok(result.fileReviews['main.py'].optimization);
  assert.ok(result.fileReviews['main.py'].styling);
});

test('mockAIReview generates review for multiple files', () => {
  const files = [
    { name: 'src/a.py', content: 'x = 1' },
    { name: 'src/b.js', content: 'const y = 2' },
  ];
  const result = mockAIReview(files);
  assert.ok(result.fileReviews['src/a.py']);
  assert.ok(result.fileReviews['src/b.js']);
});

test('mockAIReview generatedReadme contains first folder name', () => {
  const files = [{ name: 'myproject/main.py', content: 'pass' }];
  const result = mockAIReview(files);
  assert.ok(result.generatedReadme.includes('myproject'));
});

test('mockAIReview mermaidDiagram contains file names', () => {
  const files = [{ name: 'src/utils/helper.py', content: 'pass' }];
  const result = mockAIReview(files);
  assert.ok(result.mermaidDiagram.includes('helper.py'));
});

test('mockAIReview review items have correct structure', () => {
  const files = [{ name: 'app.js', content: 'x' }];
  const result = mockAIReview(files);
  const review = result.fileReviews['app.js'];
  const bug = review.bugs[0];
  assert.ok(typeof bug.type === 'string');
  assert.ok(bug.line === null);
  assert.ok(typeof bug.description === 'string');
  assert.ok(typeof bug.suggestion === 'string');
});

test('mockAIReview description mentions the file name', () => {
  const files = [{ name: 'special_file.py', content: 'pass' }];
  const result = mockAIReview(files);
  const bug = result.fileReviews['special_file.py'].bugs[0];
  assert.ok(bug.description.includes('special_file.py'));
});

test('mockAIReview defaults model parameter to llama-3.3', () => {
  const files = [{ name: 'app.js', content: 'x' }];
  const result = mockAIReview(files);
  assert.ok(result.generatedReadme.includes('llama-3.3'));
});

test('mockAIReview mermaidDiagram is non-empty string', () => {
  const files = [{ name: 'index.js', content: 'x' }];
  const result = mockAIReview(files);
  assert.ok(typeof result.mermaidDiagram === 'string');
  assert.ok(result.mermaidDiagram.length > 0);
});
