import test from 'node:test'
import assert from 'node:assert/strict'

import {
  captureEvidence,
  createEvidenceStore,
  evidenceSummary,
  getEvidence,
  queryEvidence,
} from '../src/evidence-store.mjs'

test('captureEvidence assigns stable ids', () => {
  let store = createEvidenceStore()
  const { store: next, record } = captureEvidence(store, { type: 'command', value: 'npm test', ok: true })
  store = next
  assert.ok(record.id.startsWith('E-'))
  assert.equal(getEvidence(store, record.id).value, 'npm test')
})

test('queryEvidence filters by type and ok', () => {
  let store = createEvidenceStore()
  store = captureEvidence(store, { type: 'command', ok: true }).store
  store = captureEvidence(store, { type: 'command', ok: false }).store
  store = captureEvidence(store, { type: 'file', ok: true }).store
  assert.equal(queryEvidence(store, { type: 'command' }).length, 2)
  assert.equal(queryEvidence(store, { type: 'command', ok: false }).length, 1)
})

test('evidenceSummary aggregates counts', () => {
  let store = createEvidenceStore()
  store = captureEvidence(store, { type: 'command', ok: true }).store
  store = captureEvidence(store, { type: 'command', ok: false }).store
  const summary = evidenceSummary(store)
  assert.equal(summary.total, 2)
  assert.equal(summary.failed, 1)
  assert.equal(summary.byType.command, 2)
})