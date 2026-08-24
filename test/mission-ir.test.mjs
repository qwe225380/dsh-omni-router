import test from 'node:test'
import assert from 'node:assert/strict'

import {
  compileMissionToHost,
  toMissionIR,
} from '../src/mission-ir.mjs'

test('toMissionIR converts DAG tasks to host-neutral IR', () => {
  const ir = toMissionIR({
    mission: { task: 'Fix bug' },
    tasks: [
      { id: 'T1', goal: 'Reproduce', dependencies: [], requiredCapabilities: ['debugging'], role: 'scout' },
      { id: 'T2', goal: 'Verify', dependencies: ['T1'], verification: ['run tests'], risk: 'high' },
    ],
  })
  assert.equal(ir.objective, 'Fix bug')
  assert.equal(ir.tasks[0].role, 'scout')
  assert.equal(ir.tasks[1].evidenceRequirements[0], 'run tests')
  assert.equal(ir.tasks[1].risk, 'high')
})

test('compileMissionToHost uses host compileMission when available', () => {
  const host = { compileMission: (ir) => ({ steps: ir.tasks.map((t) => t.id) }) }
  const plan = compileMissionToHost({ tasks: [{ id: 'T1' }] }, host)
  assert.deepEqual(plan.steps, ['T1'])
  assert.equal(plan.degraded, false)
})

test('compileMissionToHost degrades gracefully without adapter', () => {
  const plan = compileMissionToHost({ tasks: [] }, {})
  assert.equal(plan.degraded, true)
})