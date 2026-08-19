import test from 'node:test'
import assert from 'node:assert/strict'

import {
  acceptanceChecklistHint,
  buildContextSummary,
  classifyComplexity,
  classifyTaskType,
  classifyThinkingMode,
  deliveryGateHint,
  discoverRelevantFiles,
  estimateRisk,
  filterReadOnlyTools,
  gitWorkflowHint,
  heuristicComplexity,
  lightVerificationHint,
  needsLLMClassification,
  normalizeParameters,
  parseLLMClassification,
  planTemplateForType,
  readStateFromEvents,
  rerouteDecision,
  selectKeyFilesForTask,
  shouldEnterPlanMode,
  tddHintForType,
  thinkingModeHint,
} from '../src/omni-router.mjs'

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
    taskType: null,
    thinkingMode: null,
    riskLevel: null,
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

test('classifyTaskType recognizes common coding task types', () => {
  assert.equal(classifyTaskType('修复登录接口返回 500 的问题'), 'bugfix')
  assert.equal(classifyTaskType('帮我新做一个用户注册功能'), 'feature')
  assert.equal(classifyTaskType('重构一下订单模块的代码结构'), 'refactor')
  assert.equal(classifyTaskType('给这个函数补单元测试'), 'test')
  assert.equal(classifyTaskType('帮我 review 一下这个 PR'), 'review')
  assert.equal(classifyTaskType('今天天气怎么样'), 'other')
})

test('buildContextSummary lists root entries and key file contents', () => {
  const entries = [
    { name: 'src', type: 'directory' },
    { name: 'package.json', type: 'file' },
    { name: 'README.md', type: 'file' },
  ]
  const files = {
    'package.json': '{"name":"demo","scripts":{"test":"vitest"}}',
    'README.md': '# Demo project',
  }
  const summary = buildContextSummary(entries, files)
  assert.match(summary, /src/)
  assert.match(summary, /package\.json/)
  assert.match(summary, /README\.md/)
  assert.match(summary, /"name":"demo"/)
})

test('planTemplateForType returns code-specific plan sections', () => {
  const plan = planTemplateForType('bugfix')
  assert.match(plan, /Goal/)
  assert.match(plan, /Scope/)
  assert.match(plan, /Involved files/)
  assert.match(plan, /Test plan/)
  assert.match(plan, /Rollback/)
})

test('tddHintForType gives TDD guidance for coding tasks', () => {
  for (const type of ['bugfix', 'feature', 'refactor', 'test']) {
    const hint = tddHintForType(type)
    assert.match(hint, /TDD|failing test|red-green/i)
  }
  assert.doesNotMatch(tddHintForType('review'), /red-green/i)
})

test('deliveryGateHint asks for doublecheck before declaring done', () => {
  const hint = deliveryGateHint('feature')
  assert.match(hint, /doublecheck|delivery gate|quality gate/i)
  assert.match(hint, /rework|verify/i)
})

test('lightVerificationHint requires a lightweight check for direct tasks', () => {
  const hint = lightVerificationHint()
  assert.match(hint, /test|syntax|check/i)
  assert.match(hint, /before declaring done/i)
})

test('gitWorkflowHint gives branch/commit/diff guidance for coding tasks', () => {
  const hint = gitWorkflowHint('feature')
  assert.match(hint, /branch|worktree/i)
  assert.match(hint, /commit/i)
  assert.match(hint, /diff|review/i)
})

test('needsLLMClassification only for uncertain tasks when enabled', () => {
  const config = { useLLMClassification: true }
  assert.equal(needsLLMClassification('帮我改一下登录逻辑', config), true)
  assert.equal(needsLLMClassification('修复登录接口 500', config), false)
  assert.equal(needsLLMClassification('今天天气怎么样', { useLLMClassification: false }), false)
})

test('classifyThinkingMode recognizes spec/react/balanced', () => {
  assert.equal(classifyThinkingMode('帮我设计一个登录功能'), 'spec')
  assert.equal(classifyThinkingMode('直接帮我改这个变量名'), 'react')
  assert.equal(classifyThinkingMode('帮我处理一下这个任务'), 'balanced')
})

test('thinkingModeHint gives mode-specific guidance', () => {
  assert.match(thinkingModeHint('spec'), /spec|deep|plan|think/i)
  assert.match(thinkingModeHint('react'), /react|direct|do|execute/i)
  assert.match(thinkingModeHint('balanced'), /balanced|auto/i)
})

test('selectKeyFilesForTask prioritizes relevant files', () => {
  const entries = [
    { name: 'package.json', type: 'file' },
    { name: 'README.md', type: 'file' },
    { name: 'src', type: 'directory' },
    { name: 'tests', type: 'directory' },
  ]
  const files = selectKeyFilesForTask('test', entries)
  assert.ok(files.includes('package.json'))
  assert.ok(files.includes('README.md'))
})

test('buildContextSummary respects a max total length', () => {
  const entries = [{ name: 'package.json', type: 'file' }]
  const files = { 'package.json': 'x'.repeat(2000) }
  const summary = buildContextSummary(entries, files, { maxTotalChars: 500 })
  assert.ok(summary.length <= 500)
})

test('acceptanceChecklistHint tells model to create todo from acceptance criteria', () => {
  const hint = acceptanceChecklistHint()
  assert.match(hint, /acceptance|验收/i)
  assert.match(hint, /todo|checklist|清单/i)
})

test('heuristicComplexity returns value plus confidence', () => {
  const explicit = heuristicComplexity('直接做：设计一个登录功能', baseConfig)
  assert.equal(explicit.value, 'direct')
  assert.ok(explicit.confidence >= 0.9)

  const plan = heuristicComplexity('帮我设计一个登录功能', baseConfig)
  assert.equal(plan.value, 'plan')
  assert.ok(plan.confidence >= 0.8)

  const ambiguous = heuristicComplexity('帮我处理一下这个任务', baseConfig)
  assert.equal(ambiguous.value, 'direct')
  assert.ok(ambiguous.confidence < 0.8)
})

test('needsLLMClassification uses confidence threshold', () => {
  const config = { useLLMClassification: true, llmConfidenceThreshold: 0.7 }
  assert.equal(needsLLMClassification('直接做：设计一个登录功能', config), false)
  assert.equal(needsLLMClassification('帮我处理一下这个任务', config), true)
  assert.equal(needsLLMClassification('帮我处理一下这个任务', { useLLMClassification: false }), false)
})

test('parseLLMClassification parses structured router output', () => {
  const parsed = parseLLMClassification('{"task_type":"refactor","complexity":"plan","thinking_mode":"spec","confidence":0.91,"reasons":["multiple modules"]}')
  assert.equal(parsed.taskType, 'refactor')
  assert.equal(parsed.complexity, 'plan')
  assert.equal(parsed.thinkingMode, 'spec')
  assert.equal(parsed.confidence, 0.91)
  assert.deepEqual(parsed.reasons, ['multiple modules'])
})

test('parseLLMClassification returns null for invalid output', () => {
  assert.equal(parseLLMClassification('not json'), null)
})

test('estimateRisk flags high-risk operations', () => {
  const low = estimateRisk('修改 README 的 typo')
  assert.equal(low.level, 'low')

  const high = estimateRisk('修改数据库 schema，删除一个字段')
  assert.ok(['high', 'critical'].includes(high.level))

  const critical = estimateRisk('修改生产环境配置')
  assert.equal(critical.level, 'critical')
})

test('rerouteDecision upgrades direct to plan on high blast radius', () => {
  assert.equal(rerouteDecision('direct', { blastRadius: 0.9 }), 'plan')
  assert.equal(rerouteDecision('plan', { blastRadius: 0.1 }), 'direct')
  assert.equal(rerouteDecision('direct', { blastRadius: 0.3 }), null)
})

test('discoverRelevantFiles finds task-related files by keyword', () => {
  const entries = [
    { name: 'src', type: 'directory' },
    { name: 'auth', type: 'directory' },
    { name: 'README.md', type: 'file' },
    { name: 'order.ts', type: 'file' },
  ]
  const files = discoverRelevantFiles(entries, '修复登录超时')
  assert.ok(files.includes('auth'))
  assert.ok(files.includes('README.md'))
})
