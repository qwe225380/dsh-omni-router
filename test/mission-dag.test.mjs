import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addTask,
  applyObservationToDag,
  bindCapabilitiesToDag,
  createMissionDag,
  createTask,
  formatMissionDag,
  getReadyTasks,
  insertAfter,
  markTaskDone,
  scheduleParallel,
} from '../src/mission-dag.mjs'
import { buildMission } from '../src/mission-planner.mjs'
import { createCapabilityBrain, registerCapability } from '../src/capability-brain.mjs'

test('createMissionDag builds sequential tasks from mission phases', () => {
  const dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  assert.ok(dag.tasks.length >= 5)
  assert.equal(dag.tasks[0].id, 'T1')
  assert.equal(dag.tasks[0].status, 'pending')
  assert.deepEqual(dag.tasks[1].dependencies, ['T1'])
})

test('getReadyTasks returns only tasks whose dependencies are done', () => {
  let dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const ready = getReadyTasks(dag)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].id, 'T1')
  dag = markTaskDone(dag, 'T1')
  const next = getReadyTasks(dag)
  assert.equal(next[0].id, 'T2')
})

test('insertAfter inserts a task into the DAG', () => {
  let dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const task = createTask({ id: 'X', goal: 'extra' })
  dag = insertAfter(dag, 'T1', task)
  const idx = dag.tasks.findIndex((t) => t.id === 'X')
  assert.equal(dag.tasks[idx - 1].id, 'T1')
})

test('applyObservationToDag adds a repair task on test failure', () => {
  let dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  dag = applyObservationToDag(dag, { type: 'test_failure' }, 'T1')
  assert.ok(dag.tasks.some((t) => /repair/i.test(t.goal)))
  assert.equal(dag.tasks.find((t) => t.id === 'T1').status, 'failed')
  assert.ok(dag.tasks.some((t) => /^T1-a/.test(t.id) && t.dependencies.some((d) => /^R-/.test(d))))
})

test('scheduleParallel returns batches of ready tasks', () => {
  let dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const batches = scheduleParallel(dag, 2)
  assert.ok(batches.length > 0)
  assert.equal(batches[0].length, 1)
})

test('formatMissionDag renders tasks and dependencies', () => {
  const dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const text = formatMissionDag(dag)
  assert.match(text, /Mission DAG/)
  assert.match(text, /T1/)
  assert.match(text, /requires:/)
})

test('addTask appends a task', () => {
  const dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const next = addTask(dag, createTask({ id: 'Z', goal: 'z' }))
  assert.equal(next.tasks.length, dag.tasks.length + 1)
})

test('bindCapabilitiesToDag resolves required capabilities to provider ids', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'verify-tool', capabilities: ['verification'] })
  const dag = createMissionDag(buildMission('实现退款', { taskType: 'feature' }))
  const bound = bindCapabilitiesToDag(dag, brain)
  assert.ok(bound.tasks.some((t) => t.allowedTools.includes('verify-tool')))
})
