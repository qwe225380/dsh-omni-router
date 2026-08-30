import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TRUST_LEVELS,
  assignEvidenceTrust,
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

test('EvidenceRecord v1 includes schema, kind, artifacts, and revisions', () => {
  const record = createEvidenceRecord({
    criterionIds: ['C1'],
    kind: 'test.pass',
    artifacts: ['tests/a.test.js'],
    workspaceRevision: 3,
    artifactRevisions: { 'a.ts': 2 },
    provider: 'dsh',
  })
  assert.equal(record.schemaVersion, '1')
  assert.equal(record.kind, 'test.pass')
  assert.deepEqual(record.criterionIds, ['C1'])
  assert.equal(record.workspaceRevision, 3)
  assert.equal(record.artifactRevisions['a.ts'], 2)
})

test('isEvidenceStale detects workspace revision changes', () => {
  const record = createEvidenceRecord({ workspaceRevision: 10 })
  assert.equal(isEvidenceStale(record, '', 10), false)
  assert.equal(isEvidenceStale(record, '', 11), true)
})

test('assignEvidenceTrust caps third-party self-reported T4', () => {
  const granted = assignEvidenceTrust({ trustLevel: 'T4' }, { policyGrantedT4: true })
  assert.equal(granted.trustLevel, 'T4')
  const capped = assignEvidenceTrust({ trustLevel: 'T4' })
  assert.equal(capped.trustLevel, 'T2')
})

test('omniEventToEvidenceRecord carries revisionTrusted from the host event', () => {
  const record = omniEventToEvidenceRecord({ type: 'test.completed', host: 'dsh', revisionTrusted: true, payload: { exitCode: 0, workspaceRevision: 1 } })
  assert.equal(record.revisionTrusted, true)
  assert.equal(record.workspaceRevision, 1)
})