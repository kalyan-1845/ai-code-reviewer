import test from 'node:test';
import assert from 'node:assert/strict';
import { detectShebangLanguage, isIgnored } from '../utils/ignoreHelper.js';

// --- detectShebangLanguage tests ---

test('detectShebangLanguage returns python for python3 shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/env python3\nprint("hi")'), 'python');
});

test('detectShebangLanguage returns python for python shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/python\nprint("hi")'), 'python');
});

test('detectShebangLanguage returns python for python2.7 shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/python2.7\nprint("hi")'), 'python');
});

test('detectShebangLanguage returns javascript for node shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/env node\nconsole.log("hi")'), 'javascript');
});

test('detectShebangLanguage returns javascript for node shebang without env', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/node\nconsole.log("hi")'), 'javascript');
});

test('detectShebangLanguage returns shell for bash shebang', () => {
  assert.equal(detectShebangLanguage('#!/bin/bash\necho "hello"'), 'shell');
});

test('detectShebangLanguage returns shell for sh shebang', () => {
  assert.equal(detectShebangLanguage('#!/bin/sh\necho "hello"'), 'shell');
});

test('detectShebangLanguage returns shell for zsh shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/zsh\necho "hello"'), 'shell');
});

test('detectShebangLanguage returns shell for dash shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/dash\necho "hello"'), 'shell');
});

test('detectShebangLanguage returns ruby for ruby shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/ruby\nputs "hi"'), 'ruby');
});

test('detectShebangLanguage returns perl for perl shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/perl\nprint "hi\n"'), 'perl');
});

test('detectShebangLanguage returns php for php shebang', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/php\n<?php echo "hi";'), 'php');
});

test('detectShebangLanguage returns null for non-shebang content', () => {
  assert.equal(detectShebangLanguage('print("hello world")'), null);
});

test('detectShebangLanguage returns null for empty string', () => {
  assert.equal(detectShebangLanguage(''), null);
});

test('detectShebangLanguage returns null for non-string input', () => {
  assert.equal(detectShebangLanguage(null), null);
  assert.equal(detectShebangLanguage(undefined), null);
  assert.equal(detectShebangLanguage(123), null);
});

test('detectShebangLanguage only checks first line', () => {
  // Second line has python but first line does not
  assert.equal(detectShebangLanguage('some text\n#!/usr/bin/python\n'), null);
});

// --- isIgnored tests ---

test('isIgnored returns false for empty patterns array', () => {
  assert.equal(isIgnored('/repo/src/file.js', [], '/repo'), false);
});

test('isIgnored returns false for non-array patterns', () => {
  assert.equal(isIgnored('/repo/src/file.js', null, '/repo'), false);
  assert.equal(isIgnored('/repo/src/file.js', undefined, '/repo'), false);
});

test('isIgnored returns false for null pattern items', () => {
  assert.equal(isIgnored('/repo/src/file.js', [null, undefined], '/repo'), false);
});

test('isIgnored returns false for empty string pattern items', () => {
  assert.equal(isIgnored('/repo/src/file.js', [''], '/repo'), false);
});

test('isIgnored matches a simple filename pattern', () => {
  assert.equal(isIgnored('/repo/src/file.js', ['file.js'], '/repo/src'), true);
});

test('isIgnored matches a glob *.js pattern', () => {
  assert.equal(isIgnored('/repo/src/app.js', ['*.js'], '/repo/src'), true);
  // picomatch expands *.js to **/js/** which matches nested paths too
  assert.equal(isIgnored('/repo/src/nested/app.js', ['*.js'], '/repo/src'), true);
});

test('isIgnored matches a directory pattern with trailing slash', () => {
  assert.equal(isIgnored('/repo/node_modules/foo/bar.js', ['node_modules/'], '/repo'), true);
});

test('isIgnored does not match a non-matching file', () => {
  assert.equal(isIgnored('/repo/src/file.js', ['*.ts'], '/repo/src'), false);
});

test('isIgnored returns false for paths outside baseDir', () => {
  assert.equal(isIgnored('/other/file.js', ['file.js'], '/repo'), false);
});

test('isIgnored returns false for absolute paths that escape baseDir', () => {
  // picomatch-style paths that resolve outside baseDir are not ignored
  assert.equal(isIgnored('/repo/src/../../../etc/passwd', ['*'], '/repo'), false);
});

test('isIgnored matches an anchored /node_modules pattern', () => {
  assert.equal(isIgnored('/repo/node_modules/package/index.js', ['/node_modules/'], '/repo'), true);
});
