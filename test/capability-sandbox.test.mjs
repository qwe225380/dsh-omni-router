import test from 'node:test'
import assert from 'node:assert/strict'

import { capabilityToolFilter, applyToolFilterToTools } from '../src/capability-sandbox.mjs'
import { createCapabilityBrain, registerCapability } from '../src/capability-brain.mjs'

test('verifier sandbox denies write tools', () => {
  const filter = capabilityToolFilter(createCapabilityBrain(), [], 'qa-verifier')
  assert.ok(filter.deny.includes('edit'))
  assert.ok(filter.deny.includes('write'))
})

test('builder sandbox allows write when source.write is required', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'edit-tool', capabilities: ['source.write'], risk: 'medium' })
  const filter = capabilityToolFilter(brain, ['source.write'], 'builder')
  assert.ok(filter.allow.includes('edit-tool'))
  assert.ok(!filter.deny.includes('edit'))
})

test('applyToolFilterToTools filters by allow/deny', () => {
  const tools = ['read', 'edit', 'write']
  const filtered = applyToolFilterToTools(tools, { allow: ['read'], deny: ['edit'] })
  assert.deepEqual(filtered, ['read'])
})
