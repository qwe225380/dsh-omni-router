/**
 * Capability Brain: what capabilities does this environment provide?
 *
 * Capability objects are provider-agnostic (tool / skill / plugin / agent /
 * MCP). Omni resolves required capabilities to concrete installed providers,
 * and falls back gracefully when a capability is missing.
 */

export function createCapabilityBrain() {
  return { capabilities: [] }
}

export function registerCapability(brain, capability = {}) {
  const id = String(capability.id || '')
  if (!id) return brain
  const existing = (brain.capabilities || []).filter((c) => c.id !== id)
  return {
    ...brain,
    capabilities: [
      ...existing,
      {
        id,
        type: capability.type || 'tool',
        description: capability.description || '',
        capabilities: Array.isArray(capability.capabilities) ? capability.capabilities : [],
        cost: capability.cost || 'medium',
        risk: capability.risk || 'low',
        reliability: capability.reliability ?? 0.8,
        successRate: capability.successRate ?? null,
        lastUsed: capability.lastUsed ?? null,
      },
    ],
  }
}

export function recordCapabilityOutcome(brain, id, success) {
  return {
    ...brain,
    capabilities: (brain.capabilities || []).map((c) => {
      if (c.id !== id) return c
      const prev = c.successRate ?? c.reliability ?? 0.8
      const next = prev * 0.9 + (success ? 1 : 0) * 0.1
      return {
        ...c,
        successRate: Math.round(next * 1000) / 1000,
        lastUsed: new Date().toISOString(),
        lastFailure: success ? c.lastFailure : new Date().toISOString(),
      }
    }),
  }
}

export function resolveCapability(brain, requiredCapability) {
  const candidates = (brain.capabilities || [])
    .map((cap) => ({
      ...cap,
      score: cap.capabilities.includes(requiredCapability) ? (cap.successRate ?? cap.reliability ?? 0.8) : 0,
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
  return candidates
}

export function selectCapabilities(brain, requirements = [], limit = 4) {
  const selected = []
  const seen = new Set()
  for (const req of requirements) {
    for (const cap of resolveCapability(brain, req)) {
      if (seen.has(cap.id)) continue
      selected.push({ requirement: req, capability: cap })
      seen.add(cap.id)
      if (selected.length >= limit) return selected
    }
  }
  return selected
}

export function fallbackForMissing(brain, requiredCapability) {
  const matches = resolveCapability(brain, requiredCapability)
  if (matches.length > 0) return null
  return {
    missing: requiredCapability,
    fallback: 'reduce verification level or use an alternative non-browser/non-tool path',
    confidence: 'medium',
    missingVerification: requiredCapability,
  }
}

export function formatCapabilityBrain(brain = {}) {
  const caps = brain.capabilities || []
  if (!caps.length) return '(empty capability brain)'
  return caps.map((c) => `- ${c.id} [${c.type}] ${c.capabilities.join(', ')}`).join('\n')
}
