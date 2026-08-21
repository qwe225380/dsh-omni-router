import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createMemoryV3,
  distillSkill,
  recordCrossSessionStrategy,
  recordExecutionPolicy,
  recordSkillOutcome,
  retrieveCrossSessionStrategies,
  retrieveExecutionPolicy,
  retrieveHistoricalFailures,
} from '../src/memory-v3.mjs'

test('distillSkill requires minimum successes before promoting', () => {
  const memory = createMemoryV3()
  const low = distillSkill(memory, [{ text: 'step ok' }, { text: 'step ok' }], { minSuccesses: 3 })
  assert.equal(low.promoted, false)
  const high = distillSkill(memory, [{ text: 'step ok' }, { text: 'step ok' }, { text: 'step ok' }], { name: 'migration-skill', minSuccesses: 3 })
  assert.equal(high.promoted, true)
  assert.equal(high.skill.successCount, 3)
  assert.equal(high.skill.confidence, 1)
})

test('recordSkillOutcome updates counts and confidence', () => {
  let memory = createMemoryV3()
  memory = distillSkill(memory, [{ text: 'ok' }, { text: 'ok' }, { text: 'ok' }], { name: 's', minSuccesses: 3 }).memory
  memory = recordSkillOutcome(memory, 's', false)
  const skill = memory.learnedSkills.find((s) => s.name === 's')
  assert.equal(skill.failureCount, 1)
  assert.equal(skill.confidence, 0.75)
})

test('retrieveHistoricalFailures filters by task text', () => {
  const memory = createMemoryV3({ failures: [{ text: 'login timeout under concurrency' }, { text: 'payment rounding' }] })
  const hits = retrieveHistoricalFailures(memory, 'login')
  assert.equal(hits.length, 1)
})

test('execution policies and cross-session strategies persist in memory', () => {
  let memory = createMemoryV3()
  memory = recordExecutionPolicy(memory, { name: 'schema-change', trigger: 'migration' })
  memory = recordCrossSessionStrategy(memory, { name: 'checkout-refactor', summary: 'extract service first' })
  assert.equal(retrieveExecutionPolicy(memory, 'migration').length, 1)
  assert.equal(retrieveCrossSessionStrategies(memory).length, 1)
})
