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
  const frontend = /(前端|frontend|ui|页面|component|网页|html|css|react|vue|web)/i.test(String(taskText || ''))
  if (frontend) {
    acceptanceList.push(
      { id: `C${acceptanceList.length + 1}`, text: 'Match the reference site visual polish and interaction richness', requiredTrust: 'T2' },
      { id: `C${acceptanceList.length + 2}`, text: 'Responsive layout works on mobile and desktop', requiredTrust: 'T2' },
      { id: `C${acceptanceList.length + 3}`, text: 'Hover/scroll animations and micro-interactions are implemented', requiredTrust: 'T2' },
    )
  }
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
      }
    }
    index += 1
    return { id: `C${index}`, text: String(criterion), requiredTrust: 'T2' }
  })
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
      const ids = record.criterionId ? [record.criterionId] : (record.criterionIds || [])
      const matchesCriterion = ids.includes(criterion.id)
      if (!matchesCriterion) return false
      if (!isFresh(record)) return false
      if (record.stale === true) return false
      if (record.ok === false) return false
      const trust = TRUST_VALUES[record.trustLevel] ?? record.trustValue ?? 0
      return trust >= requiredValue
    })
    return {
      id: criterion.id,
      text: criterion.text,
      requiredTrust: criterion.requiredTrust,
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