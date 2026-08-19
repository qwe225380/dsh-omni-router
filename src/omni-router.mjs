/**
 * omni-router: task-complexity auto-router for DeepSeek Harness.
 *
 * One preset, one behavior:
 *   - simple / concrete task  -> full catalog, direct execution
 *   - complex / ambiguous    -> enter built-in plan mode, produce a structured
 *                                plan, and wait for user approval
 *
 * The plugin is intentionally small. It reuses DSH's built-in plan mode for the
 * confirmation gate and only adds a lightweight complexity classifier plus a
 * few manual override tools. Optional integrations (browser/MCP/GitHub, quality
 * gates, skills) live in the host profile; this preset does not require them.
 */

import { runAgentChain, formatChainReport } from './agent-chain.mjs'
import { buildSkillSuggestionText, filterAvailableSkills, suggestSkillsForTask } from './skill-suggest.mjs'

export const name = 'omni-router'

export const inject = ['systemPrompt', 'tools', 'llm', 'commands', 'skills']

/** Default tokens that make a task look plan-first. */
const DEFAULT_PLAN_FIRST_KEYWORDS = [
  '设计', '架构', '重构', '方案', '需求', '系统', '分析',
  '改造', '迁移', '升级', '更换', '替换', '定时',
  '时区', 'WebSocket', '重连', '限流', '状态机', '看板',
  '重试', '核销', '改为', '多语言', '国际化', '通知',
  '库存', '签名', 'Webhook', 'OSS', '超时',
  '登录接口', '上传失败', '短信验证码', '分页丢失',
  '金额精度', '不同步', '二维码登录', '幂等', '多仓库', '服务商',
  '黑名单', '批量导入', '会员等级', '状态管理', '虚拟滚动', '批量发放', '注销功能',
  '优惠券计算', '优惠券不可用', '优惠券转赠', '优惠券领取', '批量导出', '重复处理',
  '售后', '日志检索', '签到', '打包', 'MinIO', '文件存储', '改价', '积分',
  '统计', '实名认证', '退款', '不生效',
  'design', 'architecture', 'refactor', 'plan', 'requirement', 'spec',
]

/** Default tokens that force direct execution. */
const DEFAULT_DIRECT_KEYWORDS = [
  '直接做', '直接执行', '马上做', 'just do it', 'do it now',
]

/** Strong signals that a task is a concrete direct action (medium-high confidence). */
const STRONG_DIRECT_HINTS = ['修复', '修一下', 'bug', 'fix', '删掉', '运行测试', '跑测试']

/** Normalize user text for classification. */
function normalize(text) {
  return String(text || '').trim().toLowerCase()
}

/**
 * Heuristic complexity classification with a confidence score.
 *
 * Explicit override words produce high confidence. Strong plan/direct keywords
 * produce medium-high confidence. Short keyword-less requests are treated as
 * direct but with lower confidence so the LLM can override when enabled.
 */
export function heuristicComplexity(text, config = {}) {
  const raw = String(text || '')
  const normalized = normalize(raw)
  const planFirst = [
    ...(config.planFirstKeywords || []),
    ...DEFAULT_PLAN_FIRST_KEYWORDS,
  ]
  const direct = [
    ...(config.directKeywords || []),
    ...DEFAULT_DIRECT_KEYWORDS,
  ]

  // Explicit user overrides beat heuristics.
  for (const token of direct) {
    if (normalized.includes(token.toLowerCase())) return { value: 'direct', confidence: 0.98 }
  }
  for (const token of planFirst) {
    if (normalized.includes(token.toLowerCase())) return { value: 'plan', confidence: 0.92 }
  }

  // Risk overrides strong direct hints: even a small "fix/delete" can be
  // high-risk (auth, database, production config), so it must go to plan.
  const risk = estimateRisk(raw).level
  if (['high', 'critical'].includes(risk)) return { value: 'plan', confidence: 0.95 }

  for (const token of STRONG_DIRECT_HINTS) {
    if (normalized.includes(token)) return { value: 'direct', confidence: 0.85 }
  }

  // Short keyword-less requests: likely direct, but ambiguous enough to let an
  // LLM override when confidence-based fallback is enabled.
  if (raw.length <= 20) return { value: 'direct', confidence: 0.6 }
  if (raw.length <= 40) return { value: 'direct', confidence: 0.7 }

  // Long requests without strong signals are ambiguous; use balanced so the
  // system can decide per task (or let the LLM override).
  return { value: 'balanced', confidence: 0.6 }
}

/**
 * Classify a task text as `plan` or `direct` (heuristic value only).
 */
export function classifyComplexity(text, config = {}) {
  return heuristicComplexity(text, config).value
}

/**
 * Decide whether the session should enter plan mode.
 */
export function shouldEnterPlanMode(kind, config = {}) {
  if (kind === 'plan') return config.requireConfirmation !== false
  if (kind === 'balanced') return config.balancedDefault === 'plan'
  return false
}

/**
 * Normalize a tool parameters value into a valid JSON Schema object schema.
 * DSH rejects `{}`; it requires `{ type: "object", properties: {} }`.
 */
export function normalizeParameters(parameters) {
  if (parameters && parameters.type === 'object' && parameters.properties) {
    return parameters
  }
  return {
    type: 'object',
    properties: (parameters && parameters.properties) || {},
  }
}

/**
 * Rebuild Omni Router state from persisted session events.
 * Returns the latest `omni/router` event data or `null`.
 */
export function readStateFromEvents(events) {
  const list = Array.isArray(events) ? events : []
  for (let i = list.length - 1; i >= 0; i--) {
    const event = list[i]
    if (event && event.type === 'omni/router') {
      const data = event.data || {}
      return {
        kind: data.kind || null,
        taskType: data.taskType || null,
        thinkingMode: data.thinkingMode || null,
        riskLevel: data.riskLevel || null,
        planRequested: !!data.planRequested,
        directOverride: !!data.directOverride,
      }
    }
  }
  return null
}

/**
 * Keep only tools whose names are in the allowed set.
 * Used by the degraded plan-first fallback.
 */
export function filterReadOnlyTools(tools, allowed) {
  if (!Array.isArray(tools)) return tools
  return tools.filter((tool) => tool && allowed.has(tool.name))
}

/**
 * Classify a coding task into a high-level type.
 * Used to tailor the plan template and workflow hints.
 */
export function classifyTaskType(text) {
  const normalized = normalize(String(text || ''))
  if (/(修复|修一下|bug|报错|错误|崩溃|500|fix)/.test(normalized)) return 'bugfix'
  if (/(新增|新做|做一个|增加|实现|feature|add|开发)/.test(normalized)) return 'feature'
  if (/(重构|refactor|重写|优化结构)/.test(normalized)) return 'refactor'
  if (/(测试|单测|test|补测试)/.test(normalized)) return 'test'
  if (/(review|审查|评审|code review|pr)/.test(normalized)) return 'review'
  return 'other'
}

/**
 * Classify the preferred reasoning mode:
 *   spec     - plan-first, deep thinking, design before acting
 *   react    - direct doer, execute quickly
 *   balanced - let the task decide (default)
 */
export function classifyThinkingMode(text) {
  const normalized = normalize(String(text || ''))
  if (/(设计|架构|方案|需求|规划|spec|design|architecture|plan)/.test(normalized)) return 'spec'
  if (/(直接|马上|赶紧|快|do it|just do|react|execute)/.test(normalized)) return 'react'
  return 'balanced'
}

/**
 * Return a prompt hint for the selected thinking mode.
 */
export function thinkingModeHint(mode) {
  if (mode === 'spec') {
    return 'Thinking mode: spec — think deeply first, explore before acting, and prefer a plan/design before implementation.'
  }
  if (mode === 'react') {
    return 'Thinking mode: react — act directly, keep ceremony low, and produce results efficiently.'
  }
  return 'Thinking mode: balanced — decide per task whether to plan first or act directly.'
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
  const text = normalize(String(taskText || ''))
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
  const text = normalize(String(taskText || ''))
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
 * Estimate task risk from text heuristics.
 * Complexity and risk are intentionally separate dimensions.
 */
export function estimateRisk(text) {
  const normalized = normalize(String(text || ''))
  const reasons = []
  if (/(生产环境|production|prod|密钥|secret|token|drop database|drop table|rm -rf)/.test(normalized)) {
    reasons.push('production/secret/destructive')
  }
  if (/(schema|migration|drop table|drop database|连接池|auth|权限|deploy|ci\/cd|配置|config|Webhook|验签|签名|对账|网关|退款|扣款|删除.*(数据库|字段|表|生产|配置|auth|用户)|删掉.*(数据库|字段|表|生产|配置|auth|用户))/.test(normalized)) {
    reasons.push('schema/auth/delete/deploy')
  }
  if (/(数据库|db|redis|登录|login|session|token|订单|order|支付|payment|业务逻辑|重构|refactor|api|接口|核心)/.test(normalized)) {
    reasons.push('business-logic/api')
  }
  const score = reasons.includes('production/secret/destructive') ? 1.0
    : reasons.includes('schema/auth/delete/deploy') ? 0.8
    : reasons.includes('business-logic/api') ? 0.5
    : 0.1
  const level = score >= 0.95 ? 'critical' : score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low'
  return { level, score, reasons }
}

/**
 * Decide whether to reroute based on execution signals.
 * Returns 'plan', 'direct', or null (keep current).
 */
export function rerouteDecision(current, signals = {}) {
  const blastRadius = signals.blastRadius ?? 0.5
  if (current === 'direct' && blastRadius >= 0.7) return 'plan'
  if (current === 'plan' && blastRadius <= 0.2) return 'direct'
  return null
}

/**
 * Select a specialized agent/toolchain for the task.
 * This is the first step toward Agent Orchestration.
 */
export function selectAgentForTask(taskType, taskText = '') {
  const text = normalize(String(taskText || ''))
  if (/(前端|frontend|ui|页面|component)/.test(text)) return 'frontend-agent'
  if (/(数据库|db|schema|sql|migration|redis)/.test(text)) return 'db-agent'
  if (/(浏览器|browser|playwright|网页)/.test(text)) return 'browser-agent'
  if (/(安全|auth|登录|权限|security|token)/.test(text)) return 'security-agent'
  if (taskType === 'review' || /(review|审查|评审)/.test(text)) return 'review-agent'
  if (/(api|接口|backend|服务端)/.test(text)) return 'backend-agent'
  return 'coding-agent'
}

/**
 * Derive a compact workflow policy from task dimensions.
 * This is the Policy/State Orchestration primitive: instead of many prompt
 * hints, the router maintains a state machine.
 */
export function workflowPolicy(taskType, complexity, risk) {
  const coding = ['bugfix', 'feature', 'refactor', 'test'].includes(taskType)
  const highRisk = ['high', 'critical'].includes(risk)
  const planRequired = complexity === 'plan' || highRisk
  return {
    planning: planRequired ? 'required' : 'optional',
    approval: planRequired ? 'required' : 'optional',
    testing: coding ? 'required' : 'optional',
    review: taskType === 'review' ? 'required' : coding ? 'recommended' : 'optional',
    git: coding ? 'recommended' : 'optional',
  }
}

/**
 * Policy Engine: unify all routing dimensions into one decision object.
 * This is the "brain first layer" described in the Omni roadmap.
 */
export function buildPolicyDecision(taskText, config = {}) {
  const complexity = classifyComplexity(taskText, config)
  const taskType = classifyTaskType(taskText)
  const risk = estimateRisk(taskText).level
  const highRisk = ['high', 'critical'].includes(risk)
  const executionMode = complexity === 'plan' || highRisk ? 'plan' : 'direct'
  const coding = ['bugfix', 'feature', 'refactor', 'test'].includes(taskType)
  return {
    taskType,
    complexity,
    risk,
    reasoningMode: complexity === 'plan' || highRisk ? 'max' : 'balanced',
    contextStrategy: 'dependency-aware',
    executionMode,
    approvalRequired: executionMode === 'plan' || highRisk,
    confidence: heuristicComplexity(taskText, config).confidence,
    verification: coding ? ['unit', 'integration', 'regression'] : [],
    gitPolicy: {
      requireBranch: coding,
    },
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

/**
 * Intent Engine: interpret what the user actually wants, beyond task type.
 */
export function buildIntent(taskText) {
  const text = String(taskText || '')
  const taskType = classifyTaskType(text)
  const constraints = []
  if (/(不要破坏|不能影响|保持|preserve|do not break|without breaking)/i.test(text)) {
    constraints.push('preserve existing behavior')
  }
  if (/(支付|checkout|payment|order|订单)/i.test(text)) {
    constraints.push('preserve existing checkout/payment flow')
  }
  const desiredOutcome = taskType === 'bugfix'
    ? 'fix the reported bug without introducing regressions'
    : taskType === 'feature'
      ? 'implement the requested feature and make it verifiable'
      : taskType === 'refactor'
        ? 'refactor while preserving observable behavior'
        : 'complete the requested task'
  const acceptanceCriteria = taskType === 'bugfix'
    ? ['bug is fixed', 'regression tests pass']
    : taskType === 'feature'
      ? ['feature API/UI exists', 'relevant tests pass']
      : taskType === 'refactor'
        ? ['behavior preserved', 'tests pass']
        : ['task completed', 'no obvious regressions']
  return {
    intent: taskType === 'feature' ? 'implement_feature' : taskType === 'bugfix' ? 'fix_bug' : 'complete_task',
    taskType,
    desiredOutcome,
    constraints,
    acceptanceCriteria,
    confidence: 0.8,
  }
}

/**
 * Context Budget: how much context to spend per task complexity/risk.
 */
export function buildContextBudget(complexity, risk) {
  const base = complexity === 'plan' ? 100000 : complexity === 'balanced' ? 60000 : 20000
  const riskBonus = ['high', 'critical'].includes(risk) ? 50000 : 0
  const maxContextTokens = base + riskBonus
  return {
    maxContextTokens,
    softLimit: Math.round(maxContextTokens * 0.75),
    retrievalBudget: Math.round(maxContextTokens * 0.25),
    historyBudget: Math.round(maxContextTokens * 0.1),
  }
}

/**
 * Agent Runtime core API: decide the next best action from state.
 */
export function decideNextAction(state = {}) {
  const phase = state.phase || 'understand'
  const taskType = state.taskType || 'other'
  const risk = state.risk || 'low'
  switch (phase) {
    case 'understand':
      return { action: 'inspect_repository', target: 'repository', reason: `understand ${taskType} task`, risk }
    case 'design':
      return { action: 'search_symbols', target: taskType, reason: 'find relevant symbols for design', risk }
    case 'implement':
      return { action: 'read_file', target: 'relevant source', reason: 'inspect current implementation before editing', risk }
    case 'verify':
      return { action: 'run_tests', target: 'relevant test suite', reason: 'verify implementation', risk }
    case 'repair':
      return { action: 'inspect_failure', target: 'failing test/output', reason: 'diagnose root cause before patching', risk }
    default:
      return { action: 'inspect_repository', target: 'repository', reason: 'start task', risk }
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
 * Return a code-oriented structured plan template for the given task type.
 */
export function planTemplateForType(type = 'other') {
  const typeHint = {
    bugfix: 'Focus on reproducing the failure, identifying the root cause, and adding a regression test.',
    feature: 'Focus on the user-facing behavior, data/interface design, and acceptance criteria.',
    refactor: 'Focus on preserving behavior, identifying affected call sites, and relying on tests.',
    test: 'Focus on meaningful coverage, edge cases, and deterministic assertions.',
    review: 'Focus on correctness, maintainability, security, and concrete actionable feedback.',
    other: 'Produce a clear, decision-complete plan.',
  }[type] || 'Produce a clear, decision-complete plan.'

  return `Goal:
Scope:
Involved files / modules:
Implementation steps:
Interface / data changes:
Test plan:
Risks:
Compatibility / migration:
Rollback:
Acceptance criteria:

Task-type hint: ${typeHint}`
}

/**
 * Return a short TDD skill-routing hint for coding task types.
 * Non-coding types get an empty string. Detailed TDD procedure is left to the skill.
 */
export function tddHintForType(type) {
  if (!['bugfix', 'feature', 'refactor', 'test'].includes(type)) return ''
  return 'Load the test-driven-development or red-green-tdd skill (if available) and follow it for this task.'
}

/**
 * Return a short delivery-gate skill-routing hint.
 * The actual gate procedure is left to verification/delivery skills.
 */
export function deliveryGateHint(type = 'other') {
  const coding = ['bugfix', 'feature', 'refactor', 'test'].includes(type)
  if (!coding) return ''
  return 'Before declaring done, load the verification-before-completion or delivery-proof skill (if available) and follow its gate.'
}

/**
 * Return a short verification skill-routing hint for direct/simple tasks.
 */
export function lightVerificationHint() {
  return 'This is a direct task. Load the verification-loop or verification-before-completion skill (if available) before declaring done.'
}

/**
 * Return a short acceptance-checklist skill-routing hint.
 */
export function acceptanceChecklistHint() {
  return 'Load the executing-plans or writing-plans skill (if available) to turn acceptance criteria into a tracked checklist.'
}

/**
 * Return a short Git skill-routing hint for coding tasks.
 */
export function gitWorkflowHint(type) {
  if (!['bugfix', 'feature', 'refactor', 'test'].includes(type)) return ''
  return 'Load the using-git-worktrees or git-discipline skill (if available) before committing.'
}

/**
 * Parse a structured LLM classification response.
 * Accepts a JSON object embedded in the model output.
 */
export function parseLLMClassification(text) {
  const source = String(text || '')
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const obj = JSON.parse(source.slice(start, end + 1))
    return {
      taskType: obj.task_type || obj.taskType || null,
      complexity: obj.complexity || null,
      thinkingMode: obj.thinking_mode || obj.thinkingMode || null,
      confidence: typeof obj.confidence === 'number' ? obj.confidence : null,
      reasons: Array.isArray(obj.reasons) ? obj.reasons : [],
    }
  } catch {
    return null
  }
}

/**
 * Decide whether the heuristic classification is uncertain enough to ask an LLM.
 */
export function needsLLMClassification(text, config = {}) {
  if (config.useLLMClassification !== true) return false
  const threshold = config.llmConfidenceThreshold ?? 0.7
  return heuristicComplexity(text, config).confidence < threshold
}

/**
 * Cordis plugin entry.
 */
export function apply(ctx, config = {}) {
  const EVENT_TYPE = 'omni/router'
  // Fallback read-only surface used when plan mode is unavailable.
  const READ_ONLY_TOOLS = new Set([
    'read', 'glob', 'grep',
    'ask_user_question', 'todo_write',
    'omni_status', 'omni_plan', 'omni_direct',
    'browser_snapshot', 'browser_elements', 'browser_status', 'browser_tabs', 'browser_cookies',
  ])
  const states = new Map() // session.id -> { kind, planRequested, directOverride }
  const agents = new Map() // session.id -> Agent

  function readPersistedState(session) {
    return readStateFromEvents(session.events)
  }

  function stateFor(session) {
    let state = states.get(session.id)
    if (!state) {
      state = readPersistedState(session) || { kind: null, taskType: null, thinkingMode: null, riskLevel: null, firstText: null, planRequested: false, directOverride: false }
      states.set(session.id, state)
    }
    return state
  }

  function persistState(session, state) {
    states.set(session.id, state)
    try {
      session.append(EVENT_TYPE, {
        kind: state.kind,
        taskType: state.taskType || null,
        thinkingMode: state.thinkingMode || null,
        riskLevel: state.riskLevel || null,
        planRequested: !!state.planRequested,
        directOverride: !!state.directOverride,
      })
    } catch {
      // Persistence is best-effort; the in-memory state still works.
    }
  }

  function agentFor(session) {
    const current = ctx.get('agent')
    if (current && current.session === session) return current
    return agents.get(session.id)
  }

  function planMode() {
    return ctx.get('planMode') || ctx.planMode || undefined
  }

  function setPlanMode(agent, active) {
    const pm = planMode()
    if (!pm || !agent) return false
    try {
      pm.set(agent, active)
      return true
    } catch {
      return false
    }
  }

  async function getProjectContext(session, taskType = 'other', taskText = '') {
    const fs = ctx.get('fs') || ctx.fs
    if (!fs) return ''
    const cwd = session.meta?.cwd || session.header?.cwd
    if (!cwd) return ''
    try {
      const root = await fs.resolve('.', { cwd })
      const entries = await fs.listDir(root)
      const graph = taskText
        ? buildContextGraph(entries, taskText)
        : { relevant: selectKeyFilesForTask(taskType, entries), tests: [], symbols: [] }
      const fileNames = new Set((entries || []).filter((entry) => entry.type === 'file').map((entry) => entry.name))
      const keyFiles = graph.relevant.filter((name) => fileNames.has(name))
      const files = {}
      const fileSymbols = {}
      for (const name of keyFiles) {
        try {
          const target = await fs.resolve(name, { cwd })
          files[name] = await fs.readText(target)
          const symbols = extractSymbolsFromText(files[name])
          if (symbols.length) fileSymbols[name] = symbols
        } catch {
          // Ignore unreadable files; context collection is best-effort.
        }
      }
      let summary = buildContextSummary(entries, files, { maxTotalChars: 3000 })
      const fileSymbolEntries = Object.entries(fileSymbols)
      if (fileSymbolEntries.length) {
        summary += `\n\nFile symbols: ${fileSymbolEntries.map(([k, v]) => `${k} -> ${v.join(', ')}`).join('; ')}`
      }
      if (graph.symbols.length) {
        summary += `\n\nSuggested symbols: ${graph.symbols.join(', ')}`
      }
      if (graph.tests.length) {
        summary += `\nRelated tests: ${graph.tests.join(', ')}`
      }
      const depEntries = Object.entries(graph.dependencies || {})
      if (depEntries.length) {
        summary += `\nDependency hints: ${depEntries.map(([k, v]) => `${k} -> ${v.join(', ')}`).join('; ')}`
      }
      return summary
    } catch {
      return ''
    }
  }

  async function classifyWithLLM(text) {
    const agent = ctx.get('agent')
    const llm = ctx.get('llm') || ctx.llm
    const fallback = () => ({
      complexity: classifyComplexity(text, config),
      taskType: classifyTaskType(text),
      thinkingMode: classifyThinkingMode(text),
      confidence: heuristicComplexity(text, config).confidence,
      reasons: [],
    })
    if (!llm || !agent?.options?.provider || !agent?.options?.model) {
      return fallback()
    }
    try {
      const stream = llm.stream({
        provider: agent.options.provider,
        model: agent.options.model,
        system: 'You are a task router. Return ONLY JSON: {"task_type":"bugfix|feature|refactor|test|review|other","complexity":"plan|direct","thinking_mode":"spec|react|balanced","confidence":0-1,"reasons":["..."]}',
        messages: [{ role: 'user', content: [{ type: 'text', text: `Task: ${text}` }] }],
        maxTokens: 300,
      })
      let output = ''
      for await (const chunk of stream) {
        if (chunk.type === 'text-delta') output += chunk.text
      }
      const parsed = parseLLMClassification(output)
      if (!parsed || !parsed.complexity) return fallback()
      return {
        complexity: parsed.complexity === 'plan' || parsed.complexity === 'direct' ? parsed.complexity : classifyComplexity(text, config),
        taskType: parsed.taskType || classifyTaskType(text),
        thinkingMode: ['spec', 'react', 'balanced'].includes(parsed.thinkingMode) ? parsed.thinkingMode : classifyThinkingMode(text),
        confidence: parsed.confidence ?? 0.5,
        reasons: parsed.reasons || [],
      }
    } catch {
      return fallback()
    }
  }

  // Capture the first real user message before the first request assembles.
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'user/message') return
    const data = event.data ?? {}
    if (data.source?.kind !== 'user') return
    const text = extractText(data)
    if (!text.trim()) return

    const state = stateFor(session)
    const agent = agentFor(session)
    if (agent) agents.set(session.id, agent)

    // Manual overrides.
    const lower = text.toLowerCase()
    const directWords = ['直接做', '直接执行', '马上做', 'just do it', 'do it now']
    const planWords = ['先出方案', '先设计方案', '先规划', 'plan first', 'design first']
    if (directWords.some((w) => lower.includes(w))) {
      state.kind = 'direct'
      state.directOverride = true
      if (state.firstText === null) state.firstText = text
      if (state.taskType === null) state.taskType = classifyTaskType(text)
      if (state.thinkingMode === null) state.thinkingMode = classifyThinkingMode(text)
      if (state.riskLevel === null) state.riskLevel = estimateRisk(text).level
      if (state.planRequested) setPlanMode(agent, false)
      state.planRequested = false
      persistState(session, state)
      return
    }
    if (planWords.some((w) => lower.includes(w))) {
      state.kind = 'plan'
      state.directOverride = false
      if (state.firstText === null) state.firstText = text
      if (state.taskType === null) state.taskType = classifyTaskType(text)
      if (state.thinkingMode === null) state.thinkingMode = classifyThinkingMode(text)
      if (state.riskLevel === null) state.riskLevel = estimateRisk(text).level
      if (shouldEnterPlanMode('plan', config)) {
        state.planRequested = setPlanMode(agent, true) || true
      }
      persistState(session, state)
      return
    }

    // First real message: classify once.
    if (state.kind === null) {
      state.firstText = text
      state.taskType = classifyTaskType(text)
      state.thinkingMode = classifyThinkingMode(text)
      state.riskLevel = estimateRisk(text).level
      if (needsLLMClassification(text, config)) {
        state.pendingText = text // resolved asynchronously during first assembly
      } else {
        state.kind = classifyComplexity(text, config)
        const highRisk = ['high', 'critical'].includes(state.riskLevel)
        if (highRisk) state.kind = 'plan' // risk overrides complexity: plan + approval
        if (shouldEnterPlanMode(state.kind, config)) {
          state.planRequested = setPlanMode(agent, true) || true
        }
      }
      persistState(session, state)
    }
  })

  // Inject workflow guidance based on the routed task:
  //   - complex coding tasks: project context + code plan + TDD + delivery gate
  //   - complex non-coding tasks: project context + generic plan
  //   - direct tasks: lightweight verification before declaring done
  // When plan mode is unavailable for a plan task, also restrict tools to read-only.
  ctx.on('system-prompt/assemble', async (assembled, context, next) => {
    const result = await next()
    const agent = context.agent
    if (!agent) return result
    const state = states.get(agent.session.id)
    if (!state) return result

    // Resolve an LLM-assisted classification before assembling guidance.
    if (state.kind === null && state.pendingText && config.useLLMClassification) {
      const llm = await classifyWithLLM(state.pendingText)
      state.kind = llm.complexity
      state.taskType = llm.taskType
      state.thinkingMode = llm.thinkingMode
      if (state.riskLevel === null) state.riskLevel = estimateRisk(state.pendingText).level
      if (['high', 'critical'].includes(state.riskLevel)) state.kind = 'plan'
      delete state.pendingText
      if (shouldEnterPlanMode(state.kind, config)) {
        state.planRequested = setPlanMode(agent, true) || true
      }
      persistState(agent.session, state)
    }

    const sections = Array.isArray(result.sections) ? [...result.sections] : []
    const taskType = state.taskType || 'other'
    sections.push({
      name: 'omni-router:thinking-mode',
      order: 38,
      text: thinkingModeHint(state.thinkingMode || 'balanced'),
    })
    if (state.riskLevel) {
      sections.push({
        name: 'omni-router:risk',
        order: 37,
        text: `Risk level: ${state.riskLevel}. High or critical risk requires plan approval before mutation.`,
      })
    }
    const policyDecision = buildPolicyDecision(state.firstText || '', config)
    sections.push({
      name: 'omni-router:policy-decision',
      order: 37,
      text: `Policy decision: ${JSON.stringify(policyDecision)}`,
    })
    const policy = workflowPolicy(taskType, state.kind || 'direct', state.riskLevel || 'low')
    sections.push({
      name: 'omni-router:policy',
      order: 36,
      text: `Workflow policy: ${JSON.stringify(policy)}`,
    })
    sections.push({
      name: 'omni-router:agent',
      order: 35,
      text: `Suggested agent: ${selectAgentForTask(taskType, state.firstText || '')}`,
    })

    if (config.skillSuggestions !== false) {
      const skillsService = ctx.get('skills') || ctx.skills
      let skillCandidates = suggestSkillsForTask(taskType, state.firstText || '')
      if (skillsService?.list) {
        try {
          const available = await skillsService.list({ cwd: agent.session.header.cwd, scope: agent })
          skillCandidates = filterAvailableSkills(skillCandidates, available)
        } catch {
          // Keep static candidates if the skill service is temporarily unavailable.
        }
      }
      const skillText = buildSkillSuggestionText(skillCandidates)
      if (skillText) {
        sections.push({ name: 'omni-router:skills', order: 34, text: skillText })
      }
    }

    if (state.kind === 'plan' && state.planRequested) {
      if (state.context === undefined) {
        state.context = await getProjectContext(agent.session, taskType, state.firstText || '')
      }
      sections.push({
        name: 'omni-router:plan-template',
        order: 40,
        text: `Produce a structured plan with these sections:\n\n${planTemplateForType(taskType)}`,
      })
      if (state.context) {
        sections.push({
          name: 'omni-router:project-context',
          order: 39,
          text: state.context,
        })
      }
      const tdd = tddHintForType(taskType)
      if (tdd) {
        sections.push({ name: 'omni-router:tdd', order: 42, text: tdd })
      }
      const gate = deliveryGateHint(taskType)
      if (gate) {
        sections.push({ name: 'omni-router:delivery-gate', order: 43, text: gate })
      }
      const git = gitWorkflowHint(taskType)
      if (git) {
        sections.push({ name: 'omni-router:git-workflow', order: 44, text: git })
      }
      sections.push({
        name: 'omni-router:acceptance-checklist',
        order: 45,
        text: acceptanceChecklistHint(),
      })

      const pm = planMode()
      if (pm) return { ...result, sections } // hard gate is active; no tool filtering

      sections.push({
        name: 'omni-router:read-only-fallback',
        order: 41,
        text: `Plan mode is unavailable, so this session is restricted to read-only tools. Do not mutate any files or run mutating commands until the user explicitly confirms the plan.`,
      })
      const tools = filterReadOnlyTools(result.tools, READ_ONLY_TOOLS)
      return { ...result, sections, tools }
    }

    if (state.kind === 'direct') {
      sections.push({
        name: 'omni-router:light-verification',
        order: 40,
        text: lightVerificationHint(),
      })
      return { ...result, sections }
    }

    return result
  })

  // ---- model-facing manual controls -------------------------------------

  function registerTool(tool) {
    ctx.effect(() => ctx.tools.register({
      ...tool,
      parameters: normalizeParameters(tool.parameters),
      output: tool.output || { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    }))
  }

  registerTool({
    name: 'omni_status',
    description: 'Show Omni Router classification and plan-gate state for the current session.',
    parameters: {},
    execute() {
      const session = currentSession()
      if (!session) return 'no agent session'
      const state = states.get(session.id) || { kind: null, taskType: null, thinkingMode: null, riskLevel: null, firstText: null, planRequested: false, directOverride: false }
      return [
        `omni-router: ${state.kind || 'unclassified'}`,
        `taskType=${state.taskType || 'unknown'}`,
        `thinkingMode=${state.thinkingMode || 'balanced'}`,
        `riskLevel=${state.riskLevel || 'unknown'}`,
        `planRequested=${state.planRequested}`,
        `directOverride=${state.directOverride}`,
      ].join('\n')
    },
  })

  registerTool({
    name: 'omni_plan',
    description: 'Force the current session into plan-first mode (enter built-in plan mode).',
    parameters: {},
    execute() {
      const session = currentSession()
      const agent = session && agentFor(session)
      if (!session || !agent) return 'no agent session'
      const state = stateFor(session)
      state.kind = 'plan'
      state.directOverride = false
      state.planRequested = setPlanMode(agent, true) || true
      persistState(session, state)
      return state.planRequested ? 'Plan mode requested.' : 'Plan mode unavailable; plan-first prompt injected instead.'
    },
  })

  registerTool({
    name: 'omni_direct',
    description: 'Force the current session into direct-execution mode (leave plan mode).',
    parameters: {},
    execute() {
      const session = currentSession()
      const agent = session && agentFor(session)
      if (!session || !agent) return 'no agent session'
      const state = stateFor(session)
      state.kind = 'direct'
      state.directOverride = true
      state.planRequested = false
      setPlanMode(agent, false)
      persistState(session, state)
      return 'Direct execution mode set.'
    },
  })

  registerTool({
    name: 'omni_mode',
    description: 'Set the session thinking mode: spec (plan-first), react (direct doer), or balanced.',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['spec', 'react', 'balanced'],
          description: 'spec | react | balanced',
        },
      },
      required: ['mode'],
    },
    execute(args) {
      const session = currentSession()
      const agent = session && agentFor(session)
      if (!session || !agent) return 'no agent session'
      const mode = String(args?.mode || '').toLowerCase()
      if (!['spec', 'react', 'balanced'].includes(mode)) return 'Invalid mode. Use: spec | react | balanced'
      const state = stateFor(session)
      state.thinkingMode = mode
      persistState(session, state)
      return `Thinking mode set to ${mode}.`
    },
  })

  registerTool({
    name: 'omni_reroute',
    description: 'Reroute the current task between plan and direct. Optionally pass blastRadius (0-1) for adaptive rerouting.',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['plan', 'direct'],
          description: 'Target mode: plan or direct',
        },
        blastRadius: {
          type: 'number',
          description: '0-1 estimate of how many files/callers are affected',
        },
      },
      required: ['mode'],
    },
    execute(args) {
      const session = currentSession()
      const agent = session && agentFor(session)
      if (!session || !agent) return 'no agent session'
      const state = stateFor(session)
      const current = state.kind || 'direct'
      const target = typeof args?.blastRadius === 'number'
        ? rerouteDecision(current, { blastRadius: args.blastRadius })
        : args?.mode
      if (!target || !['plan', 'direct'].includes(target)) {
        return `No reroute needed (current=${current}).`
      }
      state.kind = target
      if (target === 'plan') {
        state.planRequested = setPlanMode(agent, true) || true
      } else {
        state.planRequested = false
        setPlanMode(agent, false)
      }
      persistState(session, state)
      return `Rerouted ${current} -> ${target}.`
    },
  })

  registerTool({
    name: 'omni_delegate',
    description: 'Run the Fable-style agent chain: builder -> qa-verifier -> (repair -> qa-verifier)* -> code-reviewer. Use for non-trivial coding tasks to get independent verification and cold review.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description (optional; uses first task text by default)' },
        criteria: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria (optional; auto-derived when absent)' },
        scope: { type: 'string', description: 'Scope boundary, e.g. "only src/payment/**"' },
        chain: { type: 'string', enum: ['full', 'auto', 'off'], description: 'full = builder+qa+reviewer with repair on fail (default); auto = direct/low skips reviewer; off = builder only' },
        maxRepairs: { type: 'number', description: 'Max repair attempts after qa FAIL (default 1, cap 3)' },
      },
    },
    async execute(args) {
      const session = currentSession()
      if (!session) return 'no agent session'
      const state = stateFor(session)
      const taskText = args?.task || state.firstText || ''
      if (!taskText.trim()) return 'No task text available. Pass a task or start a session with a task.'
      const intent = buildIntent(taskText)
      const criteria = Array.isArray(args?.criteria) && args.criteria.length
        ? args.criteria
        : intent.acceptanceCriteria
      const subagents = ctx.get('subagents') || ctx.subagents
      const agent = agentFor(session)
      if (subagents?.start && agent) {
        try {
          const outcome = await runAgentChain({ subagents, parent: agent }, {
            taskText,
            criteria,
            scope: args?.scope || '',
            chain: args?.chain || 'full',
            maxRepairs: typeof args?.maxRepairs === 'number' ? args.maxRepairs : undefined,
          })
          return outcome.report || formatChainReport({ status: outcome.status, task: taskText, criteria, stages: outcome.stages || [] })
        } catch (error) {
          return `Delegation chain failed (${error?.message || error}); falling back to delegation plan.`
        }
      }
      const taskType = state.taskType || classifyTaskType(taskText)
      const agentName = selectAgentForTask(taskType, taskText)
      const policy = workflowPolicy(taskType, state.kind || 'direct', state.riskLevel || 'low')
      return [
        `Suggested agent: ${agentName}`,
        `Subagent service available: ${subagents ? 'yes' : 'no'}`,
        `Workflow policy: ${JSON.stringify(policy)}`,
        'Delegation plan: send the task to the suggested agent with the policy attached.',
      ].join('\n')
    },
  })

  // ---- /omni command ------------------------------------------------------

  if (ctx.commands) {
    ctx.commands.register({
      name: 'omni',
      description: 'Omni Router controls: status | plan | direct | mode <spec|react|balanced> | help',
      input: { hint: 'status|plan|direct|mode <spec|react|balanced>|help' },
      handler: ({ agent, rawInput }) => {
        const session = agent?.session
        if (!session) return { kind: 'success', text: 'no agent session' }
        const state = stateFor(session)
        const cmd = (rawInput || '').trim().toLowerCase()
        if (cmd === 'status') {
          return {
            kind: 'success',
            text: [
              `omni-router: ${state.kind || 'unclassified'}`,
              `taskType=${state.taskType || 'unknown'}`,
              `thinkingMode=${state.thinkingMode || 'balanced'}`,
              `riskLevel=${state.riskLevel || 'unknown'}`,
              `planRequested=${state.planRequested}`,
              `directOverride=${state.directOverride}`,
            ].join('\n'),
          }
        }
        if (cmd === 'plan') {
          state.kind = 'plan'
          state.directOverride = false
          state.planRequested = setPlanMode(agent, true) || true
          persistState(session, state)
          return { kind: 'success', text: state.planRequested ? 'Plan mode requested.' : 'Plan mode unavailable; plan-first prompt injected instead.' }
        }
        if (cmd === 'direct') {
          state.kind = 'direct'
          state.directOverride = true
          state.planRequested = false
          setPlanMode(agent, false)
          persistState(session, state)
          return { kind: 'success', text: 'Direct execution mode set.' }
        }
        if (cmd.startsWith('mode ')) {
          const mode = cmd.slice(5).trim()
          if (!['spec', 'react', 'balanced'].includes(mode)) {
            return { kind: 'success', text: 'Invalid mode. Use: /omni mode spec | react | balanced' }
          }
          state.thinkingMode = mode
          persistState(session, state)
          return { kind: 'success', text: `Thinking mode set to ${mode}.` }
        }
        if (cmd.startsWith('reroute ')) {
          const target = cmd.slice(8).trim()
          if (!['plan', 'direct'].includes(target)) {
            return { kind: 'success', text: 'Invalid reroute. Use: /omni reroute plan | direct' }
          }
          state.kind = target
          if (target === 'plan') {
            state.planRequested = setPlanMode(agent, true) || true
          } else {
            state.planRequested = false
            setPlanMode(agent, false)
          }
          persistState(session, state)
          return { kind: 'success', text: `Rerouted to ${target}.` }
        }
        return { kind: 'success', text: 'Usage: /omni status | plan | direct | mode <spec|react|balanced> | reroute <plan|direct>' }
      },
    })
  }

  function currentSession() {
    const agent = ctx.get('agent')
    if (agent && agent.session) return agent.session
    const last = [...agents.values()].at(-1)
    return last?.session
  }
}

/** Extract plain text from a user message event payload. */
function extractText(data) {
  const content = data.content
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
  }
  if (typeof content === 'string') return content
  if (typeof data.text === 'string') return data.text
  return ''
}
