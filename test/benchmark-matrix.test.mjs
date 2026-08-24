import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compareArms,
  summarizeBenchmark,
} from '../benchmark/omnibench-v2/matrix.mjs'
import {
  evaluateReleaseGates,
} from '../benchmark/omnibench-v2/gates.mjs'

const sample = [
  { id: 't1', arm: 'raw', run: 1, success: true, durationMs: 100, metrics: { cost: 1, interventions: 0 }, telemetryComplete: true },
  { id: 't1', arm: 'omni', run: 1, success: true, durationMs: 200, metrics: { cost: 2, interventions: 1 }, telemetryComplete: true },
  { id: 't2', arm: 'raw', run: 1, success: false, durationMs: 100, metrics: { cost: 1, interventions: 0 }, telemetryComplete: true },
  { id: 't2', arm: 'omni', run: 1, success: true, durationMs: 200, metrics: { cost: 2, interventions: 1 }, telemetryComplete: true },
]

test('summarizeBenchmark computes per-arm success rates', () => {
  const summary = summarizeBenchmark(sample)
  assert.equal(summary.raw.successRate, 0.5)
  assert.equal(summary.omni.successRate, 1)
  assert.equal(summary.omni.interventionCount, 2)
})

test('compareArms computes paired uplift and cost ratio', () => {
  const pairs = compareArms(sample)
  assert.equal(pairs.length, 2)
  assert.ok(pairs.every((p) => p.uplift >= 0))
  assert.equal(pairs[0].costRatio, 2)
})

test('evaluateReleaseGates returns ready false with insufficient data', () => {
  const report = evaluateReleaseGates(sample)
  assert.equal(report.ready, false)
  assert.ok(report.gates.some((g) => g.name === 'Paired runs >= 3' && g.pass === false))
})