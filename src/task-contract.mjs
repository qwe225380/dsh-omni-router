/**
 * TaskContract.
 *
 * The single immutable contract that all Omni modules consume after Decide.
 * It replaces ad-hoc re-classification across Planner/Runtime/Verifier.
 */

import { decideIntelligenceLevel } from './progressive-intelligence.mjs'

export function buildTaskContract({
  taskText = '',
  decision = {},
  acceptance = [],
  constraints = [],
  nonGoals = [],
  requiredCapabilities = [],
} = {}) {
  const intelligence = decideIntelligenceLevel(decision)
  return {
    objective: taskText,
    constraints: Array.isArray(constraints) ? constraints : [],
    nonGoals: Array.isArray(nonGoals) ? nonGoals : [],
    acceptance: Array.isArray(acceptance) && acceptance.length ? acceptance : [`${taskText} is complete`],
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

export function formatTaskContract(contract = {}) {
  const lines = [
    `Objective: ${contract.objective || ''}`,
    `Risk: ${contract.risk} | Uncertainty: ${contract.uncertainty}`,
    `Intelligence: ${contract.intelligenceLevel}`,
    `Verification: ${contract.verificationPolicy?.level}${contract.verificationPolicy?.independentVerify ? ' + independent' : ''}${contract.verificationPolicy?.approvalRequired ? ' + approval' : ''}`,
    `Context budget: ${contract.contextBudget}`,
  ]
  if (contract.acceptance?.length) lines.push(`Acceptance:\n${contract.acceptance.map((c) => `- ${c}`).join('\n')}`)
  if (contract.requiredCapabilities?.length) lines.push(`Required capabilities: ${contract.requiredCapabilities.join(', ')}`)
  return lines.join('\n')
}