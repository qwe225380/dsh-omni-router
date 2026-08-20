import test from 'node:test'
import assert from 'node:assert/strict'

import {
  GRADING_DIMENSIONS,
  buildJudgePrompt,
  buildRepairBudget,
  isJudgePass,
  scoreDelivery,
} from '../src/judge.mjs'

test('GRADING_DIMENSIONS covers the six fable5 dimensions', () => {
  assert.deepEqual(GRADING_DIMENSIONS, ['correctness', 'completeness', 'robustness', 'clarity', 'scope', 'honesty'])
})

test('buildJudgePrompt asks for dimension scores and JUDGE verdict', () => {
  const prompt = buildJudgePrompt('实现退款', { criteria: ['refund exists'], builderOutput: 'done', qaReport: 'QA: PASS', reviewReport: 'REVIEW: PASS' })
  assert.match(prompt, /correctness/)
  assert.match(prompt, /completeness/)
  assert.match(prompt, /honesty/)
  assert.match(prompt, /JUDGE: PASS/)
  assert.match(prompt, /JUDGE: FAIL/)
})

test('isJudgePass requires JUDGE PASS and rejects JUDGE FAIL', () => {
  assert.equal(isJudgePass('JUDGE: PASS\noverall 0.95'), true)
  assert.equal(isJudgePass('JUDGE: FAIL\noverall 0.6'), false)
  assert.equal(isJudgePass('no verdict'), false)
})

test('buildRepairBudget bounds attempts and sets escalation', () => {
  const budget = buildRepairBudget(4)
  assert.equal(budget.maxAttempts, 4)
  assert.equal(budget.escalationAfter, 2)
  assert.equal(budget.stopAfter, 4)
  assert.equal(buildRepairBudget(99).maxAttempts, 5)
})

test('scoreDelivery returns lowest-dimension verdict', () => {
  const pass = scoreDelivery({ qaPass: true, reviewPass: true, judgePass: true, hasCriticalFindings: false })
  assert.equal(pass.verdict, 'pass')
  assert.ok(pass.overall >= 0.8)

  const rework = scoreDelivery({ qaPass: false, reviewPass: false, judgePass: false, hasCriticalFindings: true })
  assert.equal(rework.verdict, 'rework')
  assert.ok(rework.overall < 0.8)
})
