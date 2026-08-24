/**
 * Failure Taxonomy: classify observations into stable failure categories with
 * recovery hints. This powers observation-driven DAG mutation.
 */

export function classifyFailure(observation = {}) {
  const text = `${observation.type || ''} ${observation.reason || ''} ${observation.detail || ''}`.toLowerCase()
  if (/test_failure|tests? fail|failed|not ok|assert/i.test(text)) {
    return { category: 'test_failure', recovery: 'reproduce -> diagnose -> patch -> re-verify', severity: 'high' }
  }
  if (/build_failure|compile|type.?error|syntax/i.test(text)) {
    return { category: 'build_failure', recovery: 'read compiler output -> fix smallest unit -> rebuild', severity: 'high' }
  }
  if (/missing_dependency|not found|no module|cannot find|unexpected_dependency/i.test(text)) {
    return { category: 'dependency_issue', recovery: 'inspect dependency graph -> add/adjust dependency -> re-run', severity: 'medium' }
  }
  if (/scope_change|requirement changed|new requirement/i.test(text)) {
    return { category: 'scope_change', recovery: 're-plan from design -> update acceptance criteria', severity: 'medium' }
  }
  if (/timeout|hang|slow|stuck/i.test(text)) {
    return { category: 'performance_timeout', recovery: 'measure -> identify hot path -> optimize -> verify', severity: 'medium' }
  }
  if (/permission|denied|forbidden|unauthorized|auth/i.test(text)) {
    return { category: 'permission_auth', recovery: 'check credentials/permissions -> confirm scope -> retry', severity: 'high' }
  }
  return { category: 'unknown', recovery: 'reproduce -> gather evidence -> re-plan', severity: 'low' }
}