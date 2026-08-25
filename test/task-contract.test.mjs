import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTaskContract,
  completionStatus,
  formatTaskContract,
  normalizeAcceptance,
  verifyCompletion,
} from '../src/task-contract.mjs'

test('buildTaskContract produces a single unified contract', () => {
  const contract = buildTaskContract({
    taskText: 'Fix payment race',
    decision: { complexity: 'plan', risk: 'high', type: 'bugfix' },
    acceptance: ['no double charge', 'tests pass'],
    requiredCapabilities: ['debugging', 'verification'],
  })
  assert.equal(contract.objective, 'Fix payment race')
  assert.equal(contract.intelligenceLevel, 'L3')
  assert.equal(contract.verificationPolicy.independentVerify, true)
  assert.deepEqual(contract.acceptance.map((c) => c.text), ['no double charge', 'tests pass'])
  assert.deepEqual(contract.acceptance.map((c) => c.id), ['C1', 'C2'])
  assert.ok(contract.requiredCapabilities.includes('verification'))
})

test('buildTaskContract fills default acceptance', () => {
  const contract = buildTaskContract({ taskText: 'Fix typo' })
  assert.equal(contract.acceptance.length, 1)
  assert.match(contract.acceptance[0].text, /Fix typo/)
  assert.equal(contract.acceptance[0].id, 'C1')
})

test('formatTaskContract renders readable summary', () => {
  const text = formatTaskContract(buildTaskContract({ taskText: 'x' }))
  assert.match(text, /Objective: x/)
  assert.match(text, /Intelligence: L0/)
})

test('normalizeAcceptance keeps object criteria with required trust', () => {
  const criteria = normalizeAcceptance([
    { id: 'C1', text: 'bug fixed', requiredTrust: 'T3' },
    'tests pass',
  ])
  assert.equal(criteria[0].requiredTrust, 'T3')
  assert.equal(criteria[1].id, 'C2')
})

test('verifyCompletion requires evidence per criterion with required trust', () => {
  const contract = buildTaskContract({
    taskText: 'x',
    acceptance: [{ id: 'C1', text: 'bug fixed', requiredTrust: 'T3' }, 'tests pass'],
  })
  const incomplete = verifyCompletion(contract, [
    { id: 'E1', criterionId: 'C1', trustLevel: 'T3', ok: true },
  ])
  assert.equal(incomplete.completed, false)
  assert.deepEqual(incomplete.missing, ['C2'])

  const complete = verifyCompletion(contract, [
    { id: 'E1', criterionId: 'C1', trustLevel: 'T3', ok: true },
    { id: 'E2', criterionId: 'C2', trustLevel: 'T2', ok: true },
  ])
  assert.equal(complete.completed, true)
  assert.equal(complete.verifiedCount, 2)
})

test('buildTaskContract adds design acceptance for frontend tasks', () => {
  const contract = buildTaskContract({ taskText: '设计一个旅游网页', decision: { complexity: 'direct', risk: 'low', type: 'other' } })
  const texts = contract.acceptance.map((c) => c.text)
  assert.ok(texts.some((t) => /visual polish/i.test(t)))
  assert.ok(texts.some((t) => /Responsive/i.test(t)))
  assert.ok(texts.some((t) => /micro-interactions/i.test(t)))
})

test('completionStatus returns Verified / Partially Verified / Unverified', () => {
  const contract = buildTaskContract({
    taskText: 'x',
    acceptance: ['C1', 'C2'],
  })
  assert.equal(completionStatus(contract, []).status, 'Unverified')
  assert.equal(completionStatus(contract, [
    { criterionId: 'C1', trustLevel: 'T3', ok: true },
  ]).status, 'Partially Verified')
  assert.equal(completionStatus(contract, [
    { criterionId: 'C1', trustLevel: 'T3', ok: true },
    { criterionId: 'C2', trustLevel: 'T2', ok: true },
  ]).status, 'Verified')
})