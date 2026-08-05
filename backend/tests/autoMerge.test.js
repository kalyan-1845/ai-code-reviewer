import test from 'node:test';
import assert from 'node:assert/strict';
import { isBotUser, isApprovedByHuman } from '../auto_github.js';

// Issue #3579: auto_github.js merged any PR carrying the gssoc:approved label
// as soon as "at least one approved review exists" — and the only excluded
// reviewer was the PR author. Because the review pipeline itself posts an
// APPROVE review and adds the label, the bot's own approval satisfied the
// check and the PR was squash-merged with no human reviewer in the loop.

const humanReviewer = { login: 'real-human', type: 'User' };
const botReviewer = { login: 'dependabot[bot]', type: 'Bot' };
const tokenBot = { login: 'reposage-bot', type: 'User' };

test('isBotUser flags generic bot accounts and the automation account', () => {
  assert.equal(isBotUser(botReviewer, 'reposage-bot'), true, 'type=Bot must be treated as a bot');
  assert.equal(isBotUser(tokenBot, 'reposage-bot'), true, 'the account holding the token must be treated as the bot');
  assert.equal(isBotUser(humanReviewer, 'reposage-bot'), false, 'a real user account is not a bot');
  assert.equal(isBotUser(null, 'reposage-bot'), true, 'missing user info must never count as human');
});

test('the bot\x27s own APPROVE review does not satisfy the human-approval check', () => {
  const prAuthor = 'fork-contributor';
  const reviews = [
    { state: 'APPROVED', user: tokenBot },
    { state: 'COMMENTED', user: humanReviewer },
  ];
  assert.equal(
    isApprovedByHuman(reviews, prAuthor, 'reposage-bot'),
    false,
    'an APPROVE from the automation account alone must not trigger a merge'
  );
});

test('an APPROVE from a generic bot account does not satisfy the check', () => {
  const reviews = [{ state: 'APPROVED', user: botReviewer }];
  assert.equal(isApprovedByHuman(reviews, 'fork-contributor', 'reposage-bot'), false);
});

test('the PR author\x27s own APPROVE does not satisfy the check (self-approval)', () => {
  const reviews = [{ state: 'APPROVED', user: { login: 'fork-contributor', type: 'User' } }];
  assert.equal(isApprovedByHuman(reviews, 'fork-contributor', 'reposage-bot'), false);
});

test('a real human approval satisfies the check even when the bot also approved', () => {
  const reviews = [
    { state: 'APPROVED', user: tokenBot },
    { state: 'APPROVED', user: humanReviewer },
  ];
  assert.equal(isApprovedByHuman(reviews, 'fork-contributor', 'reposage-bot'), true);
});

test('non-approved review states never satisfy the check', () => {
  const reviews = [
    { state: 'CHANGES_REQUESTED', user: humanReviewer },
    { state: 'COMMENTED', user: humanReviewer },
  ];
  assert.equal(isApprovedByHuman(reviews, 'fork-contributor', 'reposage-bot'), false);
  assert.equal(isApprovedByHuman([], 'fork-contributor', 'reposage-bot'), false);
  assert.equal(isApprovedByHuman(null, 'fork-contributor', 'reposage-bot'), false);
});
