/**
 * TaskContract.
 *
 * The single immutable contract that all Omni modules consume after Decide.
 * It replaces ad-hoc re-classification across Planner/Runtime/Verifier.
 */

import { decideIntelligenceLevel } from './progressive-intelligence.mjs'
import { TRUST_VALUES } from './evidence.mjs'

export function buildTaskContract({
  taskText = '',
  decision = {},
  acceptance = [],
  constraints = [],
  nonGoals = [],
  requiredCapabilities = [],
} = {}) {
  const intelligence = decideIntelligenceLevel(decision)
  const rawAcceptance = Array.isArray(acceptance) && acceptance.length ? acceptance : [`${taskText} is complete`]
  const acceptanceList = normalizeAcceptance(rawAcceptance)
  // Derived criteria must never expand user scope. No implicit frontend or
  // design acceptance is injected here (value.md P0.4).
  return {
    objective: taskText,
    constraints: Array.isArray(constraints) ? constraints : [],
    nonGoals: Array.isArray(nonGoals) ? nonGoals : [],
    acceptance: acceptanceList,
    risk: decision.risk || 'low',
    uncertainty: decision.uncertainty ?? 0.1,
    intelligenceLevel: intelligence.level,
    contextBudget: decision.contextBudget || 20000,
    verificationPolicy: {
      level: intelligence.verification,
      independentVerify: intelligence.independentVerify,
      approvalRequired: intelligence.approvalRequired,
    },
    requiredCapabilities: Array.isArray(requiredCapabilities) && requiredCapabilities.length
      ? requiredCapabilities
      : (decision.evidenceRequirements || []),
    reasoningEffort: intelligence.reasoningEffort,
  }
}

export function normalizeAcceptance(acceptance = []) {
  let index = 0
  return (Array.isArray(acceptance) ? acceptance : []).map((criterion) => {
    if (criterion && typeof criterion === 'object') {
      index += 1
      return {
        id: criterion.id || `C${index}`,
        text: criterion.text || criterion.id || `C${index}`,
        requiredTrust: criterion.requiredTrust || 'T2',
        origin: criterion.origin || 'user',
        ...(criterion.evidenceKinds ? { evidenceKinds: criterion.evidenceKinds } : {}),
        ...(criterion.targets ? { targets: criterion.targets } : {}),
      }
    }
    index += 1
    return { id: `C${index}`, text: String(criterion), requiredTrust: 'T2', origin: 'user' }
  })
}

function matchesTarget(target, value = '') {
  if (!target) return false
  const text = String(value || '')
  if (target.startsWith('*') && target.endsWith('*')) {
    return text.includes(target.slice(1, -1))
  }
  if (target.endsWith('*')) {
    return text.startsWith(target.slice(0, -1))
  }
  if (target.startsWith('*')) {
    return text.endsWith(target.slice(1))
  }
  return text === target || text.includes(target)
}

function recordMatchesCriterion(record, criterion) {
  const ids = record.criterionId ? [record.criterionId] : (record.criterionIds || [])
  if (ids.includes(criterion.id)) return 'explicit'

  // Deterministic binding: kind + target/artifact match, no LLM guessing.
  const kinds = criterion.evidenceKinds || []
  const kind = record.kind || record.type || ''
  if (!kinds.length || !kind) return null
  if (!kinds.some((k) => k === kind)) return null
  const targets = criterion.targets || []
  const hay = [record.subject, ...(record.artifacts || [])].filter(Boolean).join(' ')
  return targets.length === 0 || targets.some((t) => matchesTarget(t, hay)) ? 'deterministic' : null
}

export function verifyCompletion(contract = {}, evidenceRecords = [], options = {}) {
  const criteria = normalizeAcceptance(contract.acceptance)
  const fingerprint = options.workspaceFingerprint || ''
  const records = Array.isArray(evidenceRecords) ? evidenceRecords : []

  const isFresh = (record) => {
    if (!fingerprint) return true
    return !(record.workspaceFingerprint && record.workspaceFingerprint !== fingerprint)
  }

  const criteriaResult = criteria.map((criterion) => {
    const requiredValue = TRUST_VALUES[criterion.requiredTrust] ?? 0
    const match = records.find((record) => {
      if (!isFresh(record)) return false
      if (record.stale === true) return false
      if (record.ok === false) return false
      const trust = TRUST_VALUES[record.trustLevel] ?? record.trustValue ?? 0
      if (trust < requiredValue) return false
      return recordMatchesCriterion(record, criterion) !== null
    })
    return {
      id: criterion.id,
      text: criterion.text,
      requiredTrust: criterion.requiredTrust,
      origin: criterion.origin || 'user',
      binding: match ? recordMatchesCriterion(match, criterion) : null,
      verified: !!match,
      evidenceId: match?.evidenceId || match?.id || null,
    }
  })

  const missing = criteriaResult.filter((c) => !c.verified).map((c) => c.id)
  return {
    completed: missing.length === 0 && criteriaResult.length > 0,
    criteria: criteriaResult,
    missing,
    verifiedCount: criteriaResult.filter((c) => c.verified).length,
    requiredCount: criteriaResult.length,
  }
}

export function completionStatus(contract = {}, evidenceRecords = [], options = {}) {
  const proof = verifyCompletion(contract, evidenceRecords, options)
  if (proof.requiredCount === 0) return { status: 'Unverified', proof }
  if (proof.completed) return { status: 'Verified', proof }
  if (proof.verifiedCount === 0) return { status: 'Unverified', proof }
  return { status: 'Partially Verified', proof }
}

export function formatTaskContract(contract = {}) {
  const lines = [
    `Objective: ${contract.objective || ''}`,
    `Risk: ${contract.risk} | Uncertainty: ${contract.uncertainty}`,
    `Intelligence: ${contract.intelligenceLevel}`,
    `Verification: ${contract.verificationPolicy?.level}${contract.verificationPolicy?.independentVerify ? ' + independent' : ''}${contract.verificationPolicy?.approvalRequired ? ' + approval' : ''}`,
    `Context budget: ${contract.contextBudget}`,
  ]
  if (contract.acceptance?.length) lines.push(`Acceptance:\n${contract.acceptance.map((c) => `- ${c.id}: ${c.text || c}`).join('\n')}`)
  if (contract.requiredCapabilities?.length) lines.push(`Required capabilities: ${contract.requiredCapabilities.join(', ')}`)
  return lines.join('\n')
}