import test from 'node:test'
import assert from 'node:assert/strict'

import {
  adaptEvidenceFromProvider,
  consumeProof,
  federateEvidence,
  formatAdaptedEvidence,
  kindForProvider,
  parseProviderOk,
  trustForProvider,
} from '../src/evidence-adapter.mjs'

test('kindForProvider maps third-party results to evidence kinds', () => {
  assert.equal(kindForProvider('dsh-doublecheck', {}), 'delivery.verify')
  assert.equal(kindForProvider('agentteams', {}), 'agent.verification')
  assert.equal(kindForProvider('router-standard', {}), 'workflow.delivery-check')
  assert.equal(kindForProvider('unknown', { kind: 'custom' }), 'custom')
  assert.equal(kindForProvider('unknown', {}), 'provider.result')
})

test('parseProviderOk reads provider-specific success fields', () => {
  assert.equal(parseProviderOk('dsh-doublecheck', { delivery: 'PASS' }), true)
  assert.equal(parseProviderOk('dsh-doublecheck', { delivery: 'FAIL' }), false)
  assert.equal(parseProviderOk('router-standard', { status: 'pass' }), true)
  assert.equal(parseProviderOk('agentteams', { success: true }), true)
})

test('trustForProvider assigns T3 only to host-observed exit code', () => {
  assert.equal(trustForProvider('dsh-doublecheck', { exitCode: 0 }, { hostObserved: true }), 'T3')
  assert.equal(trustForProvider('dsh-doublecheck', { exitCode: 0 }), 'T2')
  assert.equal(trustForProvider('dsh-doublecheck', { passed: true }, { hostObserved: true }), 'T2')
  assert.equal(trustForProvider('dsh-doublecheck', {}), 'T2')
  assert.equal(trustForProvider('agentteams', {}), 'T2')
  assert.equal(trustForProvider('unknown', { trustLevel: 'T4' }), 'T2')
})

test('adaptEvidenceFromProvider produces EvidenceRecord v1 with Omni-assigned trust', () => {
  const record = adaptEvidenceFromProvider({
    provider: 'dsh-doublecheck',
    result: { delivery: 'PASS', criterionIds: ['C2'], exitCode: 0, files: ['a.test.js'] },
    policy: { hostObserved: true },
  })
  assert.equal(record.kind, 'delivery.verify')
  assert.equal(record.trustLevel, 'T3')
  assert.equal(record.ok, true)
  assert.deepEqual(record.criterionIds, ['C2'])
  assert.equal(record.schemaVersion, '1')
  assert.match(formatAdaptedEvidence(record), /delivery\.verify/)
})

test('third-party self-reported trust and identity are ignored', () => {
  const claimedT3 = adaptEvidenceFromProvider({ provider: 'unknown', result: { trustLevel: 'T3', ok: true } })
  assert.equal(claimedT3.trustLevel, 'T2')
  const selfDeclaredIndependent = adaptEvidenceFromProvider({ provider: 'unknown', result: { trustLevel: 'T4', independent: true, verifier: true, ok: true }, policy: { grantedT4: true } })
  assert.equal(selfDeclaredIndependent.trustLevel, 'T2')
  const registered = adaptEvidenceFromProvider({ provider: 'hidden-verifier', result: { ok: true }, policy: { grantedT4: true } })
  assert.equal(registered.trustLevel, 'T4')
})

test('consumeProof and federateEvidence append without duplicates', () => {
  const first = adaptEvidenceFromProvider({ provider: 'dsh-doublecheck', result: { delivery: 'PASS' } })
  let records = consumeProof(first, [])
  records = consumeProof(first, records)
  assert.equal(records.length, 1)
  const federated = federateEvidence(records, [
    { provider: 'router-standard', result: { status: 'pass' } },
  ])
  assert.equal(federated.length, 2)
})