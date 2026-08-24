/**
 * Evidence Trust & Invalidation.
 *
 * Assigns every evidence record a trust level and a workspace fingerprint.
 * If the workspace changes after evidence was produced, that evidence becomes
 * stale and must not count toward completion.
 */

export const TRUST_LEVELS = {
  T0: 0, // model claim
  T1: 1, // agent observation
  T2: 2, // host/tool output
  T3: 3, // deterministic execution
  T4: 4, // independent/hidden verifier
}

export function createEvidenceRecord({
  id = `E-${Date.now().toString(36)}`,
  criterionId = '',
  workspaceFingerprint = '',
  producer = 'unknown',
  trustLevel = 'T0',
  createdAt = new Date().toISOString(),
  payload = {},
} = {}) {
  return {
    evidenceId: id,
    criterionId,
    workspaceFingerprint,
    producer,
    trustLevel,
    trustValue: TRUST_LEVELS[trustLevel] ?? 0,
    createdAt,
    payload,
  }
}

export function isEvidenceStale(record = {}, currentFingerprint = '') {
  if (!currentFingerprint) return false
  return Boolean(record.workspaceFingerprint && record.workspaceFingerprint !== currentFingerprint)
}

export function invalidateEvidence(records = [], currentFingerprint = '') {
  return records.map((record) => ({
    ...record,
    stale: isEvidenceStale(record, currentFingerprint),
  }))
}

export function requiredTrustForRisk(risk = 'low') {
  if (risk === 'high' || risk === 'critical') return { minimum: 'T3', independent: true, label: 'T3 + independent T4' }
  if (risk === 'medium') return { minimum: 'T3', independent: false, label: 'T3' }
  return { minimum: 'T1', independent: false, label: 'T1/T2' }
}

export function evidenceMeetsTrust(record = {}, requiredLevel = 'T0') {
  const required = TRUST_LEVELS[requiredLevel] ?? 0
  return (record.trustValue ?? 0) >= required
}

export function formatEvidenceTrust(record = {}) {
  return `E${record.evidenceId || '?'} T${record.trustLevel || '0'} ${record.stale ? 'STALE' : 'fresh'} criterion=${record.criterionId || '-'}`
}