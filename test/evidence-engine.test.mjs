import test from 'node:test'
import assert from 'node:assert/strict'

import {
  captureEvidence,
  createEvidenceEngine,
  evidencePass,
  evidenceSummary,
} from '../src/evidence-engine.mjs'

test('evidence engine combines protocol and store', () => {
  const engine = createEvidenceEngine()
  let store = engine.store
  store = captureEvidence(store, { type: 'command', value: 'npm test', ok: true }).store
  engine.store = store
  assert.equal(evidenceSummary(engine.store).total, 1)
  assert.equal(evidencePass({ commands: [{ command: 'npm test', exitCode: 0 }] }), true)
})