import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRUST_LEVELS,
  createEvidenceRecord,
  evidenceMeetsTrust,
  formatEvidenceTrust,
  invalidateEvidence,
  isEvidenceStale,
  omniEventToEvidenceRecord,
  requiredTrustForRisk,
} from '../src/evidence-trust.mjs'

test('TRUST_LEVELS are ordered', () => {
  assert.ok(TRUST_LEVELS.T3 > TRUST_LEVELS.T1)
  assert.equal(TRUST_LEVELS.T4, 4)
})

test('createEvidenceRecord includes fingerprint and trust', () => {
  const record = createEvidenceRecord({ criterionId: 'c1', workspaceFingerprint: 'fp1', trustLevel: 'T3' })
  assert.equal(record.trustValue, 3)
  assert.equal(record.criterionId, 'c1')
})

test('isEvidenceStale detects fingerprint mismatch', () => {
  const record = createEvidenceRecord({ workspaceFingerprint: 'fp1' })
  assert.equal(isEvidenceStale(record, 'fp1'), false)
  assert.equal(isEvidenceStale(record, 'fp2'), true)
})

test('invalidateEvidence marks stale records', () => {
  const records = [
    createEvidenceRecord({ workspaceFingerprint: 'fp1' }),
    createEvidenceRecord({ workspaceFingerprint: 'fp2' }),
  ]
  const invalidated = invalidateEvidence(records, 'fp2')
  assert.equal(invalidated[0].stale, true)
  assert.equal(invalidated[1].stale, false)
})

test('requiredTrustForRisk escalates for high risk', () => {
  assert.equal(requiredTrustForRisk('low').minimum, 'T1')
  assert.equal(requiredTrustForRisk('high').minimum, 'T3')
  assert.equal(requiredTrustForRisk('high').independent, true)
})

test('evidenceMeetsTrust compares trust values', () => {
  const record = createEvidenceRecord({ trustLevel: 'T3' })
  assert.equal(evidenceMeetsTrust(record, 'T2'), true)
  assert.equal(evidenceMeetsTrust(record, 'T4'), false)
  assert.match(formatEvidenceTrust(record), /T3/)
})

test('omniEventToEvidenceRecord maps DSH events to evidence trust levels', () => {
  const command = omniEventToEvidenceRecord({ type: 'command.completed', host: 'dsh', payload: { exitCode: 0, criterionId: 'C2' } })
  assert.equal(command.trustLevel, 'T3')
  assert.equal(command.ok, true)
  assert.equal(command.criterionId, 'C2')

  const tool = omniEventToEvidenceRecord({ type: 'tool.completed', host: 'dsh', payload: {} })
  assert.equal(tool.trustLevel, 'T2')

  const failed = omniEventToEvidenceRecord({ type: 'test.completed', host: 'dsh', payload: { exitCode: 1 } })
  assert.equal(failed.ok, false)
})