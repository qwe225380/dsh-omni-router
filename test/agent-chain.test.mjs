import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAgentChain,
  buildBuilderPrompt,
  buildQaPrompt,
  buildRepairLoop,
  buildReviewerPrompt,
  clampRepairs,
  defaultCriteria,
  formatChainReport,
  hasCriticalFindings,
  isQaPass,
  normalizeChain,
  runAgentChain,
} from '../src/agent-chain.mjs'

test('buildAgentChain full returns builder->qa->reviewer', () => {
  const plan = buildAgentChain('实现退款功能', { chain: 'full', criteria: ['refund API exists'], maxRepairs: 2 })
  assert.deepEqual(plan.stages, ['builder', 'qa-verifier', 'code-reviewer'])
  assert.equal(plan.maxRepairs, 2)
  assert.equal(plan.chain, 'full')
})

test('buildAgentChain auto shortens direct+low risk', () => {
  const plan = buildAgentChain('改一个 typo', { chain: 'auto', complexity: 'direct', risk: 'low' })
  assert.deepEqual(plan.stages, ['builder', 'qa-verifier'])
})

test('buildAgentChain auto keeps full for plan/high risk', () => {
  const plan = buildAgentChain('迁移数据库', { chain: 'auto', complexity: 'plan', risk: 'high' })
  assert.deepEqual(plan.stages, ['builder', 'qa-verifier', 'code-reviewer'])
})

test('buildAgentChain off returns builder only', () => {
  const plan = buildAgentChain('任何任务', { chain: 'off' })
  assert.deepEqual(plan.stages, ['builder'])
})

test('clampRepairs caps at 3 and defaults to 1', () => {
  assert.equal(clampRepairs(undefined), 1)
  assert.equal(clampRepairs(99), 3)
  assert.equal(clampRepairs(0), 0)
})

test('defaultCriteria matches bug/feature/refactor/other', () => {
  assert.match(defaultCriteria('修复登录 500')[0], /bug/i)
  assert.match(defaultCriteria('新增订单接口')[0], /feature/i)
  assert.match(defaultCriteria('重构支付模块')[0], /behavior/i)
  assert.ok(defaultCriteria('随便做点事').length >= 1)
})

test('builder prompt includes task, criteria, and no gold-plating rules', () => {
  const prompt = buildBuilderPrompt('实现退款', { criteria: ['refund exists'] })
  assert.match(prompt, /实现退款/)
  assert.match(prompt, /refund exists/)
  assert.match(prompt, /Smallest change/)
  assert.match(prompt, /Do not edit files outside scope/)
})

test('qa prompt is independent and forbids edits', () => {
  const prompt = buildQaPrompt('修复 bug', { criteria: ['tests pass'], builderOutput: 'done' })
  assert.match(prompt, /NO edit tools/)
  assert.match(prompt, /QA: PASS/)
  assert.match(prompt, /Builder report/)
  assert.match(prompt, /Do not modify any files/)
})

test('repair prompt follows root-cause hypothesis evidence procedure', () => {
  const prompt = buildRepairLoop('修复 bug', { criteria: ['tests pass'], qaEvidence: '2 failed', maxRepairs: 2, attempt: 1 })
  assert.match(prompt, /root cause/i)
  assert.match(prompt, /falsifiable hypothesis/i)
  assert.match(prompt, /evidence/i)
  assert.match(prompt, /Repair attempt 1 of 2/)
})

test('reviewer prompt hunts fake progress and dropped requirements', () => {
  const prompt = buildReviewerPrompt('实现功能', { criteria: ['works'], builderOutput: 'done', qaReport: 'PASS' })
  assert.match(prompt, /fake progress/)
  assert.match(prompt, /silently dropped|dropped or narrowed/i)
  assert.match(prompt, /REVIEW: PASS/)
})

test('isQaPass requires QA PASS and rejects QA FAIL', () => {
  assert.equal(isQaPass('QA: PASS\n- criterion 1: PASS'), true)
  assert.equal(isQaPass('QA: FAIL\n- criterion 1: FAIL'), false)
  assert.equal(isQaPass('ran tests'), false)
})

test('hasCriticalFindings flags critical/high unless review passes', () => {
  assert.equal(hasCriticalFindings('HIGH: missing validation'), true)
  assert.equal(hasCriticalFindings('REVIEW: PASS\nno critical findings'), false)
  assert.equal(hasCriticalFindings('REVIEW: FAIL\ncritical: dropped requirement'), true)
})

test('formatChainReport renders stages and final status', () => {
  const report = formatChainReport({
    status: 'needs_rework',
    task: '修复 bug',
    criteria: ['tests pass'],
    stages: [
      { role: 'builder', status: 'completed', output: 'changed auth.ts' },
      { role: 'qa-verifier', status: 'failed', output: 'QA: FAIL\n2 tests failing' },
    ],
  })
  assert.match(report, /needs_rework/)
  assert.match(report, /修复 bug/)
  assert.match(report, /builder \[completed\]/)
  assert.match(report, /qa-verifier \[failed\]/)
})

function fakeSubagents(outputs) {
  const calls = []
  return {
    subagents: {
      start: async (_name, request) => {
        calls.push(request.label)
        const text = outputs[request.label] || 'no output'
        return {
          id: `run-${calls.length}`,
          result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text }] }),
          dispose: async () => {},
        }
      },
    },
    calls,
  }
}

test('runAgentChain off does not spawn qa-verifier', async () => {
  const { subagents, calls } = fakeSubagents({ builder: 'BUILDER OK' })
  const outcome = await runAgentChain({ subagents, parent: {} }, { taskText: 'task', chain: 'off' })
  assert.deepEqual(calls, ['builder'])
  assert.equal(outcome.status, 'ready')
})

test('runAgentChain auto direct low risk skips code-reviewer', async () => {
  const { subagents, calls } = fakeSubagents({ builder: 'BUILDER OK', 'qa-verifier': 'QA: PASS' })
  const outcome = await runAgentChain({ subagents, parent: {} }, { taskText: 'task', chain: 'auto', complexity: 'direct', risk: 'low' })
  assert.ok(calls.includes('qa-verifier'))
  assert.ok(!calls.includes('code-reviewer'))
  assert.equal(outcome.status, 'ready')
})

test('runAgentChain full runs builder, qa, and reviewer when green', async () => {
  const { subagents, calls } = fakeSubagents({
    builder: 'BUILDER OK',
    'qa-verifier': 'QA: PASS\n- criterion 1: PASS',
    'code-reviewer': 'REVIEW: PASS\nno critical findings',
  })
  const outcome = await runAgentChain({ subagents, parent: {} }, { taskText: 'task', chain: 'full' })
  assert.deepEqual(calls, ['builder', 'qa-verifier', 'code-reviewer'])
  assert.equal(outcome.status, 'ready')
})
