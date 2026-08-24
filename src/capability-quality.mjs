/**
 * Plugin / Skill Quality Scoring.
 *
 * Ranks candidate capability providers by capability fit, reliability,
 * security/trust, maintenance, community adoption, performance, and an overlap
 * penalty that keeps the tool catalog minimal.
 */

const WEIGHTS = {
  fit: 0.30,
  reliability: 0.20,
  trust: 0.20,
  maintenance: 0.10,
  community: 0.10,
  performance: 0.05,
}

export function capabilityFit(candidate = {}, required = []) {
  const provides = new Set(candidate.provides || [])
  if (!required.length) return 0
  const covered = required.filter((r) => provides.has(r)).length
  return covered / required.length
}

export function overlapWithExisting(candidate = {}, brain = { capabilities: [] }) {
  const existing = new Set()
  for (const provider of brain.capabilities || []) {
    for (const cap of provider.capabilities || []) existing.add(cap)
  }
  const provides = candidate.provides || []
  if (!provides.length) return 0
  const overlapped = provides.filter((c) => existing.has(c)).length
  return overlapped / provides.length
}

export function scorePluginCandidate(candidate = {}, required = [], brain = { capabilities: [] }, options = {}) {
  const fit = capabilityFit(candidate, required)
  const reliability = Number(candidate.reliability ?? 0.8)
  const trust = candidate.verified === true || candidate.trustedSource === true
    ? 1
    : Number(candidate.trust ?? 0.4)
  const maintenance = Number(candidate.maintenance ?? 0.5)
  const community = Number(candidate.community ?? 0.5)
  const performance = Number(candidate.performance ?? (1 - Number(candidate.contextCost ?? 0.2)))

  const overlap = options.overlap ?? overlapWithExisting(candidate, brain)
  const overlapPenalty = 0.05 + Math.min(0.25, overlap * 0.25)

  const raw = (
    fit * WEIGHTS.fit +
    reliability * WEIGHTS.reliability +
    trust * WEIGHTS.trust +
    maintenance * WEIGHTS.maintenance +
    community * WEIGHTS.community +
    performance * WEIGHTS.performance
  ) - overlapPenalty

  const score = Math.max(0, Math.min(1, Math.round(raw * 1000) / 1000))
  return {
    candidate,
    fit: Math.round(fit * 1000) / 1000,
    reliability,
    trust,
    maintenance,
    community,
    performance,
    overlap: Math.round(overlap * 1000) / 1000,
    overlapPenalty: Math.round(overlapPenalty * 1000) / 1000,
    score,
  }
}

export function installUtility(candidate = {}, required = [], brain = { capabilities: [] }, options = {}) {
  const quality = scorePluginCandidate(candidate, required, brain, options)
  const gain = 1 - quality.overlap
  const taskFrequency = Number(options.taskFrequency ?? 1)
  const latencyPenalty = Number(options.latencyPenalty ?? candidate.latency ?? 0)
  const contextCost = Number(options.contextCost ?? candidate.contextCost ?? 0)
  const maintenanceCost = Number(options.maintenanceCost ?? (1 - quality.maintenance) * 0.1)
  const riskPenalty = Number(options.riskPenalty ?? (candidate.risk === 'high' ? 0.15 : candidate.risk === 'critical' ? 0.3 : 0))
  const utility = quality.score * gain * taskFrequency - latencyPenalty - contextCost - maintenanceCost - riskPenalty
  return {
    ...quality,
    utility: Math.round(utility * 1000) / 1000,
  }
}

export function formatCandidateScore(scored) {
  return `${scored.candidate.id} score=${scored.score} fit=${scored.fit} overlap=${scored.overlap}${scored.utility !== undefined ? ` utility=${scored.utility}` : ''}`
}