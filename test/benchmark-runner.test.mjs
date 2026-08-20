import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compareArms,
  formatComparison,
  normalizeRun,
  scoreRun,
} from '../src/benchmark-runner.mjs'

test('normalizeRun fills default metrics', () => {
  const run = normalizeRun({ id: 'real-001', arm: 'raw', task: 'fix', success: true })
  assert.equal(run.id, 'real-001')
  assert.equal(run.firstPass, 1)
  assert.equal(run.regressionRate, 0)
  assert.equal(run.cost, 0)
})

test('scoreRun attaches OES', () => {
  const scored = scoreRun({ id: 'a', arm: 'omni', success: true, firstPass: 1, finalPass: 1 })
  assert.ok(scored.oes.score > 0)
})

test('compareArms builds rows and summary', () => {
  const raw = [
    { id: 't1', arm: 'raw', task: 'fix', success: false, toolCalls: 50, cost: 1 },
  ]
  const omni = [
    { id: 't1', arm: 'omni', task: 'fix', success: true, toolCalls: 30, cost: 0.5 },
  ]
  const comparison = compareArms(raw, omni)
  assert.equal(comparison.rows.length, 1)
  assert.equal(comparison.omni.count, 1)
  assert.ok(comparison.omni.avgOes > comparison.raw.avgOes)
})

test('formatComparison renders both arms', () => {
  const raw = [{ id: 't1', arm: 'raw', task: 'fix', success: true }]
  const omni = [{ id: 't1', arm: 'omni', task: 'fix', success: true }]
  const text = formatComparison(compareArms(raw, omni))
  assert.match(text, /raw Flash/)
  assert.match(text, /Omni/)
  assert.match(text, /t1/)
})
