import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyObservation,
  createRuntimeState,
  nextRuntimeAction,
  runDagLoop,
  runMissionLoop,
} from '../src/agent-runtime.mjs'
import { buildMission } from '../src/mission-planner.mjs'
import { createMissionDag } from '../src/mission-dag.mjs'

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

test('applyObservation real replan switches to nextPhase', () => {
  let state = createRuntimeState(buildMission('修复 bug', { taskType: 'bugfix' }))
  state = applyObservation(state, { type: 'test_failure' })
  assert.equal(state.phase, 'repair')
  assert.equal(state.phaseStep, 0)
})

test('applyObservation blocks after maxReplans', () => {
  let state = createRuntimeState(buildMission('修复 bug', { taskType: 'bugfix' }), { maxReplans: 1 })
  state = applyObservation(state, { type: 'test_failure' })
  assert.equal(state.replanCount, 1)
  state = applyObservation(state, { type: 'test_failure' })
  assert.equal(state.status, 'blocked')
})

test('runMissionLoop respects maxGlobalSteps', async () => {
  const state = createRuntimeState(buildMission('实现退款', { taskType: 'feature' }))
  const final = await runMissionLoop(state, {
    act: async () => ({ ok: true }),
    observe: async () => ({ type: 'step_done' }),
    maxSteps: 0,
  })
  assert.equal(final.status, 'max_steps')
})

test('runMissionLoop respects maxWallClockMs', async () => {
  const state = createRuntimeState(buildMission('实现退款', { taskType: 'feature' }), { maxWallClockMs: 5 })
  const final = await runMissionLoop(state, {
    act: async () => {
      await new Promise((r) => setTimeout(r, 10))
      return { ok: true }
    },
    observe: async () => ({ type: 'step_done' }),
    maxSteps: 100,
  })
  assert.equal(final.status, 'max_wall_clock')
})

test('runDagLoop executes ready tasks and completes the DAG', async () => {
  const dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const result = await runDagLoop(dag, {
    act: async () => ({ ok: true }),
    observe: async () => ({ type: 'step_done' }),
    maxSteps: 100,
    maxParallel: 1,
  })
  assert.equal(result.status, 'completed')
  assert.ok(result.dag.tasks.every((t) => t.status === 'done'))
})

test('runDagLoop respects maxWallClockMs', async () => {
  const dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const result = await runDagLoop(dag, {
    act: async () => {
      await new Promise((r) => setTimeout(r, 10))
      return { ok: true }
    },
    observe: async () => ({ type: 'step_done' }),
    maxSteps: 100,
    maxParallel: 1,
    maxWallClockMs: 5,
  })
  assert.equal(result.status, 'max_wall_clock')
})
