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
  { id: 't1', arm: 'raw', run: 1, success: true, difficulty: 'hard', durationMs: 100, repo: 'r1', task: 't1', metrics: { cost: 1, interventions: 0 }, telemetryComplete: true, falseCompletion: false },
  { id: 't1', arm: 'omni', run: 1, success: true, difficulty: 'hard', durationMs: 200, repo: 'r1', task: 't1', metrics: { cost: 2, interventions: 1 }, telemetryComplete: true, falseCompletion: false },
  { id: 't2', arm: 'raw', run: 1, success: false, difficulty: 'medium', durationMs: 100, repo: 'r2', task: 't2', metrics: { cost: 1, interventions: 0 }, telemetryComplete: true, falseCompletion: false },
  { id: 't2', arm: 'omni', run: 1, success: true, difficulty: 'medium', durationMs: 200, repo: 'r2', task: 't2', metrics: { cost: 2, interventions: 1 }, telemetryComplete: true, falseCompletion: false },
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
  // Cohort = paired baseline∩candidate only (t1, t2); each has 1 paired run.
  assert.equal(gate.value, 1)
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

test('release gates count only the paired cohort, not other arms', () => {
  const contaminated = [
    ...sample,
    { id: 't9', arm: 'frontier', run: 1, success: true, difficulty: 'hard', repo: 'r9', task: 't9', metrics: {}, telemetryComplete: true, falseCompletion: true },
    { id: 't10', arm: 'frontier', run: 1, success: true, difficulty: 'hard', repo: 'r10', task: 't10', metrics: {}, telemetryComplete: true, falseCompletion: true },
  ]
  const report = evaluateReleaseGates(contaminated, { verbose: true })
  const reposGate = report.gates.find((g) => g.name === 'Repositories >= 50')
  const tasksGate = report.gates.find((g) => g.name === 'Tasks >= 100')
  assert.equal(reposGate.value, 2)
  assert.equal(tasksGate.value, 2)
})

test('release gates include NOOP precision / simple regression / recovery / intervention', () => {
  const report = evaluateReleaseGates(sample)
  const names = report.gates.map((g) => g.name)
  assert.ok(names.includes('NOOP precision >= 90%'))
  assert.ok(names.includes('Simple-task regression <= 2pp'))
  assert.ok(names.includes('Recovery success >= 75%'))
  assert.ok(names.includes('Human intervention reduction >= 30%'))
  const noop = report.gates.find((g) => g.name === 'NOOP precision >= 90%')
  assert.equal(noop.pass, false) // no metric data → must NOT silently pass
})

test('NOOP/recovery gates use candidate arm only and intervention handles baseline=0', () => {
  const data = [
    { id: 't1', arm: 'raw', run: 1, success: true, difficulty: 'hard', repo: 'r1', task: 't1', taskValid: true, metrics: { noopPrecision: 0.2, recoveryAttempts: 2, recoverySuccesses: 2, humanInterventions: 0 }, telemetryComplete: true, falseCompletion: false },
    { id: 't1', arm: 'omni', run: 1, success: true, difficulty: 'hard', repo: 'r1', task: 't1', taskValid: true, metrics: { noopPrecision: 0.95, recoveryAttempts: 4, recoverySuccesses: 3, humanInterventions: 0 }, telemetryComplete: true, falseCompletion: false },
  ]
  const report = evaluateReleaseGates(data)
  const noop = report.gates.find((g) => g.name === 'NOOP precision >= 90%')
  const recovery = report.gates.find((g) => g.name === 'Recovery success >= 75%')
  const intervention = report.gates.find((g) => g.name === 'Human intervention reduction >= 30%')
  assert.equal(noop.value, 0.95)   // candidate only, not (0.2+0.95)/2
  assert.equal(recovery.value, 0.75) // cohort aggregate: 3 successes / 4 attempts
  assert.equal(intervention.value, null) // baseline total = 0 → not applicable
  assert.equal(intervention.pass, false)
})

test('pair interventionReduction is null when baseline has zero interventions', () => {
  const zero = [
    { id: 'z1', arm: 'raw', run: 1, success: true, difficulty: 'easy', repo: 'r1', task: 'z1', metrics: { humanInterventions: 0 }, telemetryComplete: true, falseCompletion: false },
    { id: 'z1', arm: 'omni', run: 1, success: true, difficulty: 'easy', repo: 'r1', task: 'z1', metrics: { humanInterventions: 0 }, telemetryComplete: true, falseCompletion: false },
  ]
  const pairs = comparePair(zero, 'raw', 'omni')
  assert.equal(pairs[0].interventionReduction, null)
})

test('invalid tasks (bug absent at start) are excluded from pairs and gated', () => {
  const data = [
    { id: 'v1', arm: 'raw', run: 1, success: true, difficulty: 'hard', repo: 'r1', task: 'v1', taskValid: true, metrics: {}, telemetryComplete: true, falseCompletion: false },
    { id: 'v1', arm: 'omni', run: 1, success: null, difficulty: 'hard', repo: 'r1', task: 'v1', taskValid: false, metrics: {}, telemetryComplete: true, falseCompletion: false },
  ]
  const pairs = comparePair(data, 'raw', 'omni')
  assert.equal(pairs.length, 0)
  const report = evaluateReleaseGates(data)
  const validity = report.gates.find((g) => g.name === 'Task validity = 100%')
  // Pre-pair planned runs: raw=true, omni=false → 1/2 = 0.5
  assert.equal(validity.value, 0.5)
  assert.equal(validity.pass, false)
})

test('mixed 99 valid + 1 invalid task still fails the validity gate', () => {
  const data = []
  for (let i = 1; i <= 99; i += 1) {
    data.push({ id: `v${i}`, arm: 'raw', run: 1, success: true, difficulty: 'hard', repo: `r${i}`, task: `v${i}`, taskValid: true, metrics: {}, telemetryComplete: true, falseCompletion: false })
    data.push({ id: `v${i}`, arm: 'omni', run: 1, success: true, difficulty: 'hard', repo: `r${i}`, task: `v${i}`, taskValid: true, metrics: {}, telemetryComplete: true, falseCompletion: false })
  }
  data.push({ id: 'bad', arm: 'raw', run: 1, success: true, difficulty: 'hard', repo: 'bad', task: 'bad', taskValid: true, metrics: {}, telemetryComplete: true, falseCompletion: false })
  data.push({ id: 'bad', arm: 'omni', run: 1, success: null, difficulty: 'hard', repo: 'bad', task: 'bad', taskValid: false, metrics: {}, telemetryComplete: true, falseCompletion: false })
  const report = evaluateReleaseGates(data)
  const validity = report.gates.find((g) => g.name === 'Task validity = 100%')
  assert.equal(validity.value, 199 / 200)
  assert.equal(validity.pass, false)
})

test('recoveryAttempts=0 is data (coverage passes; rate not in denominator)', () => {
  const data = [
    { id: 's1', arm: 'raw', run: 1, success: true, difficulty: 'easy', repo: 'r1', task: 's1', taskValid: true, metrics: { noopPrecision: 0.9, recoveryAttempts: 0, recoverySuccesses: 0, humanInterventions: 0 }, telemetryComplete: true, falseCompletion: false },
    { id: 's1', arm: 'omni', run: 1, success: true, difficulty: 'easy', repo: 'r1', task: 's1', taskValid: true, metrics: { noopPrecision: 0.95, recoveryAttempts: 0, recoverySuccesses: 0, humanInterventions: 0 }, telemetryComplete: true, falseCompletion: false },
  ]
  const report = evaluateReleaseGates(data)
  const coverage = report.gates.find((g) => g.name === 'KPI telemetry coverage = 100%')
  const recovery = report.gates.find((g) => g.name === 'Recovery success >= 75%')
  assert.equal(coverage.value, 1)   // attempts=0 is data, coverage passes
  assert.equal(recovery.value, null) // no attempts → N/A, gate fails
  assert.equal(recovery.pass, false)
})

test('baseline humanInterventions missing fails KPI coverage', () => {
  const data = [
    { id: 'h1', arm: 'raw', run: 1, success: true, difficulty: 'easy', repo: 'r1', task: 'h1', taskValid: true, metrics: { noopPrecision: 0.9, recoveryAttempts: 0, recoverySuccesses: 0 }, telemetryComplete: true, falseCompletion: false },
    { id: 'h1', arm: 'omni', run: 1, success: true, difficulty: 'easy', repo: 'r1', task: 'h1', taskValid: true, metrics: { noopPrecision: 0.95, recoveryAttempts: 0, recoverySuccesses: 0, humanInterventions: 0 }, telemetryComplete: true, falseCompletion: false },
  ]
  const report = evaluateReleaseGates(data)
  const coverage = report.gates.find((g) => g.name === 'KPI telemetry coverage = 100%')
  assert.equal(coverage.value, 0) // baseline humanInterventions missing
  assert.equal(coverage.pass, false)
})