import test from 'node:test'
import assert from 'node:assert/strict'

import {
  capabilityFit,
  formatCandidateScore,
  installUtility,
  overlapWithExisting,
  scorePluginCandidate,
} from '../src/capability-quality.mjs'
import { createCapabilityBrain, registerCapability } from '../src/capability-brain.mjs'

test('capabilityFit measures required coverage', () => {
  const candidate = { provides: ['browser.navigation', 'browser.interaction'] }
  assert.equal(capabilityFit(candidate, ['browser.navigation', 'browser.interaction', 'browser.screenshot']), 2 / 3)
})

test('overlapWithExisting penalizes duplicate capabilities', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'existing', capabilities: ['browser.navigation', 'browser.screenshot'] })
  const candidate = { provides: ['browser.navigation', 'browser.screenshot', 'github.read'] }
  assert.equal(overlapWithExisting(candidate, brain), 2 / 3)
})

test('scorePluginCandidate ranks trusted reliable providers higher', () => {
  const required = ['browser.navigation', 'browser.interaction', 'browser.screenshot', 'github.read']
  const good = scorePluginCandidate({
    id: 'good',
    provides: required,
    verified: true,
    reliability: 0.95,
    maintenance: 0.9,
    community: 0.8,
    risk: 'low',
  }, required, createCapabilityBrain())
  const bad = scorePluginCandidate({
    id: 'bad',
    provides: required,
    verified: false,
    reliability: 0.4,
    maintenance: 0.2,
    community: 0.1,
    risk: 'high',
  }, required, createCapabilityBrain())
  assert.ok(good.score > bad.score)
})

test('overlap penalty lowers score', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'existing', capabilities: ['browser.navigation', 'browser.interaction'] })
  const candidate = { id: 'dup', provides: ['browser.navigation', 'browser.interaction'], verified: true, reliability: 0.9 }
  const lowOverlap = scorePluginCandidate(candidate, ['browser.navigation', 'browser.interaction', 'github.read'], brain, { overlap: 0 })
  const highOverlap = scorePluginCandidate(candidate, ['browser.navigation', 'browser.interaction', 'github.read'], brain, { overlap: 1 })
  assert.ok(lowOverlap.score > highOverlap.score)
})

test('installUtility includes overhead penalties', () => {
  const candidate = { id: 'x', provides: ['test.run'], verified: true, reliability: 0.9, risk: 'low' }
  const utility = installUtility(candidate, ['test.run'], createCapabilityBrain(), { taskFrequency: 2, latencyPenalty: 0.1, contextCost: 0.1 })
  assert.equal(typeof utility.utility, 'number')
  assert.match(formatCandidateScore(utility), /x/)
})