import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decideRecovery,
  formatRecoveryDecision,
} from '../src/recovery-policy.mjs'

test('decideRecovery repairs test/build failures', () => {
  const decision = decideRecovery({ failure: { category: 'test_failure' }, attemptCount: 1 })
  assert.equal(decision.action, 'repair')
})

test('decideRecovery expands context when gap exists', () => {
  const decision = decideRecovery({ failure: {}, hasContextGap: true })
  assert.equal(decision.action, 'expand_context')
})

test('decideRecovery changes hypothesis after repeated same failure', () => {
  const decision = decideRecovery({ failure: { category: 'test_failure' }, sameFailureCount: 2, hasContextGap: false })
  assert.equal(decision.action, 'change_hypothesis')
})

test('decideRecovery escalates after max attempts', () => {
  const decision = decideRecovery({ attemptCount: 4, maxAttempts: 3 })
  assert.equal(decision.action, 'escalate')
})

test('decideRecovery stops when budget exhausted', () => {
  const decision = decideRecovery({ budgetRemaining: false })
  assert.equal(decision.action, 'stop')
  assert.match(formatRecoveryDecision(decision), /stop/)
})