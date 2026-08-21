/**
 * Dependency Graph: lightweight static graph extraction.
 *
 * This is a provider-agnostic middle ground between pure regex symbol search
 * and a full tree-sitter AST. It extracts definitions, import/require edges,
 * call sites, and inheritance/implements relations from common JS/TS-style
 * source text. It is intentionally conservative: graph edges are only created
 * when a called/extends name matches an exported symbol in another indexed
 * file, so false positives are bounded.
 */

const CONTROL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof',
  'new', 'delete', 'do', 'else', 'in', 'of', 'case', 'default', 'throw',
  'try', 'finally', 'await', 'yield', 'void', 'instanceof', 'extends',
])

export function extractDefinitions(source) {
  const text = String(source || '')
  const definitions = []
  const patterns = [
    { re: /(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g, kind: 'function' },
    { re: /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g, kind: 'class' },
    { re: /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g, kind: 'variable' },
    { re: /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/g, kind: 'interface' },
    { re: /(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/g, kind: 'type' },
    { re: /export\s*\{([^}]+)\}/g, kind: 'export' },
  ]
  for (const { re, kind } of patterns) {
    let match
    while ((match = re.exec(text)) !== null) {
      if (kind === 'export') {
        for (const raw of match[1].split(',')) {
          const name = raw.trim().split(/\s+as\s+/)[0].trim()
          if (/^[A-Za-z_$][\w$]*$/.test(name)) {
            definitions.push({ name, kind: 'symbol', exported: true })
          }
        }
      } else {
        const exported = /^export\b/.test(match[0]) || /^export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type)\b/.test(match[0])
        definitions.push({ name: match[1], kind, exported })
      }
    }
  }
  return definitions
}

export function extractImports(source) {
  const text = String(source || '')
  const imports = []
  const patterns = [
    /(?:^|\n)\s*import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*const\s+[A-Za-z_$][\w$]*\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const re of patterns) {
    let match
    while ((match = re.exec(text)) !== null) {
      const specifier = match[1]
      if (specifier && !imports.includes(specifier)) imports.push(specifier)
    }
  }
  return imports
}

export function extractCalls(source) {
  const text = String(source || '')
  const calls = []
  const re = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g
  let match
  while ((match = re.exec(text)) !== null) {
    const full = match[1]
    const name = full.split('.').pop()
    if (!name || CONTROL_KEYWORDS.has(name)) continue
    if (!calls.includes(name)) calls.push(name)
  }
  return calls
}

export function extractInheritance(source) {
  const text = String(source || '')
  const relations = []
  const classRe = /class\s+([A-Za-z_$][\w$]*)\s+(?:extends\s+([A-Za-z_$][\w$]*))?(?:\s+implements\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*))?/g
  let match
  while ((match = classRe.exec(text)) !== null) {
    const name = match[1]
    if (!name) continue
    const implementsList = (match[3] || '').split(',').map((s) => s.trim()).filter(Boolean)
    if (match[2]) relations.push({ name, kind: 'extends', target: match[2] })
    for (const target of implementsList) relations.push({ name, kind: 'implements', target })
  }
  const interfaceRe = /interface\s+([A-Za-z_$][\w$]*)\s+extends\s+([A-Za-z_$][\w$]*(?:\s*,\s*[A-Za-z_$][\w$]*)*)/g
  while ((match = interfaceRe.exec(text)) !== null) {
    const name = match[1]
    for (const target of match[2].split(',').map((s) => s.trim()).filter(Boolean)) {
      relations.push({ name, kind: 'extends', target })
    }
  }
  return relations
}

export function resolveModulePath(fromFile, specifier) {
  const target = String(specifier || '')
  if (!target.startsWith('.')) return target
  const base = target.replace(/\.(m?js|ts|jsx|tsx)$/i, '')
  const dir = String(fromFile || '').replace(/\\/g, '/').split('/').slice(0, -1).join('/')
  const normalized = pathPosixNormalize(dir ? `${dir}/${base}` : base)
  return normalized
}

function pathPosixNormalize(p) {
  const parts = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

/**
 * Build a whole-repository graph from a files map.
 *
 * @param {Record<string,string>} files path -> source text
 * @returns {{ files: Record<string, object>, edges: Array<{from:string,to:string,kind:string}> }}
 */
const nodeId = (p) => String(p || '').replace(/\\/g, '/').replace(/\.(m?js|ts|jsx|tsx)$/i, '')

export function buildProjectGraph(files = {}) {
  const indexed = {}
  for (const [filePath, content] of Object.entries(files)) {
    indexed[filePath] = {
      definitions: extractDefinitions(content),
      imports: extractImports(content),
      calls: extractCalls(content),
      inheritance: extractInheritance(content),
    }
  }

  const exportedBy = new Map()
  for (const [filePath, info] of Object.entries(indexed)) {
    const id = nodeId(filePath)
    for (const def of info.definitions) {
      if (!def.exported) continue
      if (!exportedBy.has(def.name)) exportedBy.set(def.name, [])
      exportedBy.get(def.name).push(id)
    }
  }

  const edges = []
  const seen = new Set()
  const addEdge = (from, to, kind) => {
    if (!from || !to || from === to) return
    const key = `${from}\u0000${to}\u0000${kind}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ from, to, kind })
  }

  for (const [filePath, info] of Object.entries(indexed)) {
    const from = nodeId(filePath)
    for (const callee of info.calls) {
      for (const targetFile of exportedBy.get(callee) || []) {
        addEdge(from, targetFile, 'call')
      }
    }
    for (const rel of info.inheritance) {
      for (const targetFile of exportedBy.get(rel.target) || []) {
        addEdge(from, targetFile, rel.kind)
      }
    }
    for (const specifier of info.imports) {
      const resolved = resolveModulePath(filePath, specifier)
      if (resolved && !resolved.startsWith('.') && !resolved.includes('/')) continue
      addEdge(from, resolved, 'import')
    }
  }

  return { files: indexed, edges }
}
