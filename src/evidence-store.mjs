/**
 * Evidence Store.
 *
 * Harness-captured evidence records. Each entry gets a stable id so QA/Judge
 * can reference evidence instead of trusting agent prose.
 */

let seq = 0

export function createEvidenceStore() {
  return { entries: [] }
}

export function captureEvidence(store, entry = {}) {
  seq += 1
  const id = entry.id || `E-${Date.now().toString(36)}-${seq.toString(36)}`
  const record = {
    id,
    type: entry.type || 'command',
    source: entry.source || 'runtime',
    value: entry.value ?? null,
    ok: entry.ok ?? true,
    createdAt: new Date().toISOString(),
    ...(entry.meta ? { meta: entry.meta } : {}),
  }
  return { store: { ...store, entries: [...store.entries, record] }, record }
}

export function getEvidence(store, id) {
  return (store?.entries || []).find((e) => e.id === id) || null
}

export function queryEvidence(store, filter = {}) {
  const list = store?.entries || []
  return list.filter((e) => {
    if (filter.type && e.type !== filter.type) return false
    if (filter.ok !== undefined && e.ok !== filter.ok) return false
    if (filter.source && e.source !== filter.source) return false
    return true
  })
}

export function evidenceSummary(store) {
  const list = store?.entries || []
  return {
    total: list.length,
    byType: list.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1
      return acc
    }, {}),
    failed: list.filter((e) => !e.ok).length,
  }
}
