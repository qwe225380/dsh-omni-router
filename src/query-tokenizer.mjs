/**
 * QueryTokenizer.
 *
 * One tokenizer for all context retrieval paths. Supports English words,
 * camelCase / snake_case / PascalCase identifiers, paths, and Chinese 2-gram /
 * 3-gram tokens, plus a small semantic expansion map for common engineering
 * terms. Do not add dozens of business keywords here; this is normalization,
 * not a business dictionary.
 */

export const SEMANTIC_EXPANSIONS = {
  '登录': ['login', 'auth', 'session', 'token'],
  '登录超时': ['login', 'timeout', 'session', 'token'],
  '超时': ['timeout'],
  '支付': ['payment', 'order', 'checkout'],
  '退款': ['refund'],
  '死锁': ['deadlock'],
  '并发': ['concurrent', 'concurrency', 'race'],
  '修复': ['fix', 'bug'],
  '测试': ['test', 'spec'],
  '重构': ['refactor'],
  '迁移': ['migration', 'migrate'],
  '接口': ['api', 'interface'],
  '性能': ['performance', 'perf'],
}

export function tokenizeEnglish(text) {
  const tokens = new Set()
  for (const match of String(text || '').match(/[A-Za-z][A-Za-z0-9_]*/g) || []) {
    tokens.add(match.toLowerCase())
    if (/^[A-Za-z]+$/.test(match) && match.length > 2) tokens.add(match.toLowerCase())
    // camelCase / PascalCase / snake_case splitting
    const parts = match
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[_\s-]+/)
      .map((p) => p.toLowerCase())
      .filter((p) => p.length > 1)
    for (const part of parts) tokens.add(part)
  }
  return [...tokens]
}

export function tokenizeChinese(text) {
  const tokens = new Set()
  for (const run of String(text || '').match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length <= 2) {
      tokens.add(run)
      continue
    }
    if (run.length <= 4) tokens.add(run)
    for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2))
    for (let i = 0; i < run.length - 2; i++) tokens.add(run.slice(i, i + 3))
    for (let i = 0; i < run.length - 3; i++) tokens.add(run.slice(i, i + 4))
  }
  return [...tokens]
}

export function tokenizePaths(text) {
  const tokens = new Set()
  for (const match of String(text || '').match(/[\w./\\-]+/g) || []) {
    if (match.includes('/') || match.includes('\\')) {
      for (const part of match.split(/[/\\]/).filter(Boolean)) {
        if (part.length > 1) tokens.add(part.toLowerCase())
      }
    }
  }
  return [...tokens]
}

export function tokenizeQuery(text) {
  return [...new Set([
    ...tokenizeEnglish(text),
    ...tokenizeChinese(text),
    ...tokenizePaths(text),
  ])]
}

export function expandQueryTokens(tokens = [], expansions = SEMANTIC_EXPANSIONS) {
  const result = new Set(tokens)
  for (const token of tokens) {
    for (const extra of expansions[token] || []) result.add(extra)
  }
  return [...result]
}

export function normalizeQuery(text, options = {}) {
  const tokens = tokenizeQuery(text)
  const expanded = options.expand === false ? tokens : expandQueryTokens(tokens)
  return {
    tokens,
    expanded,
    text: String(text || ''),
  }
}