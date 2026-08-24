/**
 * Capability Performance Learning.
 *
 * Tracks whether a provisioned plugin/skill actually improves task success,
 * reduces false completion, or only adds token/catalog overhead. This feeds
 * demotion/removal decisions and benchmark plugin-contribution analysis.
 */

export function createPerformanceRegistry(initial = {}) {
  return {
    providers: { ...(initial.providers || {}) },
  }
}

export function recordProvisionOutcome(registry, providerId, outcome = {}) {
  const previous = registry.providers[providerId] || {
    runs: 0,
    successBefore: null,
    successAfter: null,
    falseCompletionBefore: null,
    falseCompletionAfter: null,
    tokensBefore: null,
    tokensAfter: null,
    toolErrorsBefore: null,
    toolErrorsAfter: null,
  }
  const next = {
    ...previous,
    runs: (previous.runs || 0) + 1,
    successBefore: outcome.successBefore ?? previous.successBefore,
    successAfter: outcome.successAfter ?? previous.successAfter,
    falseCompletionBefore: outcome.falseCompletionBefore ?? previous.falseCompletionBefore,
    falseCompletionAfter: outcome.falseCompletionAfter ?? previous.falseCompletionAfter,
    tokensBefore: outcome.tokensBefore ?? previous.tokensBefore,
    tokensAfter: outcome.tokensAfter ?? previous.tokensAfter,
    toolErrorsBefore: outcome.toolErrorsBefore ?? previous.toolErrorsBefore,
    toolErrorsAfter: outcome.toolErrorsAfter ?? previous.toolErrorsAfter,
    lastUpdated: new Date().toISOString(),
  }
  return {
    ...registry,
    providers: {
      ...registry.providers,
      [providerId]: next,
    },
  }
}

export function evaluateProviderValue(record = {}) {
  const hasBefore = record.successBefore !== null && record.successBefore !== undefined
  const hasAfter = record.successAfter !== null && record.successAfter !== undefined
  if (!hasBefore || !hasAfter) return { value: 0, label: 'unknown' }

  const successDelta = record.successAfter - record.successBefore
  const falseCompletionDelta = (record.falseCompletionBefore ?? 0) - (record.falseCompletionAfter ?? 0)
  const tokenRatio = record.tokensBefore ? Math.max(0, ((record.tokensAfter ?? 0) - record.tokensBefore) / record.tokensBefore) : 0
  const toolErrorDelta = (record.toolErrorsAfter ?? 0) - (record.toolErrorsBefore ?? 0)

  const value = (
    successDelta * 0.5 +
    falseCompletionDelta * 0.3 -
    tokenRatio * 0.1 -
    Math.max(0, toolErrorDelta) * 0.1
  )
  const rounded = Math.round(value * 1000) / 1000
  let label = 'neutral'
  if (rounded >= 0.05) label = 'high'
  else if (rounded > 0) label = 'medium'
  else if (rounded < 0) label = 'negative'
  return { value: rounded, label, successDelta, falseCompletionDelta, tokenRatio, toolErrorDelta }
}

export function recommendDemotion(registry, providerId, options = {}) {
  const record = registry.providers[providerId]
  if (!record) return { providerId, recommendation: 'unknown', reason: 'no performance record' }
  const value = evaluateProviderValue(record)
  const usageDays = Number(options.usageDays ?? 0)
  const uniqueCapabilities = Number(options.uniqueCapabilities ?? 0)
  const coveredBy = options.coveredBy || []

  if (value.label === 'negative' && usageDays >= 30 && uniqueCapabilities === 0) {
    return { providerId, recommendation: 'remove', reason: 'negative value, no unique capability, low usage', value }
  }
  if (value.label === 'negative') {
    return { providerId, recommendation: 'demote', reason: 'negative measured value', value }
  }
  if (usageDays >= 90 && uniqueCapabilities === 0 && coveredBy.length > 0) {
    return { providerId, recommendation: 'remove', reason: 'redundant and unused for 90+ days', value }
  }
  if (value.label === 'high' || value.label === 'medium') {
    return { providerId, recommendation: 'keep', reason: 'positive measured value', value }
  }
  return { providerId, recommendation: 'watch', reason: 'insufficient signal', value }
}

export function formatPerformanceRegistry(registry = {}) {
  const lines = []
  for (const [id, record] of Object.entries(registry.providers || {})) {
    const value = evaluateProviderValue(record)
    lines.push(`- ${id}: ${value.label} (${value.value}) runs=${record.runs || 0}`)
  }
  return lines.length ? lines.join('\n') : '(empty performance registry)'
}