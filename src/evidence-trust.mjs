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
  criterionIds = [],
  workspaceFingerprint = '',
  workspaceRevision,
  artifactRevisions,
  producer = 'unknown',
  provider,
  kind = '',
  subject,
  artifacts = [],
  trustLevel = 'T0',
  createdAt = new Date().toISOString(),
  payload = {},
  ok,
} = {}) {
  return {
    schemaVersion: '1',
    evidenceId: id,
    criterionId,
    criterionIds: Array.isArray(criterionIds) && criterionIds.length ? criterionIds : (criterionId ? [criterionId] : []),
    workspaceFingerprint,
    ...(workspaceRevision !== undefined ? { workspaceRevision } : {}),
    ...(artifactRevisions ? { artifactRevisions } : {}),
    producer,
    ...(provider ? { provider } : {}),
    ...(kind ? { kind } : {}),
    ...(subject ? { subject } : {}),
    ...(artifacts.length ? { artifacts } : {}),
    trustLevel,
    trustValue: TRUST_LEVELS[trustLevel] ?? 0,
    createdAt,
    payload,
    ...(ok === undefined ? {} : { ok }),
  }
}

// Evidence provider supplies facts. Omni assigns trust. Third-party providers
// can never self-report T4 unless Omni Policy explicitly grants it.
export function assignEvidenceTrust(record = {}, { policyGrantedT4 = false } = {}) {
  let trustLevel = record.trustLevel || 'T0'
  if (trustLevel === 'T4' && !policyGrantedT4) {
    trustLevel = 'T2'
  }
  return { ...record, trustLevel, trustValue: TRUST_LEVELS[trustLevel] ?? 0 }
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
  const kind = type === 'test.completed' ? 'test.pass' : type === 'command.completed' ? 'command' : type.startsWith('tool.') ? 'tool' : type.startsWith('file.') ? 'file' : type
  const raw = createEvidenceRecord({
    id: `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    criterionId: payload.criterionId || payload.criterion_id || '',
    criterionIds: Array.isArray(payload.criterionIds) ? payload.criterionIds : [],
    workspaceFingerprint: event.workspaceFingerprint || '',
    workspaceRevision: payload.workspaceRevision ?? event.workspaceRevision,
    artifactRevisions: payload.artifactRevisions || event.artifactRevisions,
    producer: event.host || 'host',
    provider: payload.provider || event.provider,
    kind,
    subject: payload.subject || event.subject,
    artifacts: Array.isArray(payload.artifacts) ? payload.artifacts : [],
    trustLevel,
    payload: event.payload || {},
    ...(ok === undefined ? {} : { ok }),
  })
  // Providers cannot self-report T4; Omni assigns trust.
  return assignEvidenceTrust(raw)
}

export function isEvidenceStale(record = {}, currentFingerprint = '', currentRevision) {
  if (currentFingerprint && record.workspaceFingerprint && record.workspaceFingerprint !== currentFingerprint) {
    return true
  }
  if (currentRevision !== undefined && record.workspaceRevision !== undefined && currentRevision > record.workspaceRevision) {
    return true
  }
  return false
}

export function invalidateEvidence(records = [], currentFingerprint = '', currentRevision) {
  return records.map((record) => ({
    ...record,
    stale: isEvidenceStale(record, currentFingerprint, currentRevision),
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