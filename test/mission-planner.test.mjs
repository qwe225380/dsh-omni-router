import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMission,
  buildPhaseTasks,
  decideReplan,
  formatMissionPlan,
  missionPhasesForType,
} from '../src/mission-planner.mjs'

test('missionPhasesForType returns base phases for feature/other', () => {
  const phases = missionPhasesForType('feature')
  assert.deepEqual(phases.map((p) => p.id), ['understand', 'design', 'implement', 'validate', 'deliver'])
})

test('missionPhasesForType uses bugfix-specific phases', () => {
  const phases = missionPhasesForType('bugfix')
  assert.deepEqual(phases.map((p) => p.id), ['understand', 'diagnose', 'fix', 'verify', 'deliver'])
})

test('missionPhasesForType uses refactor-specific phases', () => {
  const phases = missionPhasesForType('refactor')
  assert.deepEqual(phases.map((p) => p.id), ['understand', 'baseline', 'refactor', 'validate', 'deliver'])
})

test('buildMission creates a mission with phases and replan count', () => {
  const mission = buildMission('实现退款功能', { taskType: 'feature' })
  assert.equal(mission.mission, '实现退款功能')
  assert.equal(mission.taskType, 'feature')
  assert.equal(mission.phases.length, 5)
  assert.equal(mission.replanCount, 0)
})

test('buildPhaseTasks returns concrete tasks for known phases', () => {
  const tasks = buildPhaseTasks('implement')
  assert.ok(tasks.length >= 3)
  assert.ok(tasks.some((t) => /verify|验证/i.test(t)))
})

test('decideReplan handles verification failures and new information', () => {
  assert.equal(decideReplan({ phase: 'implement' }, { type: 'test_failure' }).nextPhase, 'repair')
  assert.equal(decideReplan({ phase: 'implement' }, { type: 'missing_dependency' }).nextPhase, 'implement')
  assert.equal(decideReplan({ phase: 'implement' }, { type: 'scope_change' }).nextPhase, 'design')
  assert.equal(decideReplan({ phase: 'implement' }, { type: 'success' }).replan, false)
})

test('formatMissionPlan renders mission, task type, phases, and tasks', () => {
  const mission = buildMission('重构订单模块', { taskType: 'refactor' })
  const text = formatMissionPlan(mission)
  assert.match(text, /Mission: 重构订单模块/)
  assert.match(text, /Task type: refactor/)
  assert.match(text, /understand/)
  assert.match(text, /baseline/)
  assert.match(text, /refactor/)
  assert.match(text, /test safety net/i)
})
