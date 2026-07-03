import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllChanges } from '../utils/diffParser.js';

test('getAllChanges returns empty array for non-array input', () => {
  assert.deepEqual(getAllChanges(null), []);
  assert.deepEqual(getAllChanges(undefined), []);
  assert.deepEqual(getAllChanges('string'), []);
  assert.deepEqual(getAllChanges(123), []);
  assert.deepEqual(getAllChanges({}), []);
});

test('getAllChanges returns empty array for empty files array', () => {
  assert.deepEqual(getAllChanges([]), []);
});

test('getAllChanges flattens changes with correct file path annotation', () => {
  const files = [
    {
      path: 'src/index.js',
      changes: [
        { line: 10, content: 'const a = 1;' },
        { line: 11, content: 'const b = 2;' },
      ],
    },
  ];
  const result = getAllChanges(files);
  assert.equal(result.length, 2);
  assert.equal(result[0].line, 10);
  assert.equal(result[0].file, 'src/index.js');
  assert.equal(result[1].line, 11);
  assert.equal(result[1].file, 'src/index.js');
});

test('getAllChanges marks deletions with deleted: true', () => {
  const files = [
    {
      path: 'src/utils.js',
      deletions: [
        { line: 5, content: 'const old = 1;' },
        { line: 6, content: 'const alsoOld = 2;' },
      ],
    },
  ];
  const result = getAllChanges(files);
  assert.equal(result.length, 2);
  assert.equal(result[0].line, 5);
  assert.equal(result[0].file, 'src/utils.js');
  assert.equal(result[0].deleted, true);
  assert.equal(result[1].deleted, true);
});

test('getAllChanges handles both changes and deletions in same file', () => {
  const files = [
    {
      path: 'src/main.js',
      changes: [{ line: 1, content: 'const x = 1;' }],
      deletions: [{ line: 2, content: 'const y = 2;' }],
    },
  ];
  const result = getAllChanges(files);
  assert.equal(result.length, 2);
  const added = result.find(r => r.content === 'const x = 1;');
  const deleted = result.find(r => r.content === 'const y = 2;');
  assert.ok(added, 'should have a change entry');
  assert.equal(added.deleted, undefined);
  assert.ok(deleted, 'should have a deletion entry');
  assert.equal(deleted.deleted, true);
});

test('getAllChanges handles multiple files', () => {
  const files = [
    { path: 'file1.js', changes: [{ line: 1, content: 'a' }] },
    { path: 'file2.js', changes: [{ line: 2, content: 'b' }] },
    { path: 'file3.js', changes: [{ line: 3, content: 'c' }] },
  ];
  const result = getAllChanges(files);
  assert.equal(result.length, 3);
  assert.ok(result.every(r => r.file.startsWith('file')));
});

test('getAllChanges handles file with neither changes nor deletions', () => {
  const files = [{ path: 'empty.js' }];
  const result = getAllChanges(files);
  assert.deepEqual(result, []);
});

test('getAllChanges preserves all original change properties', () => {
  const files = [
    {
      path: 'src/test.js',
      changes: [{ line: 10, content: 'test line', extra: 'prop' }],
    },
  ];
  const result = getAllChanges(files);
  assert.equal(result.length, 1);
  assert.equal(result[0].line, 10);
  assert.equal(result[0].content, 'test line');
  assert.equal(result[0].extra, 'prop');
  assert.equal(result[0].file, 'src/test.js');
});
