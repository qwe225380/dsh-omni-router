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

export function resolveCapability(brain, requiredCapability) {
  const candidates = (brain.capabilities || [])
    .map((cap) => ({
      ...cap,
      score: cap.capabilities.includes(requiredCapability) ? cap.reliability || 0.8 : 0,
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
