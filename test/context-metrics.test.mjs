import test from 'node:test'
import assert from 'node:assert/strict'

import {
  contextMetrics,
  contextPrecision,
  formatContextMetrics,
  recallAtK,
} from '../src/context-metrics.mjs'

test('recallAtK and precision compute correctly', () => {
  const selected = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts']
  const relevant = ['a.ts', 'b.ts', 'z.ts']
  assert.equal(recallAtK(selected, relevant, 2), 2 / 3)
  assert.equal(recallAtK(selected, relevant), 2 / 3)
  assert.equal(contextPrecision(selected, relevant), 2 / 5)
})

test('contextMetrics reports recall, precision, tokens, and missed', () => {
  const metrics = contextMetrics({
    selected: ['session.ts', 'middleware.ts', 'unrelated.ts'],
    relevant: ['session.ts', 'middleware.ts', 'reconnect.ts'],
    tokens: 1000,
    irrelevantTokens: 400,
  })
  assert.equal(metrics.recallAt5, 2 / 3)
  assert.equal(metrics.precision, 2 / 3)
  assert.deepEqual(metrics.missed, ['reconnect.ts'])
  assert.equal(metrics.irrelevantTokenRatio, 0.4)
  assert.match(formatContextMetrics(metrics), /Context metrics/)
})