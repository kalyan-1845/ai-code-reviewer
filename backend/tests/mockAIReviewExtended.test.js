import test from 'node:test';
import assert from 'node:assert/strict';
import { mockAIReview } from '../utils/mockAIReview.js';

// ---------------------------------------------------------------------------
// Tests: mockAIReview with varied file types
// ---------------------------------------------------------------------------
test('mockAIReview generates reviews for JavaScript JSX files', () => {
  const result = mockAIReview([{ name: 'Button.jsx', content: 'export default function Button() {}' }]);
  assert.ok(result.fileReviews['Button.jsx'], 'JSX file should have review entry');
  const review = result.fileReviews['Button.jsx'];
  assert.ok(review.bugs, 'JSX review should have bugs array');
  assert.ok(review.security, 'JSX review should have security array');
  assert.ok(review.optimization, 'JSX review should have optimization array');
  assert.ok(review.styling, 'JSX review should have styling array');
});

test('mockAIReview generates reviews for TypeScript TSX files', () => {
  const result = mockAIReview([{ name: 'App.tsx', content: 'const x: number = 1;' }]);
  assert.ok(result.fileReviews['App.tsx'], 'TSX file should have review entry');
});

test('mockAIReview generates reviews for Python files', () => {
  const result = mockAIReview([{ name: 'main.py', content: 'def main(): pass' }]);
  assert.ok(result.fileReviews['main.py'], 'Python file should have review entry');
});

test('mockAIReview generates reviews for Go files', () => {
  const result = mockAIReview([{ name: 'server.go', content: 'package main' }]);
  assert.ok(result.fileReviews['server.go'], 'Go file should have review entry');
});

test('mockAIReview generates reviews for Java files', () => {
  const result = mockAIReview([{ name: 'Main.java', content: 'public class Main {}' }]);
  assert.ok(result.fileReviews['Main.java'], 'Java file should have review entry');
});

test('mockAIReview generates reviews for Rust files', () => {
  const result = mockAIReview([{ name: 'lib.rs', content: 'pub fn hello() {}' }]);
  assert.ok(result.fileReviews['lib.rs'], 'Rust file should have review entry');
});

test('mockAIReview generates reviews for C++ files', () => {
  const result = mockAIReview([{ name: 'main.cpp', content: 'int main() { return 0; }' }]);
  assert.ok(result.fileReviews['main.cpp'], 'C++ file should have review entry');
});

test('mockAIReview generates reviews for Ruby files', () => {
  const result = mockAIReview([{ name: 'script.rb', content: 'puts "hello"' }]);
  assert.ok(result.fileReviews['script.rb'], 'Ruby file should have review entry');
});

test('mockAIReview generates reviews for HTML files', () => {
  const result = mockAIReview([{ name: 'index.html', content: '<html><body></body></html>' }]);
  assert.ok(result.fileReviews['index.html'], 'HTML file should have review entry');
});

test('mockAIReview generates reviews for CSS files', () => {
  const result = mockAIReview([{ name: 'style.css', content: 'body { color: red; }' }]);
  assert.ok(result.fileReviews['style.css'], 'CSS file should have review entry');
});

// ---------------------------------------------------------------------------
// Tests: mockAIReview with unusual filenames
// ---------------------------------------------------------------------------
test('mockAIReview handles files with spaces in name', () => {
  const result = mockAIReview([{ name: 'my file.js', content: 'x = 1' }]);
  assert.ok(result.fileReviews['my file.js'], 'File with spaces should be in reviews');
});

test('mockAIReview handles files with underscores in name', () => {
  const result = mockAIReview([{ name: 'my_test_file.py', content: 'x = 1' }]);
  assert.ok(result.fileReviews['my_test_file.py'], 'File with underscores should be in reviews');
});

test('mockAIReview handles deeply nested file paths', () => {
  const result = mockAIReview([{ name: 'src/components/ui/button/index.tsx', content: 'export {}' }]);
  assert.ok(result.fileReviews['src/components/ui/button/index.tsx'], 'Deeply nested file should be in reviews');
});

test('mockAIReview handles files at repository root (no slashes)', () => {
  const result = mockAIReview([{ name: 'config.yml', content: 'version: 1' }]);
  assert.ok(result.fileReviews['config.yml'], 'Root-level file should be in reviews');
  // README should handle root-level file gracefully (split('/')[0] returns filename itself)
  assert.ok(result.generatedReadme.includes('config.yml'), 'README should mention the file');
});

test('mockAIReview handles files with hyphen in name', () => {
  const result = mockAIReview([{ name: 'my-script.js', content: 'console.log(1)' }]);
  assert.ok(result.fileReviews['my-script.js'], 'File with hyphens should be in reviews');
});

// ---------------------------------------------------------------------------
// Tests: mockAIReview README generation edge cases
// ---------------------------------------------------------------------------
test('mockAIReview generatedReadme includes model name', () => {
  const result = mockAIReview([{ name: 'main.py', content: 'x = 1' }], 'deepseek-r1-distill-llama-70b');
  assert.ok(result.generatedReadme.includes('deepseek-r1-distill-llama-70b'));
});

test('mockAIReview generatedReadme includes file count', () => {
  const files = [
    { name: 'a.py', content: 'x = 1' },
    { name: 'b.py', content: 'y = 2' },
    { name: 'c.js', content: 'z = 3' },
  ];
  const result = mockAIReview(files);
  assert.ok(result.generatedReadme.includes('3 modules analyzed'));
});

test('mockAIReview generatedReadme lists all files', () => {
  const files = [
    { name: 'src/a.py', content: 'x = 1' },
    { name: 'src/b.py', content: 'y = 2' },
  ];
  const result = mockAIReview(files);
  assert.ok(result.generatedReadme.includes('src/a.py'));
  assert.ok(result.generatedReadme.includes('src/b.py'));
});

// ---------------------------------------------------------------------------
// Tests: mockAIReview mermaid generation edge cases
// ---------------------------------------------------------------------------
test('mockAIReview mermaidDiagram includes repository root name', () => {
  const result = mockAIReview([{ name: 'my-project/main.py', content: 'pass' }]);
  assert.ok(result.mermaidDiagram.includes('my-project'));
});

test('mockAIReview mermaidDiagram includes first 5 files max', () => {
  const files = [
    { name: 'a.py', content: '1' },
    { name: 'b.py', content: '2' },
    { name: 'c.py', content: '3' },
    { name: 'd.py', content: '4' },
    { name: 'e.py', content: '5' },
    { name: 'f.py', content: '6' },
    { name: 'g.py', content: '7' },
  ];
  const result = mockAIReview(files);
  const fileCount = (result.mermaidDiagram.match(/File_/g) || []).length;
  assert.equal(fileCount, 5, 'Mermaid should include at most 5 files');
  assert.ok(!result.mermaidDiagram.includes('File_5'), 'Should not include 6th file');
});

test('mockAIReview mermaidDiagram handles single file', () => {
  const result = mockAIReview([{ name: 'app.js', content: 'x' }]);
  assert.ok(result.mermaidDiagram.includes('app.js'));
  const fileCount = (result.mermaidDiagram.match(/File_/g) || []).length;
  assert.equal(fileCount, 1, 'Single file should appear once in mermaid');
});

// ---------------------------------------------------------------------------
// Tests: mockAIReview review structure
// ---------------------------------------------------------------------------
test('mockAIReview review bugs contain type, line, description, suggestion', () => {
  const result = mockAIReview([{ name: 'test.js', content: 'x' }]);
  const bug = result.fileReviews['test.js'].bugs[0];
  assert.ok(typeof bug.type === 'string' && bug.type.length > 0);
  assert.ok(bug.line === null);
  assert.ok(typeof bug.description === 'string' && bug.description.length > 0);
  assert.ok(typeof bug.suggestion === 'string' && bug.suggestion.length > 0);
});

test('mockAIReview review security contain type, line, description, suggestion', () => {
  const result = mockAIReview([{ name: 'test.js', content: 'x' }]);
  const sec = result.fileReviews['test.js'].security[0];
  assert.ok(typeof sec.type === 'string' && sec.type.length > 0);
  assert.ok(sec.line === null);
  assert.ok(typeof sec.description === 'string' && sec.description.length > 0);
  assert.ok(typeof sec.suggestion === 'string' && sec.suggestion.length > 0);
});

test('mockAIReview review optimization contain type, line, description, suggestion', () => {
  const result = mockAIReview([{ name: 'test.js', content: 'x' }]);
  const opt = result.fileReviews['test.js'].optimization[0];
  assert.ok(typeof opt.type === 'string' && opt.type.length > 0);
  assert.ok(opt.line === null);
  assert.ok(typeof opt.description === 'string' && opt.description.length > 0);
  assert.ok(typeof opt.suggestion === 'string' && opt.suggestion.length > 0);
});

test('mockAIReview review styling contain type, line, description, suggestion', () => {
  const result = mockAIReview([{ name: 'test.js', content: 'x' }]);
  const sty = result.fileReviews['test.js'].styling[0];
  assert.ok(typeof sty.type === 'string' && sty.type.length > 0);
  assert.ok(sty.line === null);
  assert.ok(typeof sty.description === 'string' && sty.description.length > 0);
  assert.ok(typeof sty.suggestion === 'string' && sty.suggestion.length > 0);
});

test('mockAIReview review description mentions the specific file name', () => {
  const result = mockAIReview([{ name: 'my_special_file.py', content: 'pass' }]);
  const bug = result.fileReviews['my_special_file.py'].bugs[0];
  assert.ok(bug.description.includes('my_special_file.py'));
});

test('mockAIReview review for multiple files produces separate review per file', () => {
  const result = mockAIReview([
    { name: 'alpha.js', content: 'a' },
    { name: 'beta.py', content: 'b' },
  ]);
  assert.ok(result.fileReviews['alpha.js'], 'alpha.js should have review');
  assert.ok(result.fileReviews['beta.py'], 'beta.py should have review');
  assert.equal(Object.keys(result.fileReviews).length, 2);
});

test('mockAIReview returns non-empty strings for generatedReadme and mermaidDiagram for single file', () => {
  const result = mockAIReview([{ name: 'x.js', content: 'y' }]);
  assert.ok(typeof result.generatedReadme === 'string' && result.generatedReadme.length > 0);
  assert.ok(typeof result.mermaidDiagram === 'string' && result.mermaidDiagram.length > 0);
});
