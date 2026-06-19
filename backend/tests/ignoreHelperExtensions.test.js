import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFilesRecursively } from '../utils/ignoreHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('readFilesRecursively should include .json files', () => {
  const tempDir = path.join(__dirname, 'temp_ext_json');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  fs.writeFileSync(path.join(tempDir, 'config.json'), '{"key": "value"}');
  fs.writeFileSync(path.join(tempDir, 'package.json'), '{"name": "test"}');

  const files = readFilesRecursively(tempDir, [], tempDir, []);
  const fileNames = files.map(f => f.name);

  assert.ok(fileNames.includes('config.json'), 'config.json should be included');
  assert.ok(fileNames.includes('package.json'), 'package.json should be included');
  const jsonFiles = files.filter(f => f.name.endsWith('.json'));
  assert.equal(jsonFiles.length, 2, 'Should include exactly 2 .json files');

  // Clean up
  fs.unlinkSync(path.join(tempDir, 'config.json'));
  fs.unlinkSync(path.join(tempDir, 'package.json'));
  fs.rmdirSync(tempDir);
});

test('readFilesRecursively should include .yaml and .yml files', () => {
  const tempDir = path.join(__dirname, 'temp_ext_yaml');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  fs.writeFileSync(path.join(tempDir, 'config.yaml'), 'server:\n  port: 3000');
  fs.writeFileSync(path.join(tempDir, 'settings.yml'), 'debug: true');

  const files = readFilesRecursively(tempDir, [], tempDir, []);
  const fileNames = files.map(f => f.name);

  assert.ok(fileNames.includes('config.yaml'), 'config.yaml should be included');
  assert.ok(fileNames.includes('settings.yml'), 'settings.yml should be included');
  const yamlFiles = files.filter(f => f.name.endsWith('.yaml') || f.name.endsWith('.yml'));
  assert.equal(yamlFiles.length, 2, 'Should include exactly 2 yaml/yml files');

  // Clean up
  fs.unlinkSync(path.join(tempDir, 'config.yaml'));
  fs.unlinkSync(path.join(tempDir, 'settings.yml'));
  fs.rmdirSync(tempDir);
});

test('readFilesRecursively should not include unsupported file extensions', () => {
  const tempDir = path.join(__dirname, 'temp_ext_unsupported');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  // Write files with no content - they would be excluded by file.changes.length === 0 check
  // So write some content to make them valid candidates
  fs.writeFileSync(path.join(tempDir, 'readme.md'), '# Readme');
  fs.writeFileSync(path.join(tempDir, 'data.xml'), '<data/>');
  fs.writeFileSync(path.join(tempDir, 'notes.txt'), 'some notes');

  // We expect these NOT to be in validExtensions, so they won't be included
  const files = readFilesRecursively(tempDir, [], tempDir, []);
  const fileNames = files.map(f => f.name);

  assert.equal(fileNames.some(f => f.endsWith('.md')), false, '.md files should not be included');
  assert.equal(fileNames.some(f => f.endsWith('.xml')), false, '.xml files should not be included');
  assert.equal(fileNames.some(f => f.endsWith('.txt')), false, '.txt files should not be included');

  // Clean up
  fs.unlinkSync(path.join(tempDir, 'readme.md'));
  fs.unlinkSync(path.join(tempDir, 'data.xml'));
  fs.unlinkSync(path.join(tempDir, 'notes.txt'));
  fs.rmdirSync(tempDir);
});
