import test from 'node:test'
import assert from 'node:assert/strict'

import { experienceBasedRouting } from '../src/experience-router.mjs'
import { createMemory, recordLearnedSkill } from '../src/memory.mjs'

test('experienceBasedRouting returns no bias without learned skills', () => {
  const result = experienceBasedRouting(createMemory(), 'fix login')
  assert.equal(result.preferredMode, null)
  assert.equal(result.confidence, 0)
})

test('experienceBasedRouting uses a matching learned skill', () => {
  let memory = createMemory()
  memory = recordLearnedSkill(memory, { name: 'migration-recipe', recipe: 'inspect -> dry-run', triggers: ['migration'] })
  const result = experienceBasedRouting(memory, 'run a migration')
  assert.equal(result.learnedSkill, 'migration-recipe')
  assert.equal(result.preferredMode, 'plan')
})
