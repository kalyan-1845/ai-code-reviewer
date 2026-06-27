'use strict';

// vscode-preload.js — preload to stub the vscode module for Node.js test execution.
// Run mocha with: --require ./src/test/vscode-preload.js
const Module = require('module');
const vscodeStub = require('./vscode-stub.js');

const originalLoad = Module._load;
Module._load = function (request, parent) {
  if (request === 'vscode') {
    return vscodeStub;
  }
  return originalLoad.apply(this, arguments);
};
