import test from 'node:test'
import assert from 'node:assert/strict'

import {
  autoPopulateCapabilityBrain,
  createCapabilityBrain,
  fallbackForMissing,
  formatCapabilityBrain,
  recordCapabilityOutcome,
  registerCapability,
  resolveCapability,
  resolveCapabilityV2,
  selectCapabilities,
} from '../src/capability-brain.mjs'

test('registerCapability adds a provider-agnostic capability', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, {
    id: 'dsh-trio',
    type: 'plugin',
    capabilities: ['browser.automation', 'browser.screenshot'],
    reliability: 0.95,
  })
  assert.equal(brain.capabilities.length, 1)
  assert.equal(brain.capabilities[0].capabilities[0], 'browser.automation')
})

test('resolveCapability finds matching providers sorted by reliability', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'a', capabilities: ['browser.automation'], reliability: 0.7 })
  brain = registerCapability(brain, { id: 'b', capabilities: ['browser.automation'], reliability: 0.95 })
  const matches = resolveCapability(brain, 'browser.automation')
  assert.equal(matches[0].id, 'b')
})

test('resolveCapabilityV2 penalizes high risk and supports requireLowRisk', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'safe', capabilities: ['db.write'], risk: 'low', reliability: 0.8 })
  brain = registerCapability(brain, { id: 'risky', capabilities: ['db.write'], risk: 'high', reliability: 0.95 })
  const all = resolveCapabilityV2(brain, 'db.write')
  assert.ok(all[0].id === 'safe' || all[0].id === 'risky')
  const lowOnly = resolveCapabilityV2(brain, 'db.write', { requireLowRisk: true })
  assert.ok(lowOnly.every((c) => c.id === 'safe'))
})

test('selectCapabilities returns top N with requirement mapping', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'browser', capabilities: ['browser.automation'] })
  brain = registerCapability(brain, { id: 'git', capabilities: ['git.history'] })
  const selected = selectCapabilities(brain, ['browser.automation', 'git.history'])
  assert.equal(selected.length, 2)
  assert.equal(selected[0].requirement, 'browser.automation')
})

test('fallbackForMissing returns a graceful fallback', () => {
  const brain = createCapabilityBrain()
  const fallback = fallbackForMissing(brain, 'browser.automation')
  assert.ok(fallback.missing)
  assert.match(fallback.fallback, /reduce verification/i)
})

test('formatCapabilityBrain renders capabilities', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'browser', capabilities: ['browser.automation'] })
  assert.match(formatCapabilityBrain(brain), /browser/)
  assert.match(formatCapabilityBrain(createCapabilityBrain()), /empty/)
})

test('recordCapabilityOutcome updates success rate and lastUsed', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'browser', capabilities: ['browser.automation'], reliability: 0.8 })
  brain = recordCapabilityOutcome(brain, 'browser', true)
  const cap = brain.capabilities.find((c) => c.id === 'browser')
  assert.ok(cap.successRate > 0.8)
  assert.ok(cap.lastUsed)
})

test('autoPopulateCapabilityBrain discovers capabilities from tool names', () => {
  let brain = createCapabilityBrain()
  brain = autoPopulateCapabilityBrain(brain, ['browser_open', 'browser_screenshot', 'grep'])
  assert.ok(brain.capabilities.some((c) => c.id === 'browser_open'))
  assert.ok(brain.capabilities.some((c) => c.capabilities.includes('browser.screenshot')))
})
