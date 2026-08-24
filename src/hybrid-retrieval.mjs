/**
 * Hybrid Retrieval: lexical + symbol + graph expansion.
 *
 * This is the v3 retrieval core: keyword matching first, symbol matching
 * second, and dependency/test graph expansion third. Returns ranked context
 * candidates instead of a single static context pack.
 */

import { buildContextGraph, extractSymbolsFromText } from './project-brain.mjs'
import { normalizeQuery } from './query-tokenizer.mjs'

export function retrieveContext(taskText, entries, files = {}, options = {}) {
  const text = String(taskText || '')
  const terms = normalizeQuery(text).expanded.slice(0, 24)
  const candidates = new Map()

  // Lexical: file names and paths
  for (const entry of entries || []) {
    const name = String(entry.name || '')
    const score = terms.reduce((sum, term) => sum + (name.toLowerCase().includes(term) ? 2 : 0), 0)
    if (score > 0) candidates.set(name, { name, score, reasons: ['lexical'] })
  }

  // Symbol: symbols inside files
  for (const [name, content] of Object.entries(files || {})) {
    const symbols = extractSymbolsFromText(content)
    const score = terms.reduce((sum, term) => sum + (symbols.some((s) => s.toLowerCase().includes(term)) ? 3 : 0), 0)
    if (score > 0) {
      const prev = candidates.get(name) || { name, score: 0, reasons: [] }
      prev.score += score
      prev.reasons.push('symbol')
      candidates.set(name, prev)
    }
  }

  // Graph: expand from lexical/symbol matches via dependency hints
  const graph = buildContextGraph(entries, text)
  const matched = new Set(candidates.keys())
  for (const file of matched) {
    for (const dep of graph.dependencies?.[file] || []) {
      const prev = candidates.get(dep) || { name: dep, score: 0, reasons: [] }
      prev.score += 1
      prev.reasons.push('graph')
      candidates.set(dep, prev)
    }
  }
  for (const test of graph.tests || []) {
    const prev = candidates.get(test) || { name: test, score: 0, reasons: [] }
    prev.score += 2
    prev.reasons.push('test')
    candidates.set(test, prev)
  }

  // Graph: real indexed dependency/call/extends edges when available.
  const realGraph = options.graph || null
  if (realGraph) {
    const baseOf = (name) => String(name || '').replace(/\.(m?js|ts|jsx|tsx)$/i, '')
    const entryNameFor = (id) => {
      const exact = (entries || []).find((e) => String(e.name) === id)
      if (exact) return exact.name
      const base = baseOf(id)
      const match = (entries || []).find((e) => baseOf(e.name) === base)
      return match ? match.name : id
    }
    const reverseGraph = {}
    for (const [from, edges] of Object.entries(realGraph)) {
      for (const edge of edges) {
        const rawTo = edge.to || edge
        const key = String(rawTo)
        if (!reverseGraph[key]) reverseGraph[key] = []
        reverseGraph[key].push({ to: from, kind: edge.kind || 'graph' })
      }
    }
    const addEdgeCandidate = (toId, kind) => {
      const to = entryNameFor(toId)
      const prev = candidates.get(to) || { name: to, score: 0, reasons: [] }
      prev.score += kind === 'call' ? 2 : 1
      prev.reasons.push(kind || 'graph')
      candidates.set(to, prev)
    }
    for (const file of matched) {
      const base = baseOf(file)
      for (const edge of realGraph[file] || realGraph[base] || []) {
        addEdgeCandidate(edge.to || edge, edge.kind)
      }
      for (const edge of reverseGraph[file] || reverseGraph[base] || []) {
        addEdgeCandidate(edge.to || edge, edge.kind)
      }
    }
  }

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score)
  return {
    candidates: ranked.slice(0, options.limit || 10),
    expanded: ranked.length,
  }
}

export function formatRetrievalResults(results = {}) {
  const lines = [`Hybrid retrieval (${results.candidates?.length || 0} candidates, ${results.expanded || 0} expanded):`]
  for (const c of results.candidates || []) {
    lines.push(`- ${c.name} score=${c.score} (${c.reasons.join(', ')})`)
  }
  return lines.join('\n')
}