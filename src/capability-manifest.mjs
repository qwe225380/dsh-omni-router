/**
 * Capability Manifest.
 *
 * Lets plugins/skills declare what capabilities they provide without Omni
 * maintaining a hardcoded tool-name -> capability map. Manifests can be plain
 * objects, JSON strings, or a small YAML-ish subset.
 */

import { registerCapability } from './capability-brain.mjs'

export function parseManifest(input) {
  if (typeof input === 'object' && input !== null) return input
  const text = String(input || '').trim()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    // fall through to tiny YAML-ish parser
  }
  const lines = text.split(/\r?\n/)
  const manifest = {}
  let currentList = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const listMatch = line.match(/^([A-Za-z0-9_-]+):\s*$/i)
    if (listMatch) {
      currentList = listMatch[1]
      manifest[currentList] = []
      continue
    }
    const itemMatch = line.match(/^-\s*(.+)$/)
    if (itemMatch && currentList) {
      manifest[currentList].push(itemMatch[1].trim())
      continue
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/i)
    if (kv) {
      manifest[kv[1].trim()] = kv[2].trim()
      currentList = null
    }
  }
  return Object.keys(manifest).length ? manifest : null
}

export function applyManifestToBrain(brain, input) {
  const manifest = parseManifest(input)
  if (!manifest || !manifest.id) return brain
  return registerCapability(brain, {
    id: manifest.id,
    type: manifest.type || 'tool',
    description: manifest.description || '',
    capabilities: Array.isArray(manifest.provides) ? manifest.provides : [],
    cost: manifest.cost || 'medium',
    risk: manifest.risk || 'low',
    reliability: Number(manifest.reliability) || 0.8,
  })
}

export function loadCapabilityManifests(brain, manifests = []) {
  let next = brain
  for (const manifest of manifests) {
    next = applyManifestToBrain(next, manifest)
  }
  return next
}
