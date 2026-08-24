import test from 'node:test'
import assert from 'node:assert/strict'

import {
  nextStrategy,
  shouldShiftStrategy,
} from '../src/strategy-shift.mjs'

test('shouldShiftStrategy returns false for single or different failures', () => {
  assert.equal(shouldShiftStrategy([]), false)
  assert.equal(shouldShiftStrategy([{ category: 'test_failure', reason: 'a' }]), false)
  assert.equal(shouldShiftStrategy([
    { category: 'test_failure', reason: 'a' },
    { category: 'build_failure', reason: 'b' },
  ]), false)
})

test('shouldShiftStrategy returns true when same category and reason repeat', () => {
  assert.equal(shouldShiftStrategy([
    { category: 'test_failure', reason: 'same', hypothesis: 'h' },
    { category: 'test_failure', reason: 'same', hypothesis: 'h' },
  ]), true)
})

test('nextStrategy returns a recovery suggestion', () => {
  const strategy = nextStrategy([{ category: 'test_failure' }])
  assert.match(strategy, /Re-investigate/)
})