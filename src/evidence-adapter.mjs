/**
 * Evidence Adapter v1 (Evidence Federation).
 *
 * Converts third-party results (Doublecheck, AgentTeams, Router Standard,
 * browser, review...) into Omni EvidenceRecord v1. Omni never controls those
 * plugins; it only consumes their facts. Trust is assigned by Omni Policy,
 * never by the provider.
 */

import { assignEvidenceTrust, createEvidenceRecord, TRUST_LEVELS } from './evidence-trust.mjs'

const TRUSTED_PROVIDERS = new Set(['dsh-doublecheck', 'dsh-trio', 'dsh-router-standard', 'router-standard', 'agentteams'])

export function kindForProvider(provider = '', result = {}) {
  const name = String(provider || '').toLowerCase()
  if (result.kind) return result.kind
  if (name.includes('doublecheck')) return 'delivery.verify'
  if (name.includes('agentteams') || name.includes('agent-teams')) return 'agent.verification'
  if (name.includes('router-standard') || name.includes('router_standard')) return 'workflow.delivery-check'
  if (name.includes('browser')) return 'browser.verify'
  return 'provider.result'
}

export function parseProviderOk(provider = '', result = {}) {
  const name = String(provider || '').toLowerCase()
  if (name.includes('doublecheck')) {
    return result.passed === true || result.delivery === 'PASS' || result.exitCode === 0 || result.status === 'pass'
  }
  if (name.includes('router-standard')) {
    return result.passed === true || result.status === 'pass' || result.exitCode === 0
  }
  if (name.includes('agentteams') || name.includes('agent-teams')) {
    return result.success === true || result.passed === true
  }
  return result.ok === true || result.exitCode === 0 || result.passed === true
}

export function trustForProvider(provider = '', result = {}) {
  // Provider claims are never accepted. Trust is derived from provider class,
  // kind, determinism, and Omni policy only.
  const name = String(provider || '').toLowerCase()
  if (name.includes('doublecheck') && (result.exitCode !== undefined || result.passed !== undefined)) return 'T3'
  if (TRUSTED_PROVIDERS.has(name)) return 'T2'
  return 'T2'
}

export function isIndependentVerifier(provider = '', result = {}) {
  const name = String(provider || '').toLowerCase()
  return result.verifier === true || result.independent === true || name.includes('independent') || name.includes('hidden-verifier')
}

export function adaptEvidenceFromProvider({ provider = '', result = {}, policy = {} } = {}) {
  const trustLevel = policy.grantedT4 === true && isIndependentVerifier(provider, result) ? 'T4' : trustForProvider(provider, result)
  const record = createEvidenceRecord({
    id: `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    criterionIds: Array.isArray(result.criterionIds) ? result.criterionIds : [],
    workspaceFingerprint: result.workspaceFingerprint || '',
    workspaceRevision: result.workspaceRevision,
    artifactRevisions: result.artifactRevisions,
    producer: provider,
    provider,
    kind: kindForProvider(provider, result),
    subject: result.subject || result.file || result.suite || result.target || '',
    artifacts: Array.isArray(result.artifacts) ? result.artifacts : (result.files || []),
    trustLevel,
    payload: result,
    ok: parseProviderOk(provider, result),
  })
  // Providers supply facts. Omni assigns trust. No self-reported T4.
  return assignEvidenceTrust(record, { policyGrantedT4: policy.grantedT4 === true })
}

export function consumeProof(record, evidenceRecords = []) {
  const records = Array.isArray(evidenceRecords) ? evidenceRecords : []
  if (records.some((r) => r.evidenceId === record.evidenceId)) return records
  return [...records, record]
}

export function federateEvidence(records = [], providerResults = [], policy = {}) {
  let next = records
  for (const item of providerResults) {
    const record = adaptEvidenceFromProvider({ provider: item.provider, result: item.result, policy })
    next = consumeProof(record, next)
  }
  return next
}

export function formatAdaptedEvidence(record = {}) {
  return `E${record.evidenceId || '?'} kind=${record.kind || '-'} provider=${record.provider || '-'} T${record.trustLevel || '0'} ok=${record.ok === undefined ? '?' : record.ok}`
}