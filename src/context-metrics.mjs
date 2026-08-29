/**
 * Context Metrics.
 *
 * Measures whether the Context Engine is actually putting the right files in
 * the model's attention window: recall@k, precision, token overhead, and
 * irrelevant token ratio. No new "Project Brain" — just numbers.
 */

export function recallAtK(selected = [], relevant = [], k) {
  const top = k === undefined ? selected : selected.slice(0, k)
  const relevantSet = new Set(relevant)
  const hits = top.filter((name) => relevantSet.has(name)).length
  return relevantSet.size ? hits / relevantSet.size : 0
}

export function contextPrecision(selected = [], relevant = []) {
  const relevantSet = new Set(relevant)
  if (!selected.length) return 0
  const hits = selected.filter((name) => relevantSet.has(name)).length
  return hits / selected.length
}

export function contextMetrics({ selected = [], relevant = [], tokens = 0, irrelevantTokens = 0 } = {}) {
  const relevantSet = new Set(relevant)
  const selectedSet = new Set(selected)
  const hits = selected.filter((name) => relevantSet.has(name)).length
  const missed = relevant.filter((name) => !selectedSet.has(name))
  return {
    selectedCount: selected.length,
    relevantCount: relevant.length,
    recallAt5: recallAtK(selected, relevant, 5),
    recallAt10: recallAtK(selected, relevant, 10),
    precision: contextPrecision(selected, relevant),
    hits,
    missed,
    tokens,
    irrelevantTokens,
    irrelevantTokenRatio: tokens ? irrelevantTokens / tokens : 0,
  }
}

export function formatContextMetrics(metrics = {}) {
  return [
    `Context metrics: recall@5=${metrics.recallAt5} recall@10=${metrics.recallAt10} precision=${metrics.precision}`,
    `Files: ${metrics.selectedCount}/${metrics.relevantCount} (hits=${metrics.hits}, missed=${metrics.missed?.length || 0})`,
    `Tokens: ${metrics.tokens} irrelevant=${metrics.irrelevantTokens} (${metrics.irrelevantTokenRatio})`,
  ].join('\n')
}