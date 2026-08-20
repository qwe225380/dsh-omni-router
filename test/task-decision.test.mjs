import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPolicyFromTaskDecision,
  createTaskDecision,
} from '../src/task-decision.mjs'

test('createTaskDecision builds a unified decision object', () => {
  const d = createTaskDecision({ taskText: '修复登录超时', taskType: 'bugfix', complexity: 'plan', risk: 'high', thinkingMode: 'spec' })
  assert.equal(d.type, 'bugfix')
  assert.equal(d.complexity, 'plan')
  assert.equal(d.risk, 'high')
  assert.equal(d.executionMode, 'plan')
  assert.equal(d.reasoningEffort, 'max')
  assert.equal(d.verificationLevel, 'full')
  assert.ok(d.evidenceRequirements.length > 0)
})

test('buildPolicyFromTaskDecision mirrors the decision without reclassifying', () => {
  const d = createTaskDecision({ taskType: 'feature', complexity: 'direct', risk: 'low', thinkingMode: 'react' })
  const policy = buildPolicyFromTaskDecision(d)
  assert.equal(policy.taskType, 'feature')
  assert.equal(policy.complexity, 'direct')
  assert.equal(policy.executionMode, 'direct')
  assert.equal(policy.approvalRequired, false)
  assert.ok(Array.isArray(policy.verification))
})
