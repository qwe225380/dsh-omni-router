import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPerformanceRegistry,
  evaluateProviderValue,
  formatPerformanceRegistry,
  recommendDemotion,
  recordProvisionOutcome,
} from '../src/capability-performance.mjs'

test('recordProvisionOutcome stores before/after metrics', () => {
  let registry = createPerformanceRegistry()
  registry = recordProvisionOutcome(registry, 'plugin-a', {
    successBefore: 0.73,
    successAfter: 0.86,
    falseCompletionBefore: 0.12,
    falseCompletionAfter: 0.04,
    tokensBefore: 1000,
    tokensAfter: 1080,
  })
  assert.equal(registry.providers['plugin-a'].runs, 1)
  const value = evaluateProviderValue(registry.providers['plugin-a'])
  assert.equal(value.label, 'high')
})

test('evaluateProviderValue labels negative outcomes', () => {
  const value = evaluateProviderValue({
    successBefore: 0.8,
    successAfter: 0.81,
    falseCompletionBefore: 0.1,
    falseCompletionAfter: 0.1,
    tokensBefore: 1000,
    tokensAfter: 1300,
    toolErrorsBefore: 0,
    toolErrorsAfter: 5,
  })
  assert.equal(value.label, 'negative')
})

test('recommendDemotion removes negative redundant providers', () => {
  const registry = createPerformanceRegistry({
    providers: {
      'old-plugin': {
        successBefore: 0.8,
        successAfter: 0.78,
        falseCompletionBefore: 0.1,
        falseCompletionAfter: 0.1,
        tokensBefore: 1000,
        tokensAfter: 1200,
        toolErrorsBefore: 0,
        toolErrorsAfter: 2,
      },
    },
  })
  const rec = recommendDemotion(registry, 'old-plugin', { usageDays: 45, uniqueCapabilities: 1 })
  assert.equal(rec.recommendation, 'demote')
})

test('formatPerformanceRegistry renders entries', () => {
  let registry = createPerformanceRegistry()
  registry = recordProvisionOutcome(registry, 'p', { successBefore: 0.5, successAfter: 0.9 })
  assert.match(formatPerformanceRegistry(registry), /p/)
})