/**
 * Recovery Policy.
 *
 * A single small decision procedure for failures: retry, repair, expand
 * context, change hypothesis, replan, escalate, or stop. No new "Recovery
 * Brain"; just one policy.
 */

export function decideRecovery({
  failure = {},
  attemptCount = 1,
  sameFailureCount = 0,
  hasContextGap = false,
  maxAttempts = 3,
  budgetRemaining = true,
} = {}) {
  if (!budgetRemaining) return { action: 'stop', reason: 'budget exhausted' }
  if (attemptCount >= maxAttempts) return { action: 'escalate', reason: `max attempts (${maxAttempts}) reached` }
  if (sameFailureCount >= 2) {
    return {
      action: hasContextGap ? 'expand_context' : 'change_hypothesis',
      reason: `same failure repeated ${sameFailureCount} times`,
    }
  }
  if (hasContextGap) return { action: 'expand_context', reason: 'missing context for root cause' }
  if (failure.category === 'test_failure' || failure.category === 'build_failure') {
    return { action: 'repair', reason: 'diagnose and repair with evidence' }
  }
  return { action: 'retry', reason: 'transient or unknown failure, retry once' }
}

export function formatRecoveryDecision(decision = {}) {
  return `${decision.action} — ${decision.reason || ''}`
}