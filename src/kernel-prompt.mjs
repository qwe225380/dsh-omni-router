/**
 * Kernel Prompt.
 *
 * The only prompt sections Omni should inject into execution:
 *   [Task Contract]
 *   [Relevant Context]
 *   [Completion Rule]
 * Everything else is left to the host.
 */

export function buildKernelPrompt({ contract = {}, contextCapsule = '' } = {}) {
  const lines = []
  lines.push('[Task Contract]')
  lines.push(`Objective: ${contract.objective || ''}`)
  if (contract.constraints?.length) lines.push(`Constraints: ${contract.constraints.join('; ')}`)
  if (contract.acceptance?.length) {
    lines.push('Acceptance:')
    for (const criterion of contract.acceptance) lines.push(`- ${criterion}`)
  }
  lines.push(`Risk: ${contract.risk || 'low'}`)
  lines.push('')
  lines.push('[Relevant Context]')
  lines.push(contextCapsule || '(no additional context)')
  lines.push('')
  lines.push('[Completion Rule]')
  lines.push('Do not declare completion until every acceptance criterion has valid evidence.')
  if (contract.verificationPolicy?.level !== 'light') {
    lines.push('Coding tasks require T2/T3 harness evidence; high-risk tasks require independent verification.')
  }
  return lines.join('\n')
}