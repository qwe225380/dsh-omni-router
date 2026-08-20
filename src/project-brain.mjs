/**
 * Project Brain v1: repository intelligence.
 *
 * Consolidates repository snapshot, symbol extraction, dependency/test mapping,
 * conventions detection, and bounded task context into one module. This is the
 * foundation for Mission Planner / Memory / Benchmark in the Omni Control Plane.
 */

function normalizeText(text) {
  return String(text || '').trim().toLowerCase()
}

/**
 * Choose which root-level key files matter most for a task type.
 */
export function selectKeyFilesForTask(taskType, entries) {
  const names = new Set((Array.isArray(entries) ? entries : []).map((entry) => entry.name))
  const common = ['README.md', 'package.json', 'AGENTS.md', 'CLAUDE.md', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']
  const taskSpecific = {
    test: ['test', 'tests', 'vitest.config.ts', 'jest.config.js'],
    bugfix: ['src', 'lib', 'test', 'tests'],
    feature: ['src', 'lib', 'api', 'README.md'],
    refactor: ['src', 'lib', 'test', 'tests'],
  }[taskType] || []
  const selected = [...common, ...taskSpecific].filter((name) => names.has(name))
  return [...new Set(selected)]
}

/**
 * Lightweight semantic context discovery: find root entries relevant to the
 * task text by keyword/semantic hints, in addition to the common key files.
 */
export function discoverRelevantFiles(entries, taskText) {
  const text = normalizeText(String(taskText || ''))
  const names = new Set((Array.isArray(entries) ? entries : []).map((entry) => entry.name))
  const selected = new Set()

  const common = ['README.md', 'package.json', 'AGENTS.md', 'CLAUDE.md', 'tsconfig.json', 'pyproject.toml', 'Cargo.toml', 'go.mod']
  for (const name of common) if (names.has(name)) selected.add(name)

  const semantic = [
    { pattern: /登录|auth|login|session|token|权限/, targets: ['auth', 'login', 'session', 'user'] },
    { pattern: /订单|order|交易|payment|支付/, targets: ['order', 'payment', 'trade'] },
    { pattern: /用户|user/, targets: ['user'] },
    { pattern: /数据库|db|schema|migration|redis/, targets: ['db', 'database', 'migration', 'redis'] },
    { pattern: /测试|test|单测/, targets: ['test', 'tests'] },
    { pattern: /缓存|cache|redis/, targets: ['cache', 'redis'] },
  ]
  for (const { pattern, targets } of semantic) {
    if (pattern.test(text)) {
      for (const target of targets) {
        for (const entry of (Array.isArray(entries) ? entries : [])) {
          const name = String(entry.name || '')
          if (name === target || name.startsWith(`${target}.`) || name.startsWith(`${target}-`) || name.includes(target)) {
            selected.add(name)
          }
        }
      }
    }
  }

  for (const entry of (Array.isArray(entries) ? entries : [])) {
    const name = String(entry.name || '').toLowerCase()
    if (name && text.includes(name)) selected.add(entry.name)
  }

  return [...selected]
}

/**
 * Extract symbol names from source text (functions, classes, const/let).
 * This is a lightweight real symbol search over file contents.
 */
export function extractSymbolsFromText(text) {
  const source = String(text || '')
  const symbols = new Set()
  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/g,
    /(?:export\s+)?let\s+([A-Za-z_$][\w$]*)\s*=/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source)) !== null) {
      symbols.add(match[1])
    }
  }
  return [...symbols]
}

/**
 * Suggest likely symbols (functions/classes/modules) for a task.
 * This is a lightweight stand-in for real symbol search.
 */
export function suggestSymbolsForTask(taskText) {
  const text = normalizeText(String(taskText || ''))
  const symbols = []
  const rules = [
    { pattern: /登录|auth|login|session|token|权限/, names: ['login', 'auth', 'session', 'token'] },
    { pattern: /订单|order|交易|payment|支付/, names: ['order', 'payment', 'checkout'] },
    { pattern: /用户|user|profile/, names: ['user', 'profile'] },
    { pattern: /数据库|db|schema|migration/, names: ['database', 'schema', 'migration'] },
    { pattern: /缓存|cache|redis/, names: ['cache', 'redis'] },
    { pattern: /测试|test|单测/, names: ['test', 'spec'] },
  ]
  for (const { pattern, names } of rules) {
    if (pattern.test(text)) symbols.push(...names)
  }
  return [...new Set(symbols)]
}

/**
 * Build heuristic dependency hints: map each relevant file to other files it
 * likely depends on, based on semantic domains. This is a stand-in for a real
 * dependency graph.
 */
export function buildDependencyHints(entries, taskText) {
  const list = Array.isArray(entries) ? entries : []
  const names = new Set(list.map((entry) => entry.name))
  const relevant = discoverRelevantFiles(list, taskText)
  const domainMap = {
    auth: ['user', 'session', 'token'],
    login: ['auth', 'user', 'session'],
    user: ['auth', 'profile'],
    order: ['user', 'payment', 'product'],
    payment: ['order', 'user'],
    db: ['redis', 'cache', 'migration'],
    database: ['redis', 'cache', 'migration'],
    cache: ['redis', 'db'],
    redis: ['cache', 'db'],
  }
  const deps = {}
  for (const file of relevant) {
    const base = String(file).replace(/\.[^.]+$/i, '').toLowerCase()
    const related = []
    for (const [key, targets] of Object.entries(domainMap)) {
      if (base.includes(key)) {
        for (const target of targets) {
          const candidates = [...names].filter((name) => {
            const b = String(name).replace(/\.[^.]+$/i, '').toLowerCase()
            return b === target || b.startsWith(`${target}.`) || b.includes(target)
          })
          related.push(...candidates)
        }
      }
    }
    const unique = [...new Set(related.filter((name) => name !== file))]
    if (unique.length) deps[file] = unique
  }
  return deps
}

/**
 * Build a lightweight context graph: relevant files, test mappings, and
 * suggested symbols. This is the first step toward symbol/dependency-aware
 * context discovery.
 */
export function buildContextGraph(entries, taskText) {
  const list = Array.isArray(entries) ? entries : []
  const relevant = discoverRelevantFiles(list, taskText)
  const names = new Set(list.map((entry) => entry.name))
  const baseOf = (name) => String(name).replace(/\.(test|spec)\.[^.]+$/i, '').replace(/\.[^.]+$/i, '')
  const relevantBases = new Set(relevant.map(baseOf))
  const tests = list
    .filter((entry) => /\.(test|spec)\.[^.]+$/i.test(entry.name))
    .map((entry) => entry.name)
    .filter((name) => relevantBases.has(baseOf(name)) || /(test|spec)/i.test(name))
    .filter((name) => names.has(name))
  return {
    relevant: [...new Set(relevant)],
    tests: [...new Set(tests)],
    symbols: suggestSymbolsForTask(taskText),
    dependencies: buildDependencyHints(entries, taskText),
  }
}

/**
 * Project Brain first step: build a lightweight repository snapshot from root
 * entries. Later this will be backed by git/ripgrep/tree-sitter.
 */
export function buildRepositorySnapshot(entries) {
  const names = new Set((Array.isArray(entries) ? entries : []).map((entry) => entry.name))
  const packageManager = names.has('pnpm-lock.yaml') ? 'pnpm'
    : names.has('package-lock.json') ? 'npm'
    : names.has('yarn.lock') ? 'yarn'
    : names.has('bun.lockb') ? 'bun'
    : null
  const testFramework = names.has('vitest.config.ts') || names.has('vitest.config.js') ? 'vitest'
    : names.has('jest.config.js') || names.has('jest.config.ts') ? 'jest'
    : names.has('cypress.config.ts') || names.has('cypress.config.js') ? 'cypress'
    : names.has('mocha.opts') ? 'mocha'
    : null
  const framework = names.has('next.config.js') || names.has('next.config.mjs') ? 'next'
    : names.has('vite.config.ts') || names.has('vite.config.js') ? 'vite'
    : names.has('angular.json') ? 'angular'
    : names.has('nuxt.config.ts') ? 'nuxt'
    : null
  const entryPoints = ['src', 'lib', 'app', 'api', 'server', 'client', 'test', 'tests']
    .filter((name) => names.has(name))
  return {
    packageManager,
    testFramework,
    framework,
    entryPoints,
    hasReadme: names.has('README.md'),
    hasPackageJson: names.has('package.json'),
  }
}

function safeParseJson(text) {
  try {
    return JSON.parse(String(text || ''))
  } catch {
    return null
  }
}

/**
 * Detect lightweight project conventions from root entries and file contents.
 */
export function detectConventions(entries, files = {}) {
  const names = new Set((Array.isArray(entries) ? entries : []).map((entry) => entry.name))
  const conventions = {
    language: null,
    moduleSystem: null,
    testPattern: null,
    lint: null,
    format: null,
  }

  if (names.has('package.json') || names.has('tsconfig.json')) {
    const pkg = names.has('package.json') ? safeParseJson(files['package.json']) : null
    if (pkg) {
      if (pkg.type === 'module') conventions.moduleSystem = 'esm'
      else if (pkg.type === 'commonjs') conventions.moduleSystem = 'cjs'
      if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) conventions.language = 'typescript'
      else conventions.language = 'javascript'
      if (pkg.devDependencies?.eslint) conventions.lint = 'eslint'
      if (pkg.devDependencies?.prettier) conventions.format = 'prettier'
    } else if (names.has('tsconfig.json')) {
      conventions.language = 'typescript'
    }
  } else if (names.has('pyproject.toml') || names.has('requirements.txt')) {
    conventions.language = 'python'
    const py = String(files['pyproject.toml'] || '')
    if (/ruff/i.test(py)) conventions.lint = 'ruff'
    if (/black/i.test(py)) conventions.format = 'black'
  } else if (names.has('Cargo.toml')) {
    conventions.language = 'rust'
  } else if (names.has('go.mod')) {
    conventions.language = 'go'
  }

  if (names.has('vitest.config.ts') || names.has('vitest.config.js')) conventions.testPattern = 'vitest'
  else if (names.has('jest.config.js') || names.has('jest.config.ts')) conventions.testPattern = 'jest'
  else if (names.has('pytest.ini') || names.has('pyproject.toml')) conventions.testPattern = 'pytest'

  return conventions
}

/**
 * Project Brain v1: combine snapshot, symbol index, conventions, and file stats.
 */
export function buildProjectBrain(entries, files = {}, options = {}) {
  const list = Array.isArray(entries) ? entries : []
  const snapshot = buildRepositorySnapshot(list)
  const symbols = {}
  for (const [name, content] of Object.entries(files || {})) {
    const found = extractSymbolsFromText(content)
    if (found.length) symbols[name] = found
  }
  const conventions = detectConventions(list, files)
  return {
    snapshot,
    symbols,
    conventions,
    fileCount: list.filter((entry) => entry.type === 'file').length,
    directoryCount: list.filter((entry) => entry.type === 'directory').length,
    options,
  }
}

/**
 * Build a compact project-context summary from root entries and key file
 * contents. This is injected into plan mode so the model starts with context
 * instead of guessing. `options.maxFileChars` and `options.maxTotalChars` keep
 * the injected context bounded.
 */
export function buildContextSummary(entries, files, options = {}) {
  const maxFileChars = options.maxFileChars ?? 800
  const maxTotalChars = options.maxTotalChars ?? 4000
  const entryLines = (Array.isArray(entries) ? entries : []).map((entry) => {
    const suffix = entry.type === 'directory' ? '/' : ''
    return `- ${entry.name}${suffix}`
  })
  const fileBlocks = Object.entries(files || {}).map(([name, content]) => {
    const text = String(content || '')
    const clipped = text.length > maxFileChars ? `${text.slice(0, maxFileChars)}\n…(truncated)` : text
    return `--- ${name} ---\n${clipped}`
  })
  const parts = ['Project context:']
  if (entryLines.length) parts.push(entryLines.join('\n'))
  if (fileBlocks.length) {
    parts.push('', 'Key files:', fileBlocks.join('\n\n'))
  }
  let summary = parts.join('\n')
  if (summary.length > maxTotalChars) {
    const suffix = '\n…(truncated)'
    summary = `${summary.slice(0, Math.max(0, maxTotalChars - suffix.length))}${suffix}`
  }
  return summary
}

/**
 * Build a bounded task context using Project Brain: relevant files, symbols,
 * tests, dependency hints, and conventions.
 */
export function buildTaskContext(taskText, entries, files = {}, options = {}) {
  const graph = buildContextGraph(entries, taskText)
  const brain = buildProjectBrain(entries, files, options)
  const fileNames = new Set((Array.isArray(entries) ? entries : []).filter((entry) => entry.type === 'file').map((entry) => entry.name))
  const keyFiles = graph.relevant.filter((name) => fileNames.has(name))
  const selectedFiles = {}
  for (const name of keyFiles) {
    if (Object.prototype.hasOwnProperty.call(files, name)) selectedFiles[name] = files[name]
  }

  let summary = buildContextSummary(entries, selectedFiles, { maxTotalChars: options.maxTotalChars ?? 3000 })

  if (graph.symbols.length) summary += `\n\nSuggested symbols: ${graph.symbols.join(', ')}`
  if (graph.tests.length) summary += `\nRelated tests: ${graph.tests.join(', ')}`

  const depEntries = Object.entries(graph.dependencies || {})
  if (depEntries.length) {
    summary += `\nDependency hints: ${depEntries.map(([k, v]) => `${k} -> ${v.join(', ')}`).join('; ')}`
  }

  const symbolEntries = Object.entries(brain.symbols || {})
  if (symbolEntries.length) {
    summary += `\nSymbol index: ${symbolEntries.map(([k, v]) => `${k} -> ${v.join(', ')}`).join('; ')}`
  }

  const conv = brain.conventions || {}
  const convParts = []
  if (conv.language) convParts.push(`lang=${conv.language}`)
  if (conv.moduleSystem) convParts.push(`module=${conv.moduleSystem}`)
  if (conv.testPattern) convParts.push(`tests=${conv.testPattern}`)
  if (conv.lint) convParts.push(`lint=${conv.lint}`)
  if (conv.format) convParts.push(`format=${conv.format}`)
  if (convParts.length) summary += `\nConventions: ${convParts.join(', ')}`

  return summary
}
