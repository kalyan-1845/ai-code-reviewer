'use strict';

// vscode-stub.js — minimal stub for vscode API used by RepoSage diagnostics
// and API tests. Place this at src/test/vscode-stub.js.

let warningMessage = '';
let infoMessage = '';
const diagnosticsMap = new Map();
let mockApiUrl = 'http://localhost:5000';

// Configuration stub
const mockConfig = {
  get: (key, defaultValue) => {
    if (key === 'apiUrl') return mockApiUrl;
    return defaultValue;
  },
};

const mockWorkspace = {
  getConfiguration: () => mockConfig,
};

const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 4,
  Hint: 5,
};

class MockRange {
  constructor(startLine, startChar, endLine, endChar) {
    this.start = { line: startLine, character: startChar };
    this.end = { line: endLine, character: endChar };
  }
}

class MockDiagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
    this.source = '';
    this.code = undefined;
  }
}

class MockDiagnosticCollection {
  clear() { diagnosticsMap.clear(); }
  set(uri, diagnostics) { diagnosticsMap.set(uri, diagnostics); }
  delete(uri) { diagnosticsMap.delete(uri); }
  dispose() { diagnosticsMap.clear(); }
}

const mockWindow = {
  showWarningMessage: (msg) => { warningMessage = msg; return Promise.resolve(msg); },
  showInformationMessage: (msg) => { infoMessage = msg; return Promise.resolve(msg); },
  showErrorMessage: () => Promise.resolve(),
};

const mockLanguages = {
  createDiagnosticCollection: (name) => new MockDiagnosticCollection(),
};

const Uri = {
  file: (path) => ({ fsPath: path, path }),
};

module.exports = {
  DiagnosticSeverity,
  window: mockWindow,
  languages: mockLanguages,
  Uri,
  Range: MockRange,
  Diagnostic: MockDiagnostic,
  DiagnosticCollection: MockDiagnosticCollection,
  workspace: mockWorkspace,
  getWarning: () => warningMessage,
  getInfo: () => infoMessage,
  getDiagnostics: () => diagnosticsMap,
  reset: () => {
    warningMessage = '';
    infoMessage = '';
    diagnosticsMap.clear();
  },
  setApiUrl: (url) => { mockApiUrl = url; },
};
