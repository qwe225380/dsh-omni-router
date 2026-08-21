/**
 * Project Brain v3: graph-augmented repository brain.
 *
 * Combines the SQLite symbol/import index (v2) with Hybrid Retrieval (lexical +
 * symbol + graph/test expansion) to answer repository-level questions.
 */

import { openProjectBrain, closeProjectBrain, indexSource, queryRelevant } from './project-brain-v2.mjs'
import { retrieveContext } from './hybrid-retrieval.mjs'

export function openProjectBrainV3(cwd) {
  return openProjectBrain(cwd)
}

export function closeProjectBrainV3(db) {
  closeProjectBrain(db)
}

export function indexProjectBrainV3(db, entries, files = {}) {
  for (const [name, content] of Object.entries(files || {})) {
    indexSource(db, name, content)
  }
  return {
    indexedFiles: Object.keys(files || {}).length,
    entries: entries?.length || 0,
  }
}

export function queryRelevantV3(db, taskText, entries, files = {}, options = {}) {
  const sqliteHits = queryRelevant(db, taskText)
  const hybrid = retrieveContext(taskText, entries, files, options)
  const merged = new Map()
  for (const hit of sqliteHits) {
    const key = hit.file
    const prev = merged.get(key) || { name: key, score: 0, reasons: [] }
    prev.score += 3
    prev.reasons.push('sqlite')
    merged.set(key, prev)
  }
  for (const c of hybrid.candidates || []) {
    const prev = merged.get(c.name) || { name: c.name, score: 0, reasons: [] }
    prev.score += c.score
    prev.reasons.push(...c.reasons)
    merged.set(c.name, prev)
  }
  const ranked = [...merged.values()]
    .map((c) => ({ ...c, reasons: [...new Set(c.reasons)] }))
    .sort((a, b) => b.score - a.score)
  return {
    candidates: ranked.slice(0, options.limit || 10),
    total: ranked.length,
  }
}

export function formatBrainV3(result = {}) {
  const lines = [`Project Brain v3 (${result.candidates?.length || 0} candidates, ${result.total || 0} total):`]
  for (const c of result.candidates || []) {
    lines.push(`- ${c.name} score=${c.score} (${c.reasons.join(', ')})`)
  }
  return lines.join('\n')
}
