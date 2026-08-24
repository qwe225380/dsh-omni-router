/**
 * Progressive Context Expansion: give the model the smallest useful context
 * first, then expand by level when uncertainty remains.
 */

export const CONTEXT_LEVELS = [
  { id: 'repo_map', label: 'Repository map' },
  { id: 'symbols', label: 'Relevant symbols' },
  { id: 'implementations', label: 'Relevant implementations' },
  { id: 'callers', label: 'Callers / callees' },
  { id: 'tests_configs', label: 'Tests / configs' },
]

export function buildProgressiveContext(taskText, entries, files = {}, options = {}) {
  const level = options.level || 0
  const levels = CONTEXT_LEVELS.slice(0, level + 1).map((l) => l.id)
  const text = String(taskText || '')
  const names = new Set((Array.isArray(entries) ? entries : []).map((e) => e.name))
  const graph = options.graph || {}
  const parts = [`Progressive context (level ${level}):`, `Levels: ${levels.join(' -> ')}`]

  if (levels.includes('repo_map')) {
    parts.push('', 'Repository map:')
    for (const entry of entries || []) parts.push(`- ${entry.name}${entry.type === 'directory' ? '/' : ''}`)
  }
  if (levels.includes('symbols')) {
    const symbols = []
    for (const [name, content] of Object.entries(files || {})) {
      const found = extractSymbols(content)
      if (found.length) symbols.push(`${name} -> ${found.join(', ')}`)
    }
    if (symbols.length) parts.push('', 'Symbols:', ...symbols)
  }
  if (levels.includes('implementations')) {
    const fileNames = names
    const selected = Object.keys(files || {}).filter((name) => fileNames.has(name)).slice(0, options.maxFiles || 3)
    if (selected.length) {
      parts.push('', 'Implementations:')
      for (const name of selected) {
        parts.push(`--- ${name} ---`)
        parts.push(String(files[name] || '').slice(0, options.maxFileChars || 800))
      }
    }
  }
  if (levels.includes('callers')) {
    const edgeLines = []
    for (const [file, edges] of Object.entries(graph || {})) {
      if (!Array.isArray(edges) || edges.length === 0) continue
      edgeLines.push(`- ${file} -> ${edges.map((e) => `${e.to || e} (${e.kind || 'graph'})`).join(', ')}`)
    }
    parts.push('', 'Callers / callees:', edgeLines.length ? edgeLines : ['(no indexed graph edges)'])
  }
  if (levels.includes('tests_configs')) {
    const tests = [...names].filter((n) => /\.(test|spec)\./i.test(n))
    if (tests.length) parts.push('', 'Tests:', ...tests.map((t) => `- ${t}`))
  }
  return applyContextBudget(parts.join('\n'), options)
}

function applyContextBudget(text, options = {}) {
  const maxTokens = Number(options.maxContextTokens) || 0
  if (maxTokens <= 0) return text
  const maxChars = Math.max(32, maxTokens * 4)
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n… (truncated by context budget ${maxTokens} tokens)`
}

export function shouldExpand(uncertainty = 0, threshold = 0.5) {
  return uncertainty > threshold
}

function extractSymbols(text) {
  const source = String(text || '')
  const symbols = new Set()
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g,
  ]
  for (const pattern of patterns) {
    let m
    while ((m = pattern.exec(source)) !== null) symbols.add(m[1])
  }
  return [...symbols]
}