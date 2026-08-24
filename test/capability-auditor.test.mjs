import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OMNI_CODING_BASELINE,
  auditCapabilities,
  baselineAudit,
  formatCapabilityAudit,
  taskTimeAudit,
} from '../src/capability-auditor.mjs'
import { createCapabilityBrain, registerCapability } from '../src/capability-brain.mjs'

test('baselineAudit reports missing coding baseline on empty brain', () => {
  const audit = baselineAudit(createCapabilityBrain())
  assert.ok(audit.missing.includes('repository.read'))
  assert.ok(audit.missing.includes('verification'))
  assert.equal(audit.coverage, 0)
})

test('auditCapabilities lists available and missing', () => {
  let brain = createCapabilityBrain()
  brain = registerCapability(brain, { id: 'fs-tools', capabilities: ['repository.read', 'repository.search', 'source.write'] })
  const audit = auditCapabilities(brain, ['repository.read', 'source.write', 'test.run', 'browser.screenshot'])
  assert.deepEqual(audit.available, ['repository.read', 'source.write'])
  assert.deepEqual(audit.missing, ['test.run', 'browser.screenshot'])
  assert.equal(audit.coverage, 0.5)
})

test('taskTimeAudit returns gaps with severity', () => {
  const audit = taskTimeAudit(createCapabilityBrain(), ['browser.screenshot', 'verification'])
  assert.equal(audit.gaps.length, 2)
  assert.ok(audit.gaps.every((g) => g.severity))
})

test('formatCapabilityAudit renders human-readable summary', () => {
  const text = formatCapabilityAudit(baselineAudit(createCapabilityBrain()))
  assert.match(text, /Capability audit/)
  assert.match(text, /Missing/)
})

test('OMNI_CODING_BASELINE is defined', () => {
  assert.ok(OMNI_CODING_BASELINE.length >= 7)
})