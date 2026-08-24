import test from 'node:test'
import assert from 'node:assert/strict'

import {
  canAutoInstall,
  createHubAdapter,
  createMarketplaceAdapter,
  createProvisionTransaction,
  createStaticRegistryAdapter,
  discoverCandidates,
  evaluateProvisionPlan,
  formatProvisionResult,
  probeCapability,
  provisionCapabilities,
  rollbackProvision,
} from '../src/capability-provisioner.mjs'
import { createCapabilityBrain } from '../src/capability-brain.mjs'

test('canAutoInstall enforces trust mode and risk', () => {
  const verified = { verified: true, risk: 'low' }
  assert.equal(canAutoInstall(verified, 'auto-trusted'), true)
  assert.equal(canAutoInstall(verified, 'manual'), false)
  assert.equal(canAutoInstall({ verified: false, risk: 'low' }, 'auto-trusted'), false)
  assert.equal(canAutoInstall({ verified: true, risk: 'high' }, 'auto-trusted'), false)
  assert.equal(canAutoInstall({ source: 'trusted-registry', risk: 'low' }, 'auto-trusted', ['trusted-registry']), true)
})

test('static registry adapter discovers matching candidates', async () => {
  const adapter = createStaticRegistryAdapter([
    { id: 'browser-kit', provides: ['browser.screenshot', 'frontend.validation'], verified: true, reliability: 0.9 },
    { id: 'git-kit', provides: ['github.read'], verified: true, reliability: 0.9 },
  ])
  const candidates = await discoverCandidates(['browser.screenshot', 'github.read'], [adapter])
  assert.equal(candidates.length, 2)
})

test('marketplace and hub adapters delegate search', async () => {
  const marketplace = createMarketplaceAdapter({ search: async () => [{ id: 'mp', provides: ['test.run'] }] })
  const hub = createHubAdapter({ search: async () => [{ id: 'hub', provides: ['debugging'] }] })
  const candidates = await discoverCandidates(['test.run', 'debugging'], [marketplace, hub])
  assert.deepEqual(candidates.map((c) => c.id).sort(), ['hub', 'mp'])
})

test('evaluateProvisionPlan selects minimal set and flags approval', () => {
  const brain = createCapabilityBrain()
  const candidates = [
    { id: 'trusted', provides: ['test.run', 'debugging'], verified: true, reliability: 0.9, risk: 'low' },
    { id: 'untrusted', provides: ['test.run', 'debugging'], verified: false, reliability: 0.9, risk: 'medium' },
  ]
  const plan = evaluateProvisionPlan(['test.run', 'debugging'], candidates, brain, { mode: 'auto-trusted', maxPlugins: 1 })
  assert.equal(plan.selected.length, 1)
  assert.equal(plan.selected[0].candidate.id, 'trusted')
  assert.equal(plan.requiresApproval.length, 0)
})

test('provisionCapabilities installs, probes, and rolls back on probe failure', async () => {
  const plan = {
    missing: ['test.run'],
    selected: [{
      candidate: { id: 'test-kit', package: 'test-kit', provides: ['test.run'], verified: true, risk: 'low', rollbackCommand: 'remove test-kit', expectedTools: ['test_runner'] },
      score: 0.9,
    }],
  }
  const calls = []
  const result = await provisionCapabilities(plan, {
    mode: 'auto-trusted',
    execute: async ({ type, candidate, txn }) => {
      calls.push(type)
      if (type === 'install') return true
      if (type === 'rollback') return true
      return false
    },
    probeTools: [],
  })
  // probe fails because expected tool is missing, so rollback path runs
  assert.equal(result.results[0].status, 'rolled_back')
  assert.ok(calls.includes('install'))
  assert.ok(calls.includes('rollback'))
})

test('probeCapability checks tools and skills', async () => {
  const provider = { expectedTools: ['browser_screenshot'], expectedSkills: ['frontend-validation'] }
  const ok = await probeCapability(provider, { tools: ['browser_screenshot'], skills: ['frontend-validation'] })
  assert.equal(ok.ok, true)
  const bad = await probeCapability(provider, { tools: [], skills: [] })
  assert.equal(bad.ok, false)
})

test('createProvisionTransaction and rollbackProvision', async () => {
  const txn = createProvisionTransaction({ package: 'x', rollbackCommand: 'remove x' })
  assert.equal(txn.status, 'pending')
  const rollback = await rollbackProvision(txn, async () => true)
  assert.equal(rollback.ok, true)
  assert.equal(rollback.txn.status, 'rolled_back')
  assert.match(formatProvisionResult({ results: [] }), /^$/)
})