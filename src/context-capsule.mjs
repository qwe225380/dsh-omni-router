/**
 * Context Capsule.
 *
 * Gives a weak model the smallest useful slice of context for the current
 * task: a few relevant files, their callers/callees, related tests, invariants,
 * and recent failures. This is the opposite of dumping the whole repository
 * map into the prompt.
 */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  'not', 'but', 'you', 'your', 'fix', 'add', 'make', 'use', 'should', 'when',
])

export function buildContextCapsule(taskText, options = {}) {
  const entries = options.entries || []
  const files = options.files || {}
  const graph = options.graph || {}
  const needs = options.needs || []
  const invariants = options.invariants || []
  const failures = options.failures || []
  const maxFiles = Number(options.maxFiles) || 6
  const maxTotalChars = Number(options.maxTotalChars) || 8000
  const maxFileChars = Number(options.maxFileChars) || 1200

  const keywords = extractKeywords([taskText, ...needs])
  const fileNames = entries.filter((e) => e.type === 'file').map((e) => e.name)
  const scored = fileNames.map((name) => {
    const content = files[name] || ''
    const nameScore = scoreText(name, keywords)
    const contentScore = content ? scoreText(content.slice(0, 2000), keywords) * 0.5 : 0
    return { name, score: nameScore + contentScore }
  }).sort((a, b) => b.score - a.score)
  const selected = scored.slice(0, maxFiles).map((s) => s.name)

  const lines = []
  lines.push(`Task: ${taskText}`)
  if (needs.length) lines.push(`Needs: ${needs.join('; ')}`)
  if (selected.length) {
    lines.push('', 'Relevant files:')
    for (const name of selected) {
      const content = files[name] || ''
      lines.push(`--- ${name} ---`)
      lines.push(content ? content.slice(0, maxFileChars) : '(no content indexed)')
    }
  }

  const edgeLines = []
  for (const name of selected) {
    for (const edge of graph[name] || []) {
      edgeLines.push(`${name} ${edge.kind || '->'} ${edge.to || edge}`)
    }
  }
  if (edgeLines.length) {
    lines.push('', 'Callers / callees:')
    lines.push(...edgeLines.slice(0, 20))
  }

  const tests = fileNames.filter((n) =>
    /\.(test|spec)\./i.test(n) &&
    (selected.includes(n) || keywords.some((k) => n.toLowerCase().includes(k))),
  )
  if (tests.length) {
    lines.push('', 'Tests:')
    lines.push(...tests.map((t) => `- ${t}`))
  }

  if (invariants.length) {
    lines.push('', 'Invariants:')
    lines.push(...invariants.map((i) => `- ${i}`))
  }

  if (failures.length) {
    lines.push('', 'Recent failures:')
    lines.push(...failures.map((f) => `- ${f}`))
  }

  let text = lines.join('\n')
  if (text.length > maxTotalChars) {
    text = `${text.slice(0, maxTotalChars)}\n… (context capsule truncated)`
  }
  return text
}

export function expandContextCapsule(current, request, options = {}) {
  const requestText = Array.isArray(request) ? request.join('; ') : String(request || '')
  if (!requestText) return current
  const extra = buildContextCapsule(requestText, {
    ...options,
    maxFiles: Math.max(Number(options.maxFiles) || 6, 3),
    maxTotalChars: Math.max(Number(options.maxTotalChars) || 8000, 4000),
  })
  return `${current}\n\n--- additional context requested ---\n${extra}`
}

function extractKeywords(texts = []) {
  const words = new Set()
  for (const text of texts) {
    for (const match of String(text || '').toLowerCase().match(/[a-z0-9_]+/g) || []) {
      if (match.length > 2 && !STOP_WORDS.has(match)) words.add(match)
    }
  }
  return [...words]
}

function scoreText(text, keywords) {
  const lower = String(text || '').toLowerCase()
  let score = 0
  for (const keyword of keywords) {
    if (lower.includes(keyword)) score += 1
  }
  return score
}