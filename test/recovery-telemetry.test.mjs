import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  aggregateRecoveryTelemetry,
  formatRecoveryTelemetry,
  loadRecoveryTelemetry,
  recordMissionRecovery,
} from '../src/recovery-telemetry.mjs'

test('recordMissionRecovery only writes when failures or recovery actions exist', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-'))
  try {
    const none = recordMissionRecovery(cwd, { taskId: 't1', actions: [{ type: 'exec', action: 'run' }] })
    assert.equal(none, null)
    const file = recordMissionRecovery(cwd, {
      taskId: 't1',
      actions: [
        { type: 'failure', reason: 'test fail', observation: { category: 'test_failure', file: 'payment.test.js', detail: 'assertion A failed' } },
        { action: 'repair', attempt: 2 },
        { action: 'change_hypothesis', attempt: 3 },
      ],
      outcome: 'success',
    })
    assert.ok(fs.existsSync(file))
    const records = loadRecoveryTelemetry(cwd)
    assert.equal(records.length, 1)
    assert.equal(records[0].failureCount, 1)
    assert.equal(records[0].recoveryCount, 2)
    assert.equal(records[0].failures[0].category, 'test_failure')
    assert.match(records[0].failures[0].fingerprint, /^[0-9a-f]{12}$/)
    assert.equal(records[0].transitions[0].action, 'repair')
    assert.equal(records[0].transitions[0].outcome, 'success')
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

test('aggregateRecoveryTelemetry computes funnel and success rate', () => {
  const aggregate = aggregateRecoveryTelemetry([
    { failureCount: 1, recoveryCount: 2, actions: [{ action: 'retry' }, { action: 'repair' }], outcome: 'success' },
    { failureCount: 2, recoveryCount: 1, actions: [{ action: 'change_hypothesis' }], outcome: 'failed' },
  ])
  assert.equal(aggregate.tasksWithRecovery, 2)
  assert.equal(aggregate.recoverySuccessRate, 0.5)
  assert.equal(aggregate.funnel.repair, 1)
  assert.equal(aggregate.funnel.changeHypothesis, 1)
  assert.match(formatRecoveryTelemetry(aggregate), /Recovery telemetry/)
})

test('failureFingerprint is deterministic and aggregate counts repeats', async () => {
  const { failureFingerprint } = await import('../src/recovery-telemetry.mjs')
  const a = failureFingerprint({ category: 'test_failure', file: 'payment.test.js', message: 'assertion A' })
  const b = failureFingerprint({ category: 'test_failure', file: 'payment.test.js', message: 'assertion A' })
  const c = failureFingerprint({ category: 'test_failure', file: 'payment.test.js', message: 'assertion B' })
  assert.equal(a, b)
  assert.notEqual(a, c)
  const aggregate = aggregateRecoveryTelemetry([
    { outcome: 'success', recoveryCount: 1, actions: [{ action: 'repair' }], failures: [{ category: 'test_failure', fingerprint: a }] },
    { outcome: 'failed', recoveryCount: 1, actions: [{ action: 'change_hypothesis' }], failures: [{ category: 'test_failure', fingerprint: a }] },
  ])
  assert.equal(aggregate.repeatedFingerprintCount, 1)
  assert.equal(aggregate.repeatedFingerprintRate, 1)
})

test('recovery transitions bind each failure to its nearest action', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-nearest-'))
  try {
    recordMissionRecovery(cwd, {
      taskId: 't2',
      actions: [
        { type: 'failure', observation: { category: 'test_failure', file: 'a.test.js', detail: 'A' }, attempt: 3 },
        { action: 'retry' }, // attempt-less: must NOT win over typed nearest
        { action: 'repair', attempt: 2 },
        { action: 'change_hypothesis', attempt: 3 },
      ],
      outcome: 'failed',
    })
    const records = loadRecoveryTelemetry(cwd)
    assert.equal(records[0].transitions[0].action, 'change_hypothesis')
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})