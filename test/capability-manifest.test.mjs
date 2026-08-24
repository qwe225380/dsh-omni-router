import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyManifestToBrain,
  loadCapabilityManifests,
  parseManifest,
} from '../src/capability-manifest.mjs'
import { createCapabilityBrain, resolveCapability } from '../src/capability-brain.mjs'

test('parseManifest handles JSON and simple YAML-ish input', () => {
  const json = parseManifest('{"id":"playwright","provides":["browser.navigation","browser.interaction"]}')
  assert.equal(json.id, 'playwright')
  assert.deepEqual(json.provides, ['browser.navigation', 'browser.interaction'])

  const yaml = parseManifest(`
id: docker
type: tool
provides:
  - container.run
  - container.inspect
`)
  assert.equal(yaml.id, 'docker')
  assert.deepEqual(yaml.provides, ['container.run', 'container.inspect'])
})

test('applyManifestToBrain registers capabilities from a manifest', () => {
  let brain = createCapabilityBrain()
  brain = applyManifestToBrain(brain, {
    id: 'playwright',
    type: 'tool',
    provides: ['browser.navigation', 'browser.interaction'],
  })
  assert.ok(resolveCapability(brain, 'browser.navigation').some((c) => c.id === 'playwright'))
})

test('loadCapabilityManifests applies multiple manifests', () => {
  let brain = createCapabilityBrain()
  brain = loadCapabilityManifests(brain, [
    { id: 'playwright', provides: ['browser.navigation'] },
    { id: 'docker', provides: ['container.run'] },
  ])
  assert.equal(brain.capabilities.length, 2)
})