import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, scanSecrets, scanSecretsInChanges } from '../utils/secretsScanner.js';

// ---------------------------------------------------------------------------
// Helpers: sample addresses for testing
// ---------------------------------------------------------------------------
const ethAddress = '0x' + 'aB3d'.repeat(10); // 0xaB3daB3daB3daB3daB3daB3daB3daB3daB3daB3d
const btcP2PKH = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';
const btcP2SH = '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy';
const btcBech32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

// ===========================================================================
// IPv4 Address Detection
// ===========================================================================

test('IPv4: detects private network IPs in code', () => {
  const content = 'const dbHost = "192.168.1.100";';
  const findings = scanSecrets(content);
  const ipFindings = findings.filter(f => f.type === 'Hardcoded IPv4 Address');
  assert.ok(ipFindings.length >= 1, 'should detect 192.168.1.100');
});

test('IPv4: detects 10.x.x.x range IPs', () => {
  const content = 'DB_HOST=10.0.0.5';
  const findings = scanSecrets(content);
  const ipFindings = findings.filter(f => f.type === 'Hardcoded IPv4 Address');
  assert.ok(ipFindings.length >= 1, 'should detect 10.0.0.5');
});

test('IPv4: does NOT flag loopback 127.0.0.1', () => {
  const content = 'const host = "127.0.0.1";';
  const findings = scanSecrets(content);
  const ipFindings = findings.filter(f => f.type === 'Hardcoded IPv4 Address');
  assert.equal(ipFindings.length, 0, 'should not flag 127.0.0.1');
});

test('IPv4: does NOT flag 127.x.x.x range', () => {
  const content = 'const host = "127.255.0.1";';
  const findings = scanSecrets(content);
  const ipFindings = findings.filter(f => f.type === 'Hardcoded IPv4 Address');
  assert.equal(ipFindings.length, 0, 'should not flag 127.255.0.1');
});

test('IPv4: does NOT flag 0.0.0.0', () => {
  const content = 'server.listen("0.0.0.0", 3000);';
  const findings = scanSecrets(content);
  const ipFindings = findings.filter(f => f.type === 'Hardcoded IPv4 Address');
  assert.equal(ipFindings.length, 0, 'should not flag 0.0.0.0');
});

test('IPv4: does NOT flag broadcast 255.255.255.255', () => {
  const content = 'const broadcast = "255.255.255.255";';
  const findings = scanSecrets(content);
  const ipFindings = findings.filter(f => f.type === 'Hardcoded IPv4 Address');
  assert.equal(ipFindings.length, 0, 'should not flag 255.255.255.255');
});

test('IPv4: detects public IP addresses', () => {
  const content = 'const endpoint = "54.239.28.85";';
  const findings = scanSecrets(content);
  const ipFindings = findings.filter(f => f.type === 'Hardcoded IPv4 Address');
  assert.ok(ipFindings.length >= 1, 'should detect public IP 54.239.28.85');
});

test('IPv4: reports correct line number', () => {
  const content = [
    '// config file',
    'const port = 3000;',
    'const dbHost = "172.16.0.42";',
    'module.exports = {};',
  ].join('\n');
  const findings = scanSecrets(content);
  const ipFinding = findings.find(f => f.type === 'Hardcoded IPv4 Address');
  assert.ok(ipFinding, 'should detect IP');
  assert.equal(ipFinding.line, 3, 'IP is on line 3');
});

// ===========================================================================
// Ethereum Wallet Detection
// ===========================================================================

test('ETH: detects valid Ethereum wallet address', () => {
  const content = `const wallet = "${ethAddress}";`;
  const findings = scanSecrets(content);
  const ethFindings = findings.filter(f => f.type === 'Ethereum (ETH) Wallet Address');
  assert.ok(ethFindings.length >= 1, 'should detect ETH wallet address');
});

test('ETH: does NOT flag short hex strings', () => {
  const content = 'const color = 0xDEADBEEF;';
  const findings = scanSecrets(content);
  const ethFindings = findings.filter(f => f.type === 'Ethereum (ETH) Wallet Address');
  assert.equal(ethFindings.length, 0, 'should not flag short hex like 0xDEADBEEF');
});

test('ETH: does NOT flag 0x with fewer than 40 hex chars', () => {
  const content = 'const val = "0x1234567890abcdef";';
  const findings = scanSecrets(content);
  const ethFindings = findings.filter(f => f.type === 'Ethereum (ETH) Wallet Address');
  assert.equal(ethFindings.length, 0, 'should not flag short 0x string');
});

test('ETH: description contains Network/Crypto Leak', () => {
  const ethRule = rules.find(r => r.type === 'Ethereum (ETH) Wallet Address');
  assert.ok(ethRule, 'ETH rule should exist');
  assert.ok(ethRule.description.includes('Network/Crypto Leak'), 'description should mention Network/Crypto Leak');
});

// ===========================================================================
// Bitcoin Wallet Detection
// ===========================================================================

test('BTC: detects P2PKH address (starts with 1)', () => {
  const content = `const btcAddr = "${btcP2PKH}";`;
  const findings = scanSecrets(content);
  const btcFindings = findings.filter(f => f.type === 'Bitcoin (BTC) Wallet Address');
  assert.ok(btcFindings.length >= 1, 'should detect P2PKH BTC address');
});

test('BTC: detects P2SH address (starts with 3)', () => {
  const content = `const btcAddr = "${btcP2SH}";`;
  const findings = scanSecrets(content);
  const btcFindings = findings.filter(f => f.type === 'Bitcoin (BTC) Wallet Address');
  assert.ok(btcFindings.length >= 1, 'should detect P2SH BTC address');
});

test('BTC: detects Bech32 address (starts with bc1)', () => {
  const content = `const btcAddr = "${btcBech32}";`;
  const findings = scanSecrets(content);
  const btcFindings = findings.filter(f => f.type === 'Bitcoin (BTC) Wallet Address');
  assert.ok(btcFindings.length >= 1, 'should detect Bech32 BTC address');
});

test('BTC: does NOT flag short strings starting with 1 or 3', () => {
  const content = 'const x = "1abc"; const y = "3xyz";';
  const findings = scanSecrets(content);
  const btcFindings = findings.filter(f => f.type === 'Bitcoin (BTC) Wallet Address');
  assert.equal(btcFindings.length, 0, 'should not flag short strings');
});

test('BTC: description contains Network/Crypto Leak', () => {
  const btcRule = rules.find(r => r.type === 'Bitcoin (BTC) Wallet Address');
  assert.ok(btcRule, 'BTC rule should exist');
  assert.ok(btcRule.description.includes('Network/Crypto Leak'), 'description should mention Network/Crypto Leak');
});

// ===========================================================================
// Integration: scanSecrets with mixed content
// ===========================================================================

test('scanSecrets: detects IPv4 and ETH wallet in same file', () => {
  const content = [
    'const server = "10.20.30.40";',
    'const wallet = "' + ethAddress + '";',
  ].join('\n');
  const findings = scanSecrets(content);
  const types = findings.map(f => f.type);
  assert.ok(types.includes('Hardcoded IPv4 Address'), 'should detect IPv4');
  assert.ok(types.includes('Ethereum (ETH) Wallet Address'), 'should detect ETH wallet');
});

test('scanSecrets: detects all three new types in one file', () => {
  const content = [
    'const dbHost = "192.168.0.1";',
    `const ethWallet = "${ethAddress}";`,
    `const btcWallet = "${btcP2PKH}";`,
  ].join('\n');
  const findings = scanSecrets(content);
  const types = findings.map(f => f.type);
  assert.ok(types.includes('Hardcoded IPv4 Address'), 'should detect IPv4');
  assert.ok(types.includes('Ethereum (ETH) Wallet Address'), 'should detect ETH');
  assert.ok(types.includes('Bitcoin (BTC) Wallet Address'), 'should detect BTC');
});

// ===========================================================================
// Integration: scanSecretsInChanges with new rules
// ===========================================================================

test('scanSecretsInChanges: detects IPv4 in PR diff changes', () => {
  const changes = [
    { line: 5, content: 'const host = "10.0.0.5";' }
  ];
  const results = scanSecretsInChanges(changes);
  assert.ok(results.findings.length >= 1, 'should detect IPv4 in changes');
  assert.ok(results.findings.some(f => f.comment.includes('Hardcoded IPv4 Address')), 'comment should mention IPv4');
});

test('scanSecretsInChanges: detects ETH wallet in PR diff changes', () => {
  const changes = [
    { line: 12, content: `const w = "${ethAddress}";` }
  ];
  const results = scanSecretsInChanges(changes);
  assert.ok(results.findings.length >= 1, 'should detect ETH wallet in changes');
  assert.ok(results.findings.some(f => f.comment.includes('Ethereum')), 'comment should mention Ethereum');
});

test('scanSecretsInChanges: detects BTC wallet in PR diff changes', () => {
  const changes = [
    { line: 20, content: `const addr = "${btcBech32}";` }
  ];
  const results = scanSecretsInChanges(changes);
  assert.ok(results.findings.length >= 1, 'should detect BTC wallet in changes');
  assert.ok(results.findings.some(f => f.comment.includes('Bitcoin')), 'comment should mention Bitcoin');
});

test('scanSecretsInChanges: does NOT flag loopback IP in changes', () => {
  const changes = [
    { line: 1, content: 'server.listen("127.0.0.1", 8080);' }
  ];
  const results = scanSecretsInChanges(changes);
  const ipFindings = results.findings.filter(f => f.comment.includes('IPv4'));
  assert.equal(ipFindings.length, 0, 'should not flag loopback in changes');
});

// ===========================================================================
// Category label verification
// ===========================================================================

test('all 3 new rules have Network/Crypto Leak in their description', () => {
  const newTypes = ['Hardcoded IPv4 Address', 'Ethereum (ETH) Wallet Address', 'Bitcoin (BTC) Wallet Address'];
  for (const typeName of newTypes) {
    const rule = rules.find(r => r.type === typeName);
    assert.ok(rule, `${typeName} rule should exist`);
    assert.ok(
      rule.description.includes('Network/Crypto Leak'),
      `${typeName} description should contain "Network/Crypto Leak"`
    );
  }
});
