/**
 * Strategy Shift.
 *
 * Prevents blind retry loops: when the same failure category/reason repeats,
 * Omni stops issuing another identical repair and instead re-investigates with
 * broader context, a different capability, or a different role.
 */

export function shouldShiftStrategy(failureHistory = []) {
  if (failureHistory.length < 2) return false
  const last = failureHistory[failureHistory.length - 1] || {}
  const prev = failureHistory[failureHistory.length - 2] || {}
  const sameCategory = last.category && last.category === prev.category
  const sameReason = last.reason && last.reason === prev.reason
  const sameHypothesis = last.hypothesis && last.hypothesis === prev.hypothesis
  return Boolean(sameCategory && (sameReason || sameHypothesis))
}

export function nextStrategy(failureHistory = []) {
  const last = failureHistory[failureHistory.length - 1] || {}
  if (last.category === 'test_failure' || last.category === 'build_failure') {
    return 'Re-investigate root cause with broader context and fresh capability set.'
  }
  if (last.category === 'permission_auth') {
    return 'Check credentials/scopes and switch to an approved auth path.'
  }
  if (last.category === 'dependency_issue') {
    return 'Re-resolve dependency graph and pin compatible versions.'
  }
  if (last.category === 'scope_change') {
    return 'Re-plan with the user to narrow or clarify scope.'
  }
  return 'Expand context, re-diagnose from evidence, and try a different approach.'
}