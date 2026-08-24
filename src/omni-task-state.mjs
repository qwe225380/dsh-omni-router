/**
 * OmniTaskState.
 *
 * The single state object for a task: contract, intervention decision,
 * context state, capability gaps, evidence state, recovery state, and host
 * profile. No more scattered `kind / taskType / thinkingMode / riskLevel`
 * fields in the runtime.
 */

export function createOmniTaskState({
  contract = {},
  intervention = {},
  context = {},
  capabilityGaps = [],
  evidence = {},
  recovery = {},
  host = {},
} = {}) {
  return {
    contract,
    intervention,
    context,
    capabilityGaps,
    evidence,
    recovery,
    host,
    createdAt: new Date().toISOString(),
  }
}

export function formatOmniTaskState(state = {}) {
  const lines = [
    `Objective: ${state.contract?.objective || ''}`,
    `Risk: ${state.contract?.risk || 'low'} | Intelligence: ${state.contract?.intelligenceLevel || '?'}`,
    `Intervention: ${state.intervention?.mode || 'noop'} (utility=${state.intervention?.utility ?? 0})`,
    `Context files: ${state.context?.files?.length ?? 0}`,
    `Capability gaps: ${(state.capabilityGaps || []).map((g) => g.capability || g).join(', ') || '(none)'}`,
    `Evidence: ${state.evidence?.verifiedCount ?? 0}/${state.evidence?.requiredCount ?? 0} verified`,
    `Host mode: ${state.host?.mode || 'unknown'}`,
  ]
  return lines.join('\n')
}