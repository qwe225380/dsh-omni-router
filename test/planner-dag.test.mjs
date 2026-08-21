import test from 'node:test'
import assert from 'node:assert/strict'

import { compileDagToPlan, generateMissionDag } from '../src/planner-dag.mjs'
import { buildMission } from '../src/mission-planner.mjs'
import { getReadyTasks, markTaskDone } from '../src/mission-dag.mjs'

test('generateMissionDag creates parallel branches for feature tasks', () => {
  const dag = generateMissionDag(buildMission('实现用户通知页', { taskType: 'feature' }))
  const ids = dag.tasks.map((t) => t.id)
  assert.ok(ids.includes('T2a'))
  assert.ok(ids.includes('T2b'))
  const t2a = dag.tasks.find((t) => t.id === 'T2a')
  const t2b = dag.tasks.find((t) => t.id === 'T2b')
  assert.deepEqual(t2a.dependencies, ['T1'])
  assert.deepEqual(t2b.dependencies, ['T1'])
})

test('feature DAG exposes multiple ready tasks after T1 completes', () => {
  let dag = generateMissionDag(buildMission('实现用户通知页', { taskType: 'feature' }))
  dag = markTaskDone(dag, 'T1')
  const ready = getReadyTasks(dag)
  assert.ok(ready.length >= 2)
})

test('bugfix DAG is a focused reproduce->fix->verify chain', () => {
  const dag = generateMissionDag(buildMission('修复登录超时', { taskType: 'bugfix' }))
  const ids = dag.tasks.map((t) => t.id)
  assert.deepEqual(ids.slice(0, 4), ['T1', 'T2', 'T3', 'T4'])
  assert.equal(dag.tasks.find((t) => t.id === 'T4').dependencies[0], 'T3')
})

test('compileDagToPlan emits ordered parallel groups', () => {
  const dag = generateMissionDag(buildMission('实现用户通知页', { taskType: 'feature' }))
  const plan = compileDagToPlan(dag)
  assert.equal(plan.groups[0][0], 'T1')
  assert.ok(plan.groups[1].includes('T2a'))
  assert.ok(plan.groups[1].includes('T2b'))
})
