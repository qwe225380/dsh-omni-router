import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyObservation,
  createRuntimeState,
  nextRuntimeAction,
  runMissionLoop,
} from '../src/agent-runtime.mjs'
import { buildMission } from '../src/mission-planner.mjs'

test('createRuntimeState starts at first phase', () => {
  const state = createRuntimeState(buildMission('实现退款', { taskType: 'feature' }))
  assert.equal(state.phase, 'understand')
  assert.equal(state.status, 'active')
})

test('nextRuntimeAction returns a concrete task for the current phase', () => {
  const state = createRuntimeState(buildMission('实现退款', { taskType: 'feature' }))
  const action = nextRuntimeAction(state)
  assert.equal(action.phase, 'understand')
  assert.ok(action.task.length > 0)
})

test('applyObservation advances steps and phases', () => {
  let state = createRuntimeState(buildMission('实现退款', { taskType: 'feature' }))
  state = applyObservation(state, { type: 'step_done' })
  state = applyObservation(state, { type: 'step_done' })
  state = applyObservation(state, { type: 'step_done' })
  assert.equal(state.phase, 'design')
})

test('applyObservation triggers replan on failure', () => {
  let state = createRuntimeState(buildMission('修复 bug', { taskType: 'bugfix' }))
  state = applyObservation(state, { type: 'test_failure' })
  assert.equal(state.replanCount, 1)
  assert.ok(state.observations.some((o) => o.reason))
})

test('runMissionLoop completes a mission with fake act/observe', async () => {
  const mission = buildMission('实现退款', { taskType: 'feature' })
  const state = createRuntimeState(mission)
  const final = await runMissionLoop(state, {
    act: async () => ({ ok: true }),
    observe: async () => ({ type: 'step_done' }),
    maxSteps: 100,
  })
  assert.equal(final.status, 'completed')
  assert.ok(final.actions.length > 0)
})
