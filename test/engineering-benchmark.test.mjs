import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ENGINEERING_LEVELS,
  computeOes,
  scoreTask,
  summarizeBenchmark,
} from '../src/engineering-benchmark.mjs'

test('ENGINEERING_LEVELS covers L1-L10', () => {
  assert.equal(ENGINEERING_LEVELS.length, 10)
  assert.equal(ENGINEERING_LEVELS[0], 'L1 Single-file')
  assert.equal(ENGINEERING_LEVELS[9], 'L10 Autonomous')
})

test('computeOes returns a weighted score with components', () => {
  const oes = computeOes({ success: 1, firstPass: 1, finalPass: 1, regressionRate: 0, humanInterventions: 0, toolCalls: 10, repairCount: 0, failureRecoveryRate: 1 })
  assert.ok(oes.score >= 0.9)
  assert.ok(oes.components.correctness === 1)
  assert.ok(oes.components.requirement >= 0.9)
})

test('computeOes penalizes failures and regressions', () => {
  const good = computeOes({ success: 1, firstPass: 1, finalPass: 1, regressionRate: 0, humanInterventions: 0, toolCalls: 10, repairCount: 0, failureRecoveryRate: 1 })
  const bad = computeOes({ success: 0, firstPass: 0, finalPass: 0, regressionRate: 0.5, humanInterventions: 5, toolCalls: 200, repairCount: 3, failureRecoveryRate: 0.2 })
  assert.ok(bad.score < good.score)
})

test('scoreTask annotates a result with OES', () => {
  const scored = scoreTask({ id: 'eng-001', level: 'L1 Single-file', task: 'fix', success: true })
  assert.equal(scored.id, 'eng-001')
  assert.equal(scored.success, true)
  assert.ok(scored.oes.score > 0)
})

test('computeOes penalizes false completion rate via honesty', () => {
  const honest = computeOes({ success: 1, firstPass: 1, finalPass: 1, regressionRate: 0, humanInterventions: 0, toolCalls: 10, repairCount: 0, failureRecoveryRate: 1, falseCompletionRate: 0 })
  const liar = computeOes({ success: 1, firstPass: 1, finalPass: 1, regressionRate: 0, humanInterventions: 0, toolCalls: 10, repairCount: 0, failureRecoveryRate: 1, falseCompletionRate: 0.5 })
  assert.ok(liar.score < honest.score)
  assert.equal(liar.components.honesty, 0.5)
})

test('summarizeBenchmark renders success rate and average OES', () => {
  const summary = summarizeBenchmark([
    { id: 'a', level: 'L1 Single-file', success: true },
    { id: 'b', level: 'L3 Small feature', success: false },
  ])
  assert.match(summary, /Tasks: 2/)
  assert.match(summary, /Success rate: 50%/)
  assert.match(summary, /Average OES/)
  assert.match(summary, /\[PASS\] a/)
  assert.match(summary, /\[FAIL\] b/)
})