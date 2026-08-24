/**
 * Real capability sandbox.
 *
 * Maps a role + required capabilities to a concrete tool filter. Verifier /
 * reviewer / judge never get write tools; builders get write tools only when
 * the DAG task actually requires source.write.
 */

import { resolveCapabilityV2 } from './capability-brain.mjs'

const VERIFIER_DENY = ['edit', 'write', 'str_replace_editor', 'browser_click', 'browser_type']
const REVIEWER_DENY = ['edit', 'write', 'str_replace_editor']
const JUDGE_DENY = ['edit', 'write', 'str_replace_editor', 'pwsh', 'bash']

export function capabilityToolFilter(capabilityBrain, requirements = [], role = 'builder') {
  const deny = []

  if (role === 'qa-verifier') deny.push(...VERIFIER_DENY)
  else if (role === 'code-reviewer') deny.push(...REVIEWER_DENY)
  else if (role === 'judge') deny.push(...JUDGE_DENY)

  // Role baseline + capability delta: do not treat resolved provider ids as a
  // full tool whitelist. Baseline read/search/test tools stay available; only
  // explicit deny rules remove tools (e.g. verifiers cannot write).
  for (const req of requirements || []) {
    for (const cap of resolveCapabilityV2(capabilityBrain, req)) {
      if (cap.risk === 'high' || cap.risk === 'critical') {
        // High-risk capabilities are allowed only for roles that may write.
        if (role !== 'builder') deny.push(cap.id)
      }
    }
  }

  return {
    allow: [],
    deny: [...new Set(deny)],
  }
}

export function applyToolFilterToTools(tools, filter = {}) {
  if (!Array.isArray(tools)) return tools
  const allowSet = new Set(filter.allow || [])
  const denySet = new Set(filter.deny || [])
  return tools.filter((tool) => {
    const name = typeof tool === 'string' ? tool : tool?.name
    if (!name) return false
    if (denySet.has(name)) return false
    if (allowSet.size && !allowSet.has(name)) return false
    return true
  })
}