/**
 * Minimal Capability Set Solver.
 *
 * Chooses the smallest reliable set of plugins/skills that covers the current
 * task's required capabilities. This is a greedy weighted set cover: maximize
 * marginal capability gain while minimizing plugin count and risk.
 */

import { scorePluginCandidate } from './capability-quality.mjs'

export function solveMinimalSet(required = [], candidates = [], options = {}) {
  const maxPlugins = Number(options.maxPlugins ?? 2)
  const minScore = Number(options.minScore ?? 0.4)
  const brain = options.brain || { capabilities: [] }
  const target = [...new Set(required.filter(Boolean))]
  const scored = candidates
    .map((c) => scorePluginCandidate(c, target, brain, options))
    .filter((s) => s.score >= minScore && s.fit > 0)
    .sort((a, b) => b.score - a.score)

  const selected = []
  const covered = new Set()
  let remaining = target.filter((r) => !covered.has(r))
  let totalScore = 0

  while (remaining.length > 0 && selected.length < maxPlugins) {
    let best = null
    let bestMarginal = -1
    for (const scoredCandidate of scored) {
      if (selected.some((s) => s.candidate.id === scoredCandidate.candidate.id)) continue
      const provides = new Set(scoredCandidate.candidate.provides || [])
      const newly = remaining.filter((r) => provides.has(r)).length
      if (newly === 0) continue
      const marginal = (newly / target.length) * scoredCandidate.score
      const riskPenalty = scoredCandidate.candidate.risk === 'high' ? 0.05 : scoredCandidate.candidate.risk === 'critical' ? 0.1 : 0
      const value = marginal - riskPenalty
      if (value > bestMarginal) {
        bestMarginal = value
        best = scoredCandidate
      }
    }
    if (!best) break
    selected.push(best)
    totalScore += best.score
    for (const cap of best.candidate.provides || []) covered.add(cap)
    remaining = target.filter((r) => !covered.has(r))
  }

  return {
    selected: selected.map((s) => s.candidate),
    scored: selected,
    covered: [...covered],
    missing: target.filter((r) => !covered.has(r)),
    totalScore: Math.round(totalScore * 1000) / 1000,
    pluginCount: selected.length,
  }
}

export function isRedundant(candidate = {}, brain = { capabilities: [] }) {
  const providers = brain.capabilities || []
  const candidateId = candidate.id
  const provides = candidate.provides || candidate.capabilities || []
  if (!provides.length) return false
  return provides.every((cap) =>
    providers.some((p) => p.id !== candidateId && (p.capabilities || []).includes(cap)),
  )
}

export function findRedundantProviders(brain = { capabilities: [] }) {
  return (brain.capabilities || [])
    .filter((provider) => isRedundant(provider, brain))
    .map((provider) => ({
      id: provider.id,
      capabilities: provider.capabilities || [],
      reason: 'all capabilities covered by other providers',
    }))
}

export function formatSolveResult(result = {}) {
  const lines = [
    `Minimal set: ${result.pluginCount ?? 0} provider(s), covered ${result.covered?.length || 0}/${result.required?.length || result.covered?.length || 0}`,
  ]
  for (const s of result.scored || []) {
    lines.push(`- ${s.candidate.id} (score=${s.score}, provides ${(s.candidate.provides || []).join(', ')})`)
  }
  if (result.missing?.length) lines.push(`Missing: ${result.missing.join(', ')}`)
  return lines.join('\n')
}