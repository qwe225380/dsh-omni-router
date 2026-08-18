import test from 'node:test'
import assert from 'node:assert/strict'

import {
  classifyComplexity,
  filterReadOnlyTools,
  normalizeParameters,
  readStateFromEvents,
  shouldEnterPlanMode,
} from './omni-router.mjs'

const baseConfig = {
  planFirstKeywords: ['设计', '架构', '重构', '方案', '需求', '系统', '优化'],
  directKeywords: ['直接做', '直接执行', '马上做'],
}

test('classifies ambiguous/design-heavy tasks as plan-first', () => {
  for (const text of [
    '帮我设计一个用户登录功能',
    '这个系统需要重构一下架构',
    '先出一个方案，再动手',
    '需求是做一个完整的订单模块，包括数据库、接口和前端',
  ]) {
    assert.equal(classifyComplexity(text, baseConfig), 'plan', text)
  }
})

test('classifies short concrete tasks as direct', () => {
  for (const text of [
    '把这个变量名改成 foo',
    '删掉第 42 行',
    '运行测试',
    '修复这个 typo',
  ]) {
    assert.equal(classifyComplexity(text, baseConfig), 'direct', text)
  }
})

test('explicit override words win over heuristics', () => {
  assert.equal(classifyComplexity('直接做：设计一个登录功能', baseConfig), 'direct')
  assert.equal(classifyComplexity('先出方案：把变量名改成 foo', baseConfig), 'plan')
})

test('shouldEnterPlanMode only gates complex tasks when confirmation is required', () => {
  assert.equal(shouldEnterPlanMode('plan', { requireConfirmation: true }), true)
  assert.equal(shouldEnterPlanMode('direct', { requireConfirmation: true }), false)
  assert.equal(shouldEnterPlanMode('plan', { requireConfirmation: false }), false)
})

test('normalizeParameters always returns an object JSON schema', () => {
  assert.deepEqual(normalizeParameters({}), { type: 'object', properties: {} })
  assert.deepEqual(normalizeParameters(undefined), { type: 'object', properties: {} })
  assert.deepEqual(
    normalizeParameters({ type: 'object', properties: { mode: { type: 'string' } } }),
    { type: 'object', properties: { mode: { type: 'string' } } },
  )
})

test('readStateFromEvents restores the latest persisted omni-router state', () => {
  const events = [
    { type: 'user/message', data: {} },
    { type: 'omni/router', data: { kind: 'plan', planRequested: true, directOverride: false } },
    { type: 'user/message', data: {} },
    { type: 'omni/router', data: { kind: 'direct', planRequested: false, directOverride: true } },
  ]
  assert.deepEqual(readStateFromEvents(events), {
    kind: 'direct',
    planRequested: false,
    directOverride: true,
  })
})

test('readStateFromEvents returns null when no omni-router state exists', () => {
  assert.equal(readStateFromEvents([{ type: 'user/message', data: {} }]), null)
})

test('filterReadOnlyTools removes mutating tools in degraded plan mode', () => {
  const tools = [
    { name: 'read' },
    { name: 'glob' },
    { name: 'write' },
    { name: 'bash' },
    { name: 'omni_status' },
  ]
  const allowed = new Set(['read', 'glob', 'ask_user_question', 'todo_write', 'omni_status', 'omni_plan', 'omni_direct'])
  assert.deepEqual(filterReadOnlyTools(tools, allowed), [
    { name: 'read' },
    { name: 'glob' },
    { name: 'omni_status' },
  ])
})
