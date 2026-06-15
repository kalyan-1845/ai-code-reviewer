import test from 'node:test';
import assert from 'node:assert/strict';
import { mockAIReview } from '../utils/mockAIReview.js';

test('mockAIReview returns empty structure when files list is empty', () => {
  const result = mockAIReview([]);
  assert.deepEqual(result, {
    fileReviews: {},
    generatedReadme: '',
    mermaidDiagram: ''
  });
});

test('mockAIReview returns expected mock review layout for files', () => {
  const files = [
    { name: 'src/index.js', content: 'const x = 1;' }
  ];
  const modelName = 'my-custom-model';
  const result = mockAIReview(files, modelName);

  assert.ok(result.fileReviews['src/index.js']);
  assert.ok(result.generatedReadme.includes(modelName));
  assert.ok(result.mermaidDiagram.includes('index.js'));
});
