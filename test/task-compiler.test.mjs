import test from 'node:test'
import assert from 'node:assert/strict'

import { compileTask, compileTaskWithLLM } from '../src/task-compiler.mjs'

test('compileTask builds a structured engineering brief', () => {
  const brief = compileTask('修复登录接口偶发 500，不要破坏现有支付')
  assert.equal(brief.taskType, 'bugfix')
  assert.match(brief.objective, /Fix the reported issue/)
  assert.ok(brief.constraints.some((c) => /preserve existing behavior/i.test(c)))
  assert.ok(brief.acceptanceCriteria.length >= 3)
  assert.ok(brief.hiddenAssumptions.length >= 1)
  assert.ok(brief.expectedArtifacts.includes('regression test'))
})

test('compileTask infers feature artifacts and invariants', () => {
  const brief = compileTask('新增一个带幂等性的退款接口')
  assert.equal(brief.taskType, 'feature')
  assert.ok(brief.requiredInvariants.some((i) => /money|order|payment/i.test(i)))
  assert.ok(brief.expectedArtifacts.includes('implementation'))
})

test('compileTaskWithLLM falls back to heuristic when no LLM', async () => {
  const brief = await compileTaskWithLLM('修复登录 500', {})
  assert.equal(brief.taskType, 'bugfix')
})
