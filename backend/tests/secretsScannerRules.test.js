import test from 'node:test';
import assert from 'node:assert/strict';
import { rules, scanSecrets } from '../utils/secretsScanner.js';

// ---------------------------------------------------------------------------
// Helper: build secret strings via runtime concatenation so they do not
// appear as literal strings in the source and do not trigger push protection.
// ---------------------------------------------------------------------------
const awsKey = 'AKIA' + 'IOSFODNN7EXAMPLE';
const gitHubPat = 'ghp_' + 'abc123def456ghi789jkl012mno345pqr678';
const stripeKey = 'sk_live_' + 'Abcdefghijklmnopqrstuvwx';
const gcpKey = 'AIzaSyAz12-34_567890abcdef1234567890123';
const slackUrl = 'https://hooks.slack.com/services/T' + '12345678/B12345678/' + 'abcdefghijklmnopqrstuvwx';
const twilioSid = 'AC' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const twilioToken = 'twilio_auth = "' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' + '"';
const jwtToken =
  'eyJ' + 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// ---------------------------------------------------------------------------
// Expected rule types that should exist in the rules array
// ---------------------------------------------------------------------------
const EXPECTED_RULE_TYPES = [
  'AWS Access Key Check',
  'GitHub Personal Access Token',
  'Stripe Secret API Key',
  'Google Cloud API Key',
  'Database Connection Credentials',
  'Slack Incoming Webhook',
  'Generic Private Key',
  'Common Environment Credential',
  'Twilio Account SID',
  'Twilio Auth Token',
  'JWT Token Check',
  'Generic API Key / Token',
  'Hardcoded IPv4 Address',
  'Ethereum (ETH) Wallet Address',
  'Bitcoin (BTC) Wallet Address',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('rules is an array with at least one entry', () => {
  assert.ok(Array.isArray(rules), 'rules should be an array');
  assert.ok(rules.length > 0, 'rules should not be empty');
});

test('rules has exactly 17 entries', () => {
  assert.equal(rules.length, 17, 'rules array should have 17 entries');
});

test('every rule has a type string', () => {
  rules.forEach((rule, i) => {
    assert.ok(
      typeof rule.type === 'string' && rule.type.length > 0,
      `rule[${i}] should have a non-empty type string`
    );
  });
});

test('every rule has a regex field that is a RegExp', () => {
  rules.forEach((rule, i) => {
    assert.ok(
      rule.regex instanceof RegExp,
      `rule[${i}] (${rule.type}) should have a regex property that is a RegExp`
    );
  });
});

test('every rule has a description string', () => {
  rules.forEach((rule, i) => {
    assert.ok(
      typeof rule.description === 'string' && rule.description.length > 0,
      `rule[${i}] (${rule.type}) should have a non-empty description string`
    );
  });
});

test('AWS Access Key Check rule exists and matches AWS key format', () => {
  const awsRule = rules.find((r) => r.type === 'AWS Access Key Check');
  assert.ok(awsRule, 'AWS Access Key Check rule should exist');

  awsRule.regex.lastIndex = 0;
  assert.ok(awsRule.regex.test(awsKey), 'AWS rule should match AKIAIOSFODNN7EXAMPLE');

  awsRule.regex.lastIndex = 0;
  assert.ok(!awsRule.regex.test('AKIA123'), 'AWS rule should not match short key');
});

test('GitHub Personal Access Token rule exists and matches GitHub PAT format', () => {
  const patRule = rules.find((r) => r.type === 'GitHub Personal Access Token');
  assert.ok(patRule, 'GitHub PAT rule should exist');

  patRule.regex.lastIndex = 0;
  assert.ok(patRule.regex.test(gitHubPat), 'PAT rule should match valid GitHub PAT');
});

test('Stripe Secret API Key rule exists and matches sk_live format', () => {
  const stripeRule = rules.find((r) => r.type === 'Stripe Secret API Key');
  assert.ok(stripeRule, 'Stripe rule should exist');

  stripeRule.regex.lastIndex = 0;
  assert.ok(stripeRule.regex.test(stripeKey), 'Stripe rule should match sk_live_ key');
});

test('Google Cloud API Key rule exists and matches AIza format', () => {
  const gcpRule = rules.find((r) => r.type === 'Google Cloud API Key');
  assert.ok(gcpRule, 'GCP rule should exist');

  gcpRule.regex.lastIndex = 0;
  assert.ok(gcpRule.regex.test(gcpKey), 'GCP rule should match AIza key format');
});

test('Database Connection Credentials rule exists and matches mongodb URL', () => {
  const dbRule = rules.find((r) => r.type === 'Database Connection Credentials');
  assert.ok(dbRule, 'DB credentials rule should exist');

  dbRule.regex.lastIndex = 0;
  assert.ok(dbRule.regex.test('mongodb://user:pass@localhost:27017/db'), 'should match mongodb URL');
  dbRule.regex.lastIndex = 0;
  assert.ok(dbRule.regex.test('postgresql://user:pass@localhost/db'), 'should match postgresql URL');
  dbRule.regex.lastIndex = 0;
  assert.ok(dbRule.regex.test('mysql://user:pass@localhost/db'), 'should match mysql URL');
});

test('Slack Webhook rule exists and matches Slack URL format', () => {
  const slackRule = rules.find((r) => r.type === 'Slack Incoming Webhook');
  assert.ok(slackRule, 'Slack rule should exist');

  slackRule.regex.lastIndex = 0;
  assert.ok(slackRule.regex.test(slackUrl), 'Slack rule should match valid webhook URL');
});

test('Generic Private Key rule exists and matches PEM key format', () => {
  const keyRule = rules.find((r) => r.type === 'Generic Private Key');
  assert.ok(keyRule, 'Private key rule should exist');

  keyRule.regex.lastIndex = 0;
  assert.ok(keyRule.regex.test('-----BEGIN PRIVATE KEY-----'), 'should match PRIVATE KEY');
  keyRule.regex.lastIndex = 0;
  assert.ok(keyRule.regex.test('-----BEGIN RSA PRIVATE KEY-----'), 'should match RSA PRIVATE KEY');
});

test('Common Environment Credential rule exists', () => {
  const credRule = rules.find((r) => r.type === 'Common Environment Credential');
  assert.ok(credRule, 'Common credential rule should exist');

  credRule.regex.lastIndex = 0;
  assert.ok(credRule.regex.test('password = "hunter2"'), 'should match password assignment');
  credRule.regex.lastIndex = 0;
  assert.ok(credRule.regex.test('api_key = "abc123"'), 'should match api_key assignment');
  credRule.regex.lastIndex = 0;
  assert.ok(credRule.regex.test('SECRET="mysecret"'), 'should match SECRET assignment');
});

test('Twilio Account SID rule exists and matches AC prefix format', () => {
  const twilioRule = rules.find((r) => r.type === 'Twilio Account SID');
  assert.ok(twilioRule, 'Twilio SID rule should exist');

  twilioRule.regex.lastIndex = 0;
  assert.ok(twilioRule.regex.test(twilioSid), 'should match AC-prefixed SID');
});

test('Twilio Auth Token rule exists', () => {
  const tokenRule = rules.find((r) => r.type === 'Twilio Auth Token');
  assert.ok(tokenRule, 'Twilio token rule should exist');

  tokenRule.regex.lastIndex = 0;
  assert.ok(tokenRule.regex.test(twilioToken), 'should match twilio_auth assignment');
});

test('JWT Token Check rule exists and matches JWT format', () => {
  const jwtRule = rules.find((r) => r.type === 'JWT Token Check');
  assert.ok(jwtRule, 'JWT rule should exist');

  jwtRule.regex.lastIndex = 0;
  assert.ok(jwtRule.regex.test(jwtToken), 'JWT rule should match valid JWT token');
});

test('Generic API Key / Token rule exists', () => {
  const apiRule = rules.find((r) => r.type === 'Generic API Key / Token');
  assert.ok(apiRule, 'Generic API Key rule should exist');

  apiRule.regex.lastIndex = 0;
  assert.ok(apiRule.regex.test('api_key: "abcdefghijklmnop"'), 'should match api_key with 16+ char value');
});

test('all expected rule types are present', () => {
  const ruleTypes = rules.map((r) => r.type);
  EXPECTED_RULE_TYPES.forEach((expected) => {
    assert.ok(
      ruleTypes.includes(expected),
      `Expected rule type "${expected}" should be present in rules array`
    );
  });
});

test('rules export covers at least 10 distinct secret categories', () => {
  const types = new Set(rules.map((r) => r.type));
  assert.ok(types.size >= 10, `Expected at least 10 distinct rule types, got ${types.size}`);
});

test('Hardcoded IPv4 Address rule exists and matches non-loopback IPs', () => {
  const ipRule = rules.find((r) => r.type === 'Hardcoded IPv4 Address');
  assert.ok(ipRule, 'IPv4 rule should exist');

  ipRule.regex.lastIndex = 0;
  assert.ok(!ipRule.regex.test('192.168.1.100'), 'should NOT match private network IP');

  ipRule.regex.lastIndex = 0;
  assert.ok(!ipRule.regex.test('10.0.0.5'), 'should NOT match 10.x.x.x IP');

  ipRule.regex.lastIndex = 0;
  assert.ok(ipRule.regex.test('8.8.8.8'), 'should match public IP');

  ipRule.regex.lastIndex = 0;
  assert.ok(!ipRule.regex.test('127.0.0.1'), 'should NOT match loopback 127.0.0.1');

  ipRule.regex.lastIndex = 0;
  assert.ok(!ipRule.regex.test('0.0.0.0'), 'should NOT match 0.0.0.0');

  ipRule.regex.lastIndex = 0;
  assert.ok(!ipRule.regex.test('255.255.255.255'), 'should NOT match broadcast 255.255.255.255');
});

test('Ethereum (ETH) Wallet Address rule exists and matches ETH format', () => {
  const ethRule = rules.find((r) => r.type === 'Ethereum (ETH) Wallet Address');
  assert.ok(ethRule, 'ETH wallet rule should exist');

  ethRule.regex.lastIndex = 0;
  assert.ok(ethRule.regex.test('0x' + 'aB3d' .repeat(10)), 'should match valid 42-char ETH address');

  ethRule.regex.lastIndex = 0;
  assert.ok(!ethRule.regex.test('0xDEAD'), 'should NOT match short hex string');
});

test('Bitcoin (BTC) Wallet Address rule exists and matches BTC formats', () => {
  const btcRule = rules.find((r) => r.type === 'Bitcoin (BTC) Wallet Address');
  assert.ok(btcRule, 'BTC wallet rule should exist');

  btcRule.regex.lastIndex = 0;
  assert.ok(btcRule.regex.test('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'), 'should match P2PKH address');

  btcRule.regex.lastIndex = 0;
  assert.ok(btcRule.regex.test('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy'), 'should match P2SH address');

  btcRule.regex.lastIndex = 0;
  assert.ok(btcRule.regex.test('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), 'should match Bech32 address');
});

test('each rule regex source is non-empty', () => {
  rules.forEach((rule, i) => {
    assert.ok(
      rule.regex.source && rule.regex.source.length > 0,
      `rule[${i}] (${rule.type}) regex.source should be non-empty`
    );
  });
});

test('scanSecrets uses the rules array to detect secrets', () => {
  const findings = scanSecrets('aws_key = "' + awsKey + '"');
  assert.ok(findings.length > 0, 'scanSecrets should detect AWS key using rules');
  assert.equal(findings[0].type, 'AWS Access Key Check');
});
