import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compareArms,
  comparePair,
  summarizeBenchmark,
} from '../benchmark/omnibench-v2/matrix.mjs'
import {
  evaluateReleaseGates,
} from '../benchmark/omnibench-v2/gates.mjs'

const sample = [
  { id: 't1', arm: 'raw', run: 1, success: true, difficulty: 'hard', durationMs: 100, metrics: { cost: 1, interventions: 0 }, telemetryComplete: true, falseCompletion: false },
  { id: 't1', arm: 'omni', run: 1, success: true, difficulty: 'hard', durationMs: 200, metrics: { cost: 2, interventions: 1 }, telemetryComplete: true, falseCompletion: false },
  { id: 't2', arm: 'raw', run: 1, success: false, difficulty: 'medium', durationMs: 100, metrics: { cost: 1, interventions: 0 }, telemetryComplete: true, falseCompletion: false },
  { id: 't2', arm: 'omni', run: 1, success: true, difficulty: 'medium', durationMs: 200, metrics: { cost: 2, interventions: 1 }, telemetryComplete: true, falseCompletion: false },
]

test('summarizeBenchmark computes per-arm success rates', () => {
  const summary = summarizeBenchmark(sample)
  assert.equal(summary.raw.successRate, 0.5)
  assert.equal(summary.omni.successRate, 1)
  assert.equal(summary.raw.mediumHardRate, 0.5)
  assert.equal(summary.omni.interventionCount, 2)
})

test('compareArms computes paired uplift and cost ratio', () => {
  const pairs = compareArms(sample)
  assert.equal(pairs.length, 2)
  assert.ok(pairs.every((p) => p.uplift >= 0))
  assert.equal(pairs[0].costRatio, 2)
})

test('compareArms excludes unverified (success=null) pairs', () => {
  const withNull = [
    { id: 't1', arm: 'raw', run: 1, success: true, difficulty: 'hard', metrics: {} },
    { id: 't1', arm: 'omni', run: 1, success: null, difficulty: 'hard', metrics: {} },
    { id: 't2', arm: 'raw', run: 1, success: true, difficulty: 'hard', metrics: {} },
    { id: 't2', arm: 'omni', run: 1, success: true, difficulty: 'hard', metrics: {} },
  ]
  const pairs = compareArms(withNull)
  assert.equal(pairs.length, 1)
  assert.equal(pairs[0].id, 't2')
})

test('evaluateReleaseGates returns ready false with insufficient data', () => {
  const report = evaluateReleaseGates(sample)
  assert.equal(report.ready, false)
  assert.ok(report.gates.some((g) => g.name === 'Every task has >= 3 paired runs' && g.pass === false))
})

test('evaluateReleaseGates fails tasks with no paired runs', () => {
  const withMissing = [
    ...sample,
    { id: 't3', arm: 'raw', run: 1, success: true, difficulty: 'hard', repo: 'r3', task: 't3', metrics: {}, telemetryComplete: true, falseCompletion: false },
  ]
  const report = evaluateReleaseGates(withMissing)
  const gate = report.gates.find((g) => g.name === 'Every task has >= 3 paired runs')
  assert.equal(gate.value, 0)
  assert.equal(gate.pass, false)
})

test('summarizeBenchmark supports multi-arm results via byArm', () => {
  const multi = [
    ...sample,
    { id: 't1', arm: 'mid', run: 1, success: true, difficulty: 'medium', repo: 'r1', task: 't1', metrics: {}, telemetryComplete: true, falseCompletion: false },
    { id: 't2', arm: 'mid', run: 1, success: true, difficulty: 'medium', repo: 'r2', task: 't2', metrics: {}, telemetryComplete: true, falseCompletion: false },
    { id: 't1', arm: 'frontier', run: 1, success: true, difficulty: 'hard', repo: 'r1', task: 't1', metrics: {}, telemetryComplete: true, falseCompletion: false },
    { id: 't2', arm: 'frontier', run: 1, success: true, difficulty: 'hard', repo: 'r2', task: 't2', metrics: {}, telemetryComplete: true, falseCompletion: false },
  ]
  const summary = summarizeBenchmark(multi)
  assert.ok(summary.byArm.mid)
  assert.ok(summary.byArm.frontier)
  assert.equal(summary.byArm.mid.successRate, 1)
})

test('comparePair supports arbitrary baseline/candidate arms', () => {
  const multi = [
    ...sample,
    { id: 't1', arm: 'mid', run: 1, success: true, difficulty: 'medium', repo: 'r1', task: 't1', metrics: {}, telemetryComplete: true, falseCompletion: false },
    { id: 't2', arm: 'mid', run: 1, success: true, difficulty: 'medium', repo: 'r2', task: 't2', metrics: {}, telemetryComplete: true, falseCompletion: false },
  ]
  const pairs = comparePair(multi, 'omni', 'mid')
  assert.equal(pairs.length, 2)
  assert.ok(pairs.every((p) => p.uplift >= 0))
})

test('evaluateReleaseGates honors baseline/candidate arms', () => {
  const multi = [
    ...sample,
    { id: 't1', arm: 'mid', run: 1, success: true, difficulty: 'medium', repo: 'r1', task: 't1', metrics: {}, telemetryComplete: true, falseCompletion: false },
    { id: 't2', arm: 'mid', run: 1, success: true, difficulty: 'medium', repo: 'r2', task: 't2', metrics: {}, telemetryComplete: true, falseCompletion: false },
  ]
  const report = evaluateReleaseGates(multi, { baselineArm: 'omni', candidateArm: 'mid' })
  assert.ok(report.pairs >= 2)
})