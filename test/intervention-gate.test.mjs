import test from 'node:test'
import assert from 'node:assert/strict'

import {
  decideIntervention,
  expectedInterventionUtility,
  formatInterventionGate,
  interventionEfficiency,
  interventionForIntelligenceLevel,
  noOpPrecision,
  shouldIntervene,
} from '../src/intervention-gate.mjs'

test('expectedInterventionUtility favors high gain low overhead', () => {
  const high = expectedInterventionUtility({ successGain: 0.2, tokenOverhead: 0.05 })
  const low = expectedInterventionUtility({ successGain: 0.01, tokenOverhead: 0.8 })
  assert.ok(high > low)
})

test('shouldIntervene respects threshold', () => {
  assert.equal(shouldIntervene(0.2, 0.1), true)
  assert.equal(shouldIntervene(0.05, 0.1), false)
})

test('decideIntervention returns NOOP by default for low utility', () => {
  const result = decideIntervention({ successGain: 0, tokenOverhead: 0.5 })
  assert.equal(result.intervene, false)
  assert.equal(result.mode, 'noop')
  assert.match(formatInterventionGate(result), /NOOP/)
})

test('noOpPrecision measures correct no-op calls', () => {
  const precision = noOpPrecision([
    { predictedNoop: true, actuallyNeeded: false },
    { predictedNoop: true, actuallyNeeded: true },
    { predictedNoop: false, actuallyNeeded: false },
  ])
  assert.equal(precision, 0.5)
})

test('interventionEfficiency computes gain per overhead', () => {
  const result = interventionEfficiency({ rawSuccess: 0.6, omniSuccess: 0.78, tokenOverhead: 0.3 })
  assert.equal(result.gain, 0.18)
  assert.equal(result.efficiency, 0.6)
})

test('interventionForIntelligenceLevel maps L0-L3 to noop/assist/guard', () => {
  assert.equal(interventionForIntelligenceLevel({ level: 'L0' }).mode, 'noop')
  assert.equal(interventionForIntelligenceLevel({ level: 'L1' }).mode, 'assist')
  assert.equal(interventionForIntelligenceLevel({ level: 'L2' }).mode, 'assist')
  assert.equal(interventionForIntelligenceLevel({ level: 'L3' }).mode, 'guard')
})