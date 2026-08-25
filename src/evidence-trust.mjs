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
  ok,
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
    ...(ok === undefined ? {} : { ok }),
  }
}

export function omniEventToEvidenceRecord(event = {}) {
  const type = event.type || 'unknown'
  let trustLevel = 'T1'
  if (type === 'command.completed' || type === 'test.completed') trustLevel = 'T3'
  else if (type.startsWith('tool.')) trustLevel = 'T2'
  else if (type.startsWith('file.')) trustLevel = 'T2'
  else if (type.startsWith('approval.')) trustLevel = 'T2'
  const payload = event.payload || {}
  const exitCode = payload.exitCode ?? payload.exit_code
  const ok = (type === 'command.completed' || type === 'test.completed')
    ? exitCode === 0
    : undefined
  return createEvidenceRecord({
    id: `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    criterionId: payload.criterionId || payload.criterion_id || '',
    workspaceFingerprint: event.workspaceFingerprint || '',
    producer: event.host || 'host',
    trustLevel,
    payload: event.payload || {},
    ...(ok === undefined ? {} : { ok }),
  })
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