import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createOmniTaskState,
  formatOmniTaskState,
} from '../src/omni-task-state.mjs'

test('createOmniTaskState groups all task state in one object', () => {
  const state = createOmniTaskState({
    contract: { objective: 'Fix bug', risk: 'high', intelligenceLevel: 'L3' },
    intervention: { mode: 'guard', utility: 0.2 },
    context: { files: ['a.ts'] },
    capabilityGaps: [{ capability: 'browser.screenshot' }],
    evidence: { verifiedCount: 2, requiredCount: 3 },
    host: { mode: 'full' },
  })
  assert.equal(state.contract.objective, 'Fix bug')
  assert.equal(state.intervention.mode, 'guard')
  assert.equal(state.capabilityGaps[0].capability, 'browser.screenshot')
  assert.match(formatOmniTaskState(state), /Intervention: guard/)
})