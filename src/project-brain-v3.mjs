/**
 * Project Brain v3: graph-augmented repository brain.
 *
 * Combines the SQLite symbol/import index (v2) with Hybrid Retrieval (lexical +
 * symbol + graph/test expansion) to answer repository-level questions.
 */

import { openProjectBrain, closeProjectBrain, indexSource, indexProjectGraph, indexSourceFromIndexed, indexProjectGraphFromIndexed, queryRelevant } from './project-brain-v2.mjs'
import { retrieveContext } from './hybrid-retrieval.mjs'
import { buildAstGraph } from './ast-provider.mjs'

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
  const graph = indexProjectGraph(db, files || {})
  return {
    indexedFiles: Object.keys(files || {}).length,
    entries: entries?.length || 0,
    graphEdges: graph.edgeCount,
  }
}

/**
 * Index a project with the optional Tree-sitter AST provider.
 * Falls back to the lightweight parser when tree-sitter is unavailable.
 */
export async function indexProjectBrainV3WithAst(db, entries, files = {}) {
  const graph = await buildAstGraph(files || {})
  for (const [name, info] of Object.entries(graph.files || {})) {
    indexSourceFromIndexed(db, name, info)
  }
  const stats = indexProjectGraphFromIndexed(db, graph.files || {})
  return {
    indexedFiles: Object.keys(files || {}).length,
    entries: entries?.length || 0,
    graphEdges: stats.edgeCount,
    ast: true,
  }
}

export function queryRelevantV3(db, taskText, entries, files = {}, options = {}) {
  const sqliteHits = queryRelevant(db, taskText)
  const edgeRows = db.prepare('SELECT from_file, to_file, kind FROM edges').all() || []
  const graph = {}
  for (const row of edgeRows) {
    if (!graph[row.from_file]) graph[row.from_file] = []
    graph[row.from_file].push({ to: row.to_file, kind: row.kind })
  }
  const hybrid = retrieveContext(taskText, entries, files, { ...options, graph })
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
