import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INTELLIGENCE_LEVELS,
  decideIntelligenceLevel,
  formatIntelligenceLevel,
} from '../src/progressive-intelligence.mjs'

test('decideIntelligenceLevel maps direct low-risk tasks to L0', () => {
  const level = decideIntelligenceLevel({ complexity: 'direct', risk: 'low', type: 'other' })
  assert.equal(level.level, 'L0')
  assert.equal(level.useDag, false)
  assert.equal(level.verification, 'light')
})

test('decideIntelligenceLevel maps balanced coding tasks to L1', () => {
  const level = decideIntelligenceLevel({ complexity: 'balanced', risk: 'low', type: 'bugfix' })
  assert.equal(level.level, 'L1')
  assert.equal(level.useSubagents, false)
})

test('decideIntelligenceLevel maps plan complexity to L2', () => {
  const level = decideIntelligenceLevel({ complexity: 'plan', risk: 'low', type: 'feature' })
  assert.equal(level.level, 'L2')
  assert.equal(level.useDag, true)
})

test('decideIntelligenceLevel maps high risk to L3 guarded', () => {
  const level = decideIntelligenceLevel({ complexity: 'direct', risk: 'high', type: 'bugfix' })
  assert.equal(level.level, 'L3')
  assert.equal(level.approvalRequired, true)
  assert.equal(level.independentVerify, true)
})

test('INTELLIGENCE_LEVELS and formatter are stable', () => {
  assert.deepEqual(INTELLIGENCE_LEVELS, ['L0', 'L1', 'L2', 'L3'])
  assert.match(formatIntelligenceLevel({ level: 'L2', label: 'Orchestrated', description: 'x' }), /L2 Orchestrated/)
})