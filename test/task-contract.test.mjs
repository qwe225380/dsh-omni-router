import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildTaskContract,
  formatTaskContract,
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
  assert.deepEqual(contract.acceptance, ['no double charge', 'tests pass'])
  assert.ok(contract.requiredCapabilities.includes('verification'))
})

test('buildTaskContract fills default acceptance', () => {
  const contract = buildTaskContract({ taskText: 'Fix typo' })
  assert.equal(contract.acceptance.length, 1)
  assert.match(contract.acceptance[0], /Fix typo/)
})

test('formatTaskContract renders readable summary', () => {
  const text = formatTaskContract(buildTaskContract({ taskText: 'x' }))
  assert.match(text, /Objective: x/)
  assert.match(text, /Intelligence: L0/)
})