import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findRedundantProviders,
  formatSolveResult,
  isRedundant,
  solveMinimalSet,
} from '../src/capability-solver.mjs'
import { createCapabilityBrain, registerCapability } from '../src/capability-brain.mjs'

test('solveMinimalSet prefers one comprehensive provider over many', () => {
  const required = ['browser.navigation', 'browser.interaction', 'browser.screenshot', 'github.read']
  const candidates = [
    { id: 'a', provides: ['browser.navigation', 'browser.interaction'], verified: true, reliability: 0.9, risk: 'low' },
    { id: 'b', provides: ['browser.screenshot'], verified: true, reliability: 0.9, risk: 'low' },
    { id: 'c', provides: ['browser.navigation', 'browser.interaction', 'browser.screenshot', 'github.read'], verified: true, reliability: 0.95, risk: 'low' },
    { id: 'd', provides: ['github.read'], verified: true, reliability: 0.9, risk: 'low' },
  ]
  const result = solveMinimalSet(required, candidates, { maxPlugins: 2, minScore: 0.4 })
  assert.ok(result.selected.some((c) => c.id === 'c'))
  assert.equal(result.missing.length, 0)
  assert.ok(result.pluginCount <= 2)
  assert.match(formatSolveResult(result), /Minimal set/)
})

test('solveMinimalSet stops at maxPlugins and reports missing', () => {
  const result = solveMinimalSet(
    ['a', 'b', 'c'],
    [{ id: 'only-a', provides: ['a'], verified: true, reliability: 0.9 }],
    { maxPlugins: 1, minScore: 0.4 },
  )
  assert.equal(result.pluginCount, 1)
  assert.deepEqual(result.missing, ['b', 'c'])
})

test('isRedundant detects providers fully covered by others', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'mega', capabilities: ['browser.navigation', 'browser.interaction', 'browser.screenshot'] })
  brain = registerCapability(brain, { id: 'mini', capabilities: ['browser.navigation', 'browser.interaction'] })
  assert.equal(isRedundant({ id: 'mini', provides: ['browser.navigation', 'browser.interaction'] }, brain), true)
  assert.equal(isRedundant({ id: 'mega', provides: ['browser.navigation', 'browser.interaction', 'browser.screenshot'] }, brain), false)
})

test('findRedundantProviders returns covered providers', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'mega', capabilities: ['browser.navigation', 'browser.interaction', 'browser.screenshot'] })
  brain = registerCapability(brain, { id: 'mini', capabilities: ['browser.navigation', 'browser.interaction'] })
  const redundant = findRedundantProviders(brain)
  assert.ok(redundant.some((r) => r.id === 'mini'))
})