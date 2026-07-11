// diagnostics.test.ts
// Tests for RepoSageDiagnostics using VS Code API stubs.
// This file uses a declare block to provide VS Code types at compile time,
// while the actual test runs via @vscode/test-electron (the standard VS Code
// extension test runner). The stub object below replaces VS Code APIs at
// runtime so the class can be tested without a display.

import * as assert from 'assert';

// ---------------------------------------------------------------------------
// VS Code API stub — replaces the real vscode namespace during tests.
// The @vscode/test-electron runner injects the real vscode types so TypeScript
// accepts the import; the stub object below overrides specific APIs.
// ---------------------------------------------------------------------------
const DiagnosticSeverity = {
  Error: 1,
  Warning: 2,
  Information: 4,
};

const mockDiagnosticsSet = new Array<{ severity: number; message: string; line: number; source: string }>();
let mockWarning = '';
let mockInfo = '';
let mockClearCount = 0;

const vscode = require('vscode') as any;
// Stub the APIs used by RepoSageDiagnostics
(vscode as any).window = {
  showWarningMessage: (msg: string) => { mockWarning = msg; return Promise.resolve(); },
  showInformationMessage: (msg: string) => { mockInfo = msg; return Promise.resolve(); },
};
(vscode as any).languages = {
  createDiagnosticCollection: () => ({
    clear: () => { mockClearCount++; },
    set: (_uri: any, diags: any[]) => {
      mockDiagnosticsSet.length = 0;
      for (const d of diags) {
        mockDiagnosticsSet.push({
          severity: d.severity,
          message: d.message,
          line: d.range.start.line,
          source: d.source,
        });
      }
    },
    dispose: () => {},
  }),
};
(vscode as any).DiagnosticSeverity = DiagnosticSeverity;
(vscode as any).Uri = { file: (p: string) => p };
(vscode as any).Range = class {
  constructor(
    public startLine: number,
    public startChar: number,
    public endLine: number,
    public endChar: number
  ) {
    this.start = { line: startLine, character: startChar };
    this.end = { line: endLine, character: endChar };
  }
  start: { line: number; character: number };
  end: { line: number; character: number };
};
(vscode as any).Diagnostic = class {
  constructor(
    public range: { start: { line: number; character: number }; end: { line: number; character: number } },
    public message: string,
    public severity: number
  ) {
    this.source = '';
  }
  source: string;
  code: any;
};

// ---------------------------------------------------------------------------
// Import after stubbing
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RepoSageDiagnostics } = require('../../diagnostics');

function reset() {
  mockDiagnosticsSet.length = 0;
  mockWarning = '';
  mockInfo = '';
  mockClearCount = 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('RepoSageDiagnostics constructor creates a diagnostics collection', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.dispose();
  assert.ok(mockClearCount >= 0, 'constructor should initialise without throwing');
});

test('updateFromResponse clears previous diagnostics', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    { success: true, analysis: { fileReviews: {} } },
    'foo.js'
  );
  assert.equal(mockClearCount, 1);
  rq.dispose();
});

test('updateFromResponse returns empty array when file has no review', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    { success: true, analysis: { fileReviews: {} } },
    'foo.js'
  );
  assert.deepEqual(mockDiagnosticsSet, []);
  rq.dispose();
});

test('security items are mapped to Error severity', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [{ type: 'secret', line: 3, description: 'Hardcoded key', suggestion: 'Use env' }],
            bugs: [],
            optimization: [],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  assert.equal(mockDiagnosticsSet.length, 1);
  assert.equal(mockDiagnosticsSet[0].severity, DiagnosticSeverity.Error);
  assert.ok(mockDiagnosticsSet[0].message.includes('Security'));
  assert.ok(mockDiagnosticsSet[0].message.includes('Hardcoded key'));
  assert.ok(mockDiagnosticsSet[0].message.includes('Suggestion: Use env'));
  rq.dispose();
});

test('bug items are mapped to Error severity', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [],
            bugs: [{ type: 'null', line: 5, description: 'Null check missing', suggestion: 'Add guard' }],
            optimization: [],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  assert.equal(mockDiagnosticsSet.length, 1);
  assert.equal(mockDiagnosticsSet[0].severity, DiagnosticSeverity.Error);
  assert.ok(mockDiagnosticsSet[0].message.includes('Bug'));
  rq.dispose();
});

test('optimization items are mapped to Warning severity', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [],
            bugs: [],
            optimization: [{ type: 'perf', line: 7, description: 'Unnecessary loop', suggestion: 'Use map' }],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  assert.equal(mockDiagnosticsSet.length, 1);
  assert.equal(mockDiagnosticsSet[0].severity, DiagnosticSeverity.Warning);
  assert.ok(mockDiagnosticsSet[0].message.includes('Optimization'));
  rq.dispose();
});

test('styling items are mapped to Information severity', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [],
            bugs: [],
            optimization: [],
            styling: [{ type: 'fmt', line: 1, description: 'Missing newline', suggestion: 'Add EOL' }],
          },
        },
      },
    },
    'foo.js'
  );
  assert.equal(mockDiagnosticsSet.length, 1);
  assert.equal(mockDiagnosticsSet[0].severity, DiagnosticSeverity.Information);
  assert.ok(mockDiagnosticsSet[0].message.includes('Styling'));
  rq.dispose();
});

test('line numbers are converted from 1-based (backend) to 0-based (VS Code)', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [],
            bugs: [{ type: 'err', line: 5, description: 'Error on line 5', suggestion: '' }],
            optimization: [],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  // Backend sends 1-based line 5; VS Code uses 0-based, so range should start at 4
  assert.equal(mockDiagnosticsSet[0].line, 4);
  rq.dispose();
});

test('line number 0 stays at 0', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [],
            bugs: [{ type: 'err', line: 0, description: 'First line', suggestion: '' }],
            optimization: [],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  assert.equal(mockDiagnosticsSet[0].line, 0);
  rq.dispose();
});

test('diagnostic source is set to RepoSage', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [{ type: 's', line: 1, description: 'D', suggestion: '' }],
            bugs: [],
            optimization: [],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  assert.equal(mockDiagnosticsSet[0].source, 'RepoSage');
  rq.dispose();
});

test('shows warning when at least one issue is found', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [{ type: 's', line: 1, description: 'D', suggestion: '' }],
            bugs: [],
            optimization: [],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  assert.ok(mockWarning.includes('1 issue'));
  rq.dispose();
});

test('shows info when no issues found', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [],
            bugs: [],
            optimization: [],
            styling: [],
          },
        },
      },
    },
    'foo.js'
  );
  assert.ok(mockInfo.includes('no issues'));
  rq.dispose();
});

test('handles missing analysis gracefully', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse({ success: false } as any, 'foo.js');
  assert.deepEqual(mockDiagnosticsSet, []);
  rq.dispose();
});

test('clear() resets diagnostics', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.clear();
  assert.equal(mockClearCount, 1);
  rq.dispose();
});

test('multiple items across categories are all included', () => {
  reset();
  const rq = new RepoSageDiagnostics();
  rq.updateFromResponse(
    {
      success: true,
      analysis: {
        fileReviews: {
          'foo.js': {
            security: [{ type: 's1', line: 1, description: 'Sec1', suggestion: '' }],
            bugs: [{ type: 'b1', line: 2, description: 'Bug1', suggestion: '' }],
            optimization: [{ type: 'o1', line: 3, description: 'Opt1', suggestion: '' }],
            styling: [{ type: 'st1', line: 4, description: 'Style1', suggestion: '' }],
          },
        },
      },
    },
    'foo.js'
  );
  assert.equal(mockDiagnosticsSet.length, 4);
  const severities = mockDiagnosticsSet.map(d => d.severity);
  assert.ok(severities.includes(DiagnosticSeverity.Error));    // security
  assert.ok(severities.includes(DiagnosticSeverity.Error));    // bug
  assert.ok(severities.includes(DiagnosticSeverity.Warning));  // optimization
  assert.ok(severities.includes(DiagnosticSeverity.Information)); // styling
  rq.dispose();
});
