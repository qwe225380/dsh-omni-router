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
        { type: 'failure', reason: 'test fail' },
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