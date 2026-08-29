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

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAgentChain, formatChainReport } from './agent-chain.mjs'
import { buildSkillSuggestionText, filterAvailableSkills, suggestSkillsForTask } from './skill-suggest.mjs'
import { buildMethodologyDirective } from './methodology.mjs'
import { isRouterStandardAvailable, routerStandardNotice } from './compat.mjs'
import {
  buildContextGraph,
  buildContextSummary,
  buildTaskContext,
  selectKeyFilesForTask,
} from './project-brain.mjs'
import { buildMission, formatMissionPlan } from './mission-planner.mjs'
import { runDagLoop } from './agent-runtime.mjs'
import { buildVisualQaPrompt, buildVisualQaStepRequirement, callVisionApi, isFrontendTask, parseVisualQaResponse } from './visual-qa.mjs'
import { createTaskDecision, buildPolicyFromTaskDecision } from './task-decision.mjs'
import { compileTaskWithLLM } from './task-compiler.mjs'
import { bindCapabilitiesToDag, createMissionDag, formatMissionDag, isMissionDagComplete } from './mission-dag.mjs'
import { generateMissionDag, roleForTask } from './planner-dag.mjs'
import { autoPopulateCapabilityBrain, createCapabilityBrain, recordCapabilityOutcome } from './capability-brain.mjs'
import { loadCapabilityManifests } from './capability-manifest.mjs'
import { capabilityToolFilter } from './capability-sandbox.mjs'
import { baselineAudit, formatCapabilityAudit, taskTimeAudit } from './capability-auditor.mjs'
import { appendCapabilityAudit, createStaticRegistryAdapter, discoverCandidates, evaluateProvisionPlan, formatProvisionResult, probeCapability, provisionCapabilities } from './capability-provisioner.mjs'
import { evaluateProviderValue, formatPerformanceRegistry, loadPerformanceRegistry, recommendDemotion, recordProvisionOutcome, savePerformanceRegistry } from './capability-performance.mjs'
import { decideIntelligenceLevel, formatIntelligenceLevel } from './progressive-intelligence.mjs'
import { bindEvidenceToCriteria, buildTaskContract, completionStatus, formatTaskContract, verifyCompletion } from './task-contract.mjs'
import { buildKernelPrompt } from './kernel-prompt.mjs'
import { decideIntervention, formatInterventionGate, interventionForIntelligenceLevel } from './intervention-gate.mjs'
import { createOmniTaskState, formatOmniTaskState } from './omni-task-state.mjs'
import { compileMissionToHost, toMissionIR } from './mission-ir.mjs'
import { createDshHostAdapter } from './host/dsh-adapter.mjs'
import { negotiateHost, formatHostNegotiation } from './host-interface.mjs'
import { requiredTrustForRisk, omniEventToEvidenceRecord } from './evidence-trust.mjs'
import { buildProgressiveContext } from './context-expansion.mjs'
import { buildDynamicContext } from './dynamic-context.mjs'
import { classifyFailure } from './failure-taxonomy.mjs'
import { retrieveContext } from './hybrid-retrieval.mjs'
import { formatMemory, recordDecision, recordFailure, recordProject, recordTrajectory, summarizeMemory } from './memory.mjs'
import { createMemoryEngine, loadMemoryEngine, saveMemoryEngine } from './memory-engine.mjs'
import { captureEvidence, createEvidenceStore, evidenceSummary } from './evidence-store.mjs'
import { evidencePass, extractHarnessEvidence } from './evidence.mjs'
import { adaptEvidenceFromProvider } from './evidence-adapter.mjs'
import { recordMissionRecovery } from './recovery-telemetry.mjs'
import { listMissionStates, loadMissionState, saveMissionState } from './mission-resume.mjs'
import { collectResults, formatResultSummary, importBenchmarkRecord, missingTaskIds, summarizeResults } from './benchmark-results.mjs'
import { buildAstGraph, collectSourceFiles } from './ast-provider.mjs'

export {
  buildContextGraph,
  buildContextSummary,
  buildDependencyHints,
  buildProjectBrain,
  buildRepositorySnapshot,
  buildTaskContext,
  detectConventions,
  discoverRelevantFiles,
  extractSymbolsFromText,
  selectKeyFilesForTask,
  suggestSymbolsForTask,
} from './project-brain.mjs'

export const name = 'omni-router'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const inject = ['systemPrompt', 'tools', 'llm', 'commands', 'skills']

/** Default tokens that make a task look plan-first. */
const DEFAULT_PLAN_FIRST_KEYWORDS = [
  // Generic engineering / structural signals only. Business vocabulary was
  // removed on purpose (Intervention Diet): Omni must not infer complexity
  // from domain nouns.
  '设计', '架构', '重构', '方案', '需求', '系统', '分析',
  '改造', '迁移', '升级', '多语言', '国际化', '幂等', '并发',
  '事务', '一致性', '分布式', '状态机', '兼容性', '协议', '安全',
  '权限', '认证', '性能', '可扩展', '回滚', '重试', '超时', '限流',
  'WebSocket', '重连', '通知',
  'design', 'architecture', 'refactor', 'plan', 'requirement', 'spec',
]

/** Default tokens that force direct execution. */
const DEFAULT_DIRECT_KEYWORDS = [
  '直接做', '直接执行', '马上做', 'just do it', 'do it now',
]

/** Strong signals that a task is a concrete direct action (medium-high confidence). */
const STRONG_DIRECT_HINTS = ['修复', '修一下', 'bug', 'fix', '删掉', '运行测试', '跑测试']

/** For fix/delete tasks, these signals indicate the bug is complex enough to plan first. */
const COMPLEX_FIX_KEYWORDS = [
  // Generic concurrency/consistency/state signals only (Intervention Diet).
  '并发', '回滚', '幂等', '协议版本', '协议不兼容', '状态机', '分布式', '超时',
  '事务', '一致性', '重复处理', '重复发送', '重复执行', '消息丢失', '对账', '网关',
  '迁移', '升级', '批量导入', '批量导出', '权限控制', '权限校验', '权限模型',
  '状态管理', '安全', '认证', '性能', '推送延迟', '验签', '签名',
]

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

  const hasStrongDirect = STRONG_DIRECT_HINTS.some((token) => normalized.includes(token))
  if (hasStrongDirect) {
    const complexFix = COMPLEX_FIX_KEYWORDS.some((token) => normalized.includes(token))
    return complexFix
      ? { value: 'plan', confidence: 0.88 }
      : { value: 'direct', confidence: 0.85 }
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
        memory: data.memory || null,
        taskDecision: data.taskDecision || null,
        taskDecisionVersion: data.taskDecisionVersion || null,
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
  if (/(新增|新做|做一个|增加|实现|加|添加|接入|支持|feature|add|开发|引入)/.test(normalized)) return 'feature'
  if (/(重构|refactor|重写|优化|优化一下|改善|改进|提升|升级|迁移|改造|更换|替换|切换|改为|改成)/.test(normalized)) return 'refactor'
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

  // When no explicit mode word is present, infer from the same strong signals
  // used by complexity classification. Generic short requests stay balanced.
  for (const token of DEFAULT_PLAN_FIRST_KEYWORDS) {
    if (normalized.includes(token.toLowerCase())) return 'spec'
  }
  for (const token of DEFAULT_DIRECT_KEYWORDS) {
    if (normalized.includes(token.toLowerCase())) return 'react'
  }
  for (const token of STRONG_DIRECT_HINTS) {
    if (normalized.includes(token)) return 'react'
  }
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
 * Estimate task risk from text heuristics.
 * Complexity and risk are intentionally separate dimensions.
 */
export function estimateRisk(text) {
  const normalized = normalize(String(text || ''))
  const reasons = []
  if (/(生产环境|production|prod|密钥|secret|token|drop database|drop table|rm -rf)/.test(normalized)) {
    reasons.push('production/secret/destructive')
  }
  if (/(schema|migration|drop table|drop database|连接池|auth|deploy|ci\/cd|配置|config|Webhook|验签|签名|对账|网关|退款|扣款|删除.*(数据库|字段|表|生产|配置|auth|用户)|删掉.*(数据库|字段|表|生产|配置|auth|用户))/.test(normalized)) {
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
export function buildPolicyDecision(taskText, config = {}, decision = null) {
  const d = decision || createTaskDecision({
    taskText,
    taskType: classifyTaskType(taskText),
    complexity: classifyComplexity(taskText, config),
    risk: estimateRisk(taskText).level,
    thinkingMode: classifyThinkingMode(taskText),
  })
  return buildPolicyFromTaskDecision(d)
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
  // Core Feature Freeze: default model-visible Omni surface includes the
  // reliability controls and capability auto-provisioning (out-of-box).
  const PUBLIC_OMNI_TOOLS = new Set([
    'omni_status',
    'omni_explain',
    'omni_doctor',
    'omni_capability_audit',
    'omni_capability_provision',
    'omni_capability_probe',
  ])

  function ctxGet(key) {
    try {
      if (typeof ctx.get === 'function') {
        const value = ctx.get(key)
        if (value !== undefined) return value
      }
    } catch {
      // Not injected or not available; fall back to direct property access.
    }
    try {
      return ctx[key]
    } catch {
      return undefined
    }
  }

  // Out-of-box capability provisioning: a curated set of well-known DSH
  // programming skills/plugins. This is a bootstrap/fallback only; the
  // authoritative "what plugin provides X" answer belongs to dsh-market/hub.
  const DEFAULT_CAPABILITY_REGISTRY = [
    { id: 'superpowers-dsh', package: 'superpowers-dsh', type: 'plugin', provides: ['tdd', 'debugging', 'planning', 'executing-plans'], verified: true, risk: 'low', reliability: 0.9 },
    { id: 'dsh-doublecheck', package: 'dsh-doublecheck', type: 'plugin', provides: ['verification', 'delivery-proof', 'code.review'], verified: true, risk: 'low', reliability: 0.9 },
    { id: 'dsh-trio', package: 'dsh-trio', type: 'plugin', provides: ['browser.automation', 'browser.screenshot', 'github.remote', 'gitlab.remote'], verified: true, risk: 'low', reliability: 0.85 },
    { id: 'dsh-router-standard', package: 'dsh-router-standard', type: 'plugin', provides: ['persona.routing', 'attention.routing', 'progressive-disclosure'], verified: true, risk: 'low', reliability: 0.85 },
    { id: 'dsh-plugins-store', package: 'dsh-plugins-store', type: 'plugin', provides: ['plugin.discovery', 'plugin.install'], verified: true, risk: 'medium', reliability: 0.8 },
    { id: 'dsh.fish', package: 'dsh.fish', type: 'plugin', provides: ['hub.discovery', 'hub.install'], verified: true, risk: 'medium', reliability: 0.8 },
    { id: 'dsh-community-plugins', package: 'dsh-community-plugins', type: 'plugin', provides: ['skill.discovery'], verified: true, risk: 'medium', reliability: 0.8 },
  ]

  const capabilityProvisioning = {
    enabled: true,
    // Safety first: detect and recommend gaps, but do NOT auto-install
    // third-party code unless the user explicitly opts into auto-trusted.
    mode: 'recommend',
    maxTaskPlugins: 1,
    maxPermanentManagedPlugins: 5,
    trustedSources: [
      'https://github.com/DshMarketPlace/dsh-plugins-store',
      'https://github.com/stvlynn/dsh.fish',
      'https://github.com/HubaKing/dsh-community-plugins',
      'https://github.com/qwe225380/dsh-omni-router',
    ],
    registry: DEFAULT_CAPABILITY_REGISTRY,
    ...(config.capabilityProvisioning || {}),
  }

  async function defaultCapabilityExecutor({ type, candidate, profile, txn } = {}) {
    const pkg = candidate?.package || candidate?.id || txn?.package
    if (!pkg) return false
    const command = type === 'rollback'
      ? (txn?.rollbackCommand || `dsh plugin --profile ${profile || 'web'} remove ${pkg}`)
      : (candidate?.installCommand || `dsh plugin --profile ${profile || 'web'} add ${pkg}`)
    const commands = ctxGet('commands') || ctxGet('shell')
    try {
      if (typeof commands?.run === 'function') {
        await commands.run(command)
        return true
      }
      if (typeof commands?.exec === 'function') {
        await commands.exec(command)
        return true
      }
      const { execSync } = await import('node:child_process')
      execSync(command, { stdio: 'pipe', timeout: 120000 })
      return true
    } catch {
      return false
    }
  }

  const states = new Map() // session.id -> { kind, planRequested, directOverride }
  const agents = new Map() // session.id -> Agent

  function readPersistedState(session) {
    return readStateFromEvents(session.events)
  }

  function stateFor(session) {
    let state = states.get(session.id)
    if (!state) {
      state = readPersistedState(session) || { kind: null, taskType: null, thinkingMode: null, riskLevel: null, firstText: null, planRequested: false, directOverride: false, memory: null, taskDecision: null }
      if (!state.memory) {
        const cwd = session.meta?.cwd || session.header?.cwd
        state.memory = cwd ? loadMemoryEngine(cwd) : createMemoryEngine()
      }
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
        memory: state.memory || null,
        taskDecision: state.taskDecision || null,
        taskDecisionVersion: state.taskDecision?.version || state.taskDecisionVersion || null,
      })
    } catch {
      // Persistence is best-effort; the in-memory state still works.
    }
    try {
      const cwd = session.meta?.cwd || session.header?.cwd
      if (cwd && state.memory) saveMemoryEngine(cwd, state.memory)
    } catch {
      // Disk persistence is best-effort.
    }
  }

  function agentFor(session) {
    const current = ctxGet('agent')
    if (current && current.session === session) return current
    return agents.get(session.id)
  }

  async function collectToolNames(toolsService) {
    if (!toolsService) return []
    if (Array.isArray(toolsService)) {
      return toolsService.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
    }
    for (const method of ['list', 'names', 'keys']) {
      if (typeof toolsService[method] !== 'function') continue
      try {
        const raw = await toolsService[method]()
        if (Array.isArray(raw)) {
          return raw.map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
        }
      } catch { /* try next */ }
    }
    return []
  }

  function buildCanonicalOmniState(state) {
    const decision = state.taskDecision || createTaskDecision({
      taskText: state.firstText || '',
      taskType: state.taskType || 'other',
      complexity: state.kind === 'plan' ? 'plan' : state.kind === 'direct' ? 'direct' : 'balanced',
      risk: state.riskLevel || 'low',
      thinkingMode: state.thinkingMode || 'balanced',
    })
    const intelligence = decideIntelligenceLevel(decision)
    const contract = buildTaskContract({ taskText: state.firstText || '', decision })
    const intervention = interventionForIntelligenceLevel(intelligence)
    // Frontend/design tasks need assist-level design acceptance + focused
    // context even when the raw complexity looks low.
    if (isFrontendTask(state.firstText || '') && intervention.mode === 'noop') {
      intervention.mode = 'assist'
      intervention.utility = 0.15
      intervention.expectedGain = 0.1
      intervention.reasons = ['frontend/design task: assist with design acceptance and focused context']
    }
    const hostCaps = {
      workflow: !!(ctxGet('workflow') ),
      approvals: !!(ctxGet('approvals') ),
      skills: !!(ctxGet('skills') ),
      plugins: !!(ctxGet('plugins') ),
      subagents: !!(ctxGet('subagents') ),
      toolEvents: !!(ctxGet('events') ),
      testEvents: false,
      fileEvents: !!(ctxGet('fs') ),
    }
    return createOmniTaskState({
      contract,
      intervention,
      host: negotiateHost(hostCaps),
    })
  }

  function planMode() {
    return ctxGet('planMode')  || undefined
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
    const fs = ctxGet('fs') 
    if (!fs) return ''
    const cwd = session.meta?.cwd || session.header?.cwd
    if (!cwd) return ''
    try {
      const root = await fs.resolve('.', { cwd })
      const rootEntries = await fs.listDir(root)
      // Recursive scan: seed nested source files so context is not limited to
      // root entries (real projects keep code under src/packages/tests).
      const nestedFiles = collectSourceFiles(cwd, { limit: 100 })
      const nestedEntries = Object.keys(nestedFiles).map((abs) => ({
        name: path.relative(cwd, abs).replace(/\\/g, '/'),
        type: 'file',
      }))
      const entries = [...rootEntries]
      for (const e of nestedEntries) {
        if (!entries.some((x) => x.name === e.name)) entries.push(e)
      }
      const files = {}
      for (const [abs, content] of Object.entries(nestedFiles)) {
        files[path.relative(cwd, abs).replace(/\\/g, '/')] = content
      }
      const initialGraph = taskText
        ? buildContextGraph(entries, taskText)
        : { relevant: selectKeyFilesForTask(taskType, entries), tests: [], symbols: [] }
      const fileNames = new Set((entries || []).filter((entry) => entry.type === 'file').map((entry) => entry.name))
      const readFile = async (name) => {
        if (files[name] !== undefined) return
        try {
          const target = await fs.resolve(name, { cwd })
          files[name] = await fs.readText(target)
        } catch {
          // Ignore unreadable files; context collection is best-effort.
        }
      }
      const keyFiles = initialGraph.relevant.filter((name) => fileNames.has(name)).slice(0, 12)
      for (const name of keyFiles) await readFile(name)

      if (taskText) {
        let graphAdj = null
        const buildGraphAdj = async () => {
          try {
            const ast = await buildAstGraph(files)
            const adj = {}
            for (const edge of ast.edges || []) {
              if (!adj[edge.from]) adj[edge.from] = []
              adj[edge.from].push({ to: edge.to, kind: edge.kind })
            }
            graphAdj = adj
          } catch {
            graphAdj = null
          }
        }
        await buildGraphAdj()
        const retrieval = retrieveContext(taskText, entries, files, { graph: graphAdj })
        const ranked = retrieval.candidates.map((c) => c.name).filter((name) => fileNames.has(name))
        for (const name of ranked) await readFile(name)
        await buildGraphAdj()

        const ctxBudget = buildContextBudget(classifyComplexity(taskText, config), estimateRisk(taskText).level)
        const maxFiles = Math.max(8, Math.min(30, Math.floor((ctxBudget.retrievalBudget || 5000) / 2000)))
        if (config.progressiveContext !== false) {
          const dynamic = buildDynamicContext(taskText, entries, files, {
            level: Number(config.contextExpansionLevel) || 2,
            uncertainty: Number(config.contextUncertainty) || 0.6,
            maxFiles,
            maxFileChars: 2000,
            maxContextTokens: ctxBudget.retrievalBudget,
            graph: graphAdj,
          })
          return dynamic.context
        }
        return buildTaskContext(taskText, entries, files, { maxTotalChars: Math.max(8000, ctxBudget.retrievalBudget) })
      }
      return buildContextSummary(entries, files, { maxTotalChars: 5000 })
    } catch {
      return ''
    }
  }

  async function classifyWithLLM(text) {
    const agent = ctxGet('agent')
    const llm = ctxGet('llm') 
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
        state.taskDecision = createTaskDecision({
          taskText: text,
          taskType: state.taskType,
          complexity: state.kind,
          risk: state.riskLevel,
          thinkingMode: state.thinkingMode,
        })
        state.omniTaskState = buildCanonicalOmniState(state)
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
      state.taskDecision = createTaskDecision({
        taskText: state.pendingText,
        taskType: state.taskType,
        complexity: state.kind,
        risk: state.riskLevel,
        thinkingMode: state.thinkingMode,
      })
      state.omniTaskState = buildCanonicalOmniState(state)
      delete state.pendingText
      if (shouldEnterPlanMode(state.kind, config)) {
        state.planRequested = setPlanMode(agent, true) || true
      }
      persistState(agent.session, state)
    }

    const sections = Array.isArray(result.sections) ? [...result.sections] : []
    const taskType = state.taskType || 'other'
    const toolsService = ctxGet('tools') 
    const routerStandard = isRouterStandardAvailable(toolsService, agent)
    if (routerStandard) {
      sections.push({
        name: 'omni-router:compat',
        order: 38,
        text: routerStandardNotice(),
      })
    } else {
      // Final Kernel Prompt: one section, three parts. NOOP truly exits.
      const omniState = state.omniTaskState || buildCanonicalOmniState(state)
      const contract = omniState.contract
      const manualPlanGate = state.kind === 'plan' && state.planRequested
      if (omniState.intervention.mode === 'noop' && !manualPlanGate) {
        return result
      }
      if (omniState.intervention.mode !== 'noop') {
        if (state.context === undefined && contract.intelligenceLevel !== 'L0') {
          state.context = await getProjectContext(agent.session, taskType, state.firstText || '')
        }
        sections.push({
          name: 'omni:task-contract',
          order: 38,
          text: buildKernelPrompt({ contract, contextCapsule: state.context || '' }),
        })
      }
    }

    if (state.kind === 'plan' && state.planRequested) {
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

    return { ...result, sections }
  })

  // ---- model-facing manual controls -------------------------------------

  function registerTool(tool) {
    const developerMode = config.developerMode === true || config.exposeDeveloperTools === true
    if (!developerMode && !PUBLIC_OMNI_TOOLS.has(tool.name)) return
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
      const agent = agentFor(session)
      const state = states.get(session.id) || { kind: null, taskType: null, thinkingMode: null, riskLevel: null, firstText: null, planRequested: false, directOverride: false }
      const routerStandard = agent ? isRouterStandardAvailable(ctxGet('tools') , agent) : false
      const omniState = state.omniTaskState || buildCanonicalOmniState(state)
      const contract = omniState.contract
      const intervention = omniState.intervention
      const completion = completionStatus(contract, omniState.evidence || [])
      return [
        `omni-router: ${state.kind || 'unclassified'}`,
        `taskType=${state.taskType || 'unknown'}`,
        `thinkingMode=${state.thinkingMode || 'balanced'}`,
        `riskLevel=${state.riskLevel || 'unknown'}`,
        `intelligenceLevel=${contract.intelligenceLevel || 'L0'}`,
        `intervention=${intervention.mode || 'noop'} (utility=${intervention.utility ?? 0})`,
        `hostMode=${omniState.host?.mode || 'unknown'}`,
        `completion=${completion.status} (${completion.proof.verifiedCount}/${completion.proof.requiredCount})`,
        `planRequested=${state.planRequested}`,
        `directOverride=${state.directOverride}`,
        `routerStandard=${routerStandard ? 'delegated' : 'not-detected'}`,
      ].join('\n')
    },
  })

  registerTool({
    name: 'omni_explain',
    description: 'Explain why Omni chose the current mode, capabilities, verification level, and what is needed for completion.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional topic to focus on: mode, capabilities, verification, completion' },
      },
    },
    execute(args) {
      const session = currentSession()
      if (!session) return 'no agent session'
      const state = states.get(session.id) || {}
      const omniState = state.omniTaskState || buildCanonicalOmniState(state)
      const contract = omniState.contract
      const intervention = omniState.intervention
      const trust = requiredTrustForRisk(contract.risk)
      const completion = completionStatus(contract, omniState.evidence || [])
      const topic = String(args?.topic || '').toLowerCase()
      const lines = [
        `Mode: ${contract.intelligenceLevel} (${intervention.mode})`,
        `Why: risk=${contract.risk}, uncertainty=${contract.uncertainty}`,
        `Reasoning effort: ${contract.reasoningEffort}`,
        `Verification: ${contract.verificationPolicy?.level}`,
        `Approval required: ${contract.verificationPolicy?.approvalRequired ? 'yes' : 'no'}`,
        `Capabilities needed: ${(contract.requiredCapabilities || []).join(', ') || 'native tools'}`,
        `Evidence trust required: ${trust.label}`,
        `Completion status: ${completion.status} (${completion.proof.verifiedCount}/${completion.proof.requiredCount})`,
        `Completion requires: ${contract.acceptance?.map((c) => c.text || c).join('; ') || 'light verification'}`,
      ]
      if (topic === 'mode' || topic === 'capabilities' || topic === 'verification' || topic === 'completion') {
        const idx = lines.findIndex((l) => l.toLowerCase().startsWith(topic))
        return idx >= 0 ? lines[idx] : lines.join('\n')
      }
      return lines.join('\n')
    },
  })

  registerTool({
    name: 'omni_doctor',
    description: 'Run a quick environment/capability/project-index health check.',
    parameters: {},
    async execute() {
      const session = currentSession()
      const toolsService = ctxGet('tools') 
      const toolNames = await collectToolNames(toolsService)
      let brain = autoPopulateCapabilityBrain(createCapabilityBrain(), toolNames)
      brain = loadCapabilityManifests(brain, config.capabilityManifests || [])
      const baseline = baselineAudit(brain)
      const fs = ctxGet('fs') 
      const dshAdapter = createDshHostAdapter(ctx)
      const host = negotiateHost(dshAdapter.describeHost())
      const lines = [
        `DSH session: ${session ? 'ok' : 'missing'}`,
        `Tools registered: ${toolNames.length}`,
        `Baseline capability coverage: ${baseline.available.length}/${baseline.required.length}`,
        `Missing baseline: ${baseline.missing.join(', ') || '(none)'}`,
        `ProjectIndex: ${fs ? 'available' : 'unavailable'}`,
        `Evidence hooks: ${ctxGet('evidence')  ? 'available' : 'not-detected'}`,
        `Host negotiation: ${host.mode} (degraded: ${host.degraded.join(', ') || 'none'})`,
      ]
      return lines.join('\n')
    },
  })

  registerTool({
    name: 'omni_memory',
    description: 'View or update Omni session memory. Actions: status, add (with type=project|decision|failure|trajectory and text), clear.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'add', 'clear'], description: 'status | add | clear' },
        type: { type: 'string', enum: ['project', 'decision', 'failure', 'trajectory'], description: 'Memory section for add' },
        text: { type: 'string', description: 'Memory entry text for add' },
      },
      required: ['action'],
    },
    execute(args) {
      const session = currentSession()
      if (!session) return 'no agent session'
      const state = stateFor(session)
      const action = String(args?.action || 'status').toLowerCase()
      if (action === 'clear') {
        state.memory = createMemoryEngine()
        persistState(session, state)
        return 'Memory cleared.'
      }
      if (action === 'add') {
        const type = String(args?.type || '').toLowerCase()
        const text = String(args?.text || '').trim()
        if (!['project', 'decision', 'failure', 'trajectory'].includes(type) || !text) {
          return 'Usage: omni_memory action=add type=project|decision|failure|trajectory text=<entry>'
        }
        if (type === 'project') state.memory = recordProject(state.memory, text)
        else if (type === 'decision') state.memory = recordDecision(state.memory, text)
        else if (type === 'failure') state.memory = recordFailure(state.memory, text)
        else state.memory = recordTrajectory(state.memory, text)
        persistState(session, state)
        return `Memory ${type} added.`
      }
      return formatMemory(state.memory)
    },
  })

  registerTool({
    name: 'omni_visual_check',
    description: 'Run visual QA on a screenshot using a vision model API. Pass a local screenshot path (from browser_screenshot) and optional requirement. Configure visionApiUrl/visionApiKey/visionModel in Omni config or pass them as arguments.',
    parameters: {
      type: 'object',
      properties: {
        screenshotPath: { type: 'string', description: 'Absolute path to a PNG screenshot produced by browser_screenshot' },
        requirement: { type: 'string', description: 'What the UI should look like / what to verify' },
        apiUrl: { type: 'string', description: 'OpenAI-compatible vision endpoint (optional)' },
        apiKey: { type: 'string', description: 'Vision API key (optional)' },
        model: { type: 'string', description: 'Vision model id (optional)' },
      },
      required: ['screenshotPath'],
    },
    async execute(args) {
      const screenshotPath = String(args?.screenshotPath || '').trim()
      if (!screenshotPath) return 'screenshotPath is required.'
      if (!fs.existsSync(screenshotPath)) return `Screenshot not found: ${screenshotPath}`
      const apiUrl = args?.apiUrl || config.visionApiUrl || process.env.VISION_API_URL
      const apiKey = args?.apiKey || config.visionApiKey || process.env.VISION_API_KEY
      const model = args?.model || config.visionModel || process.env.VISION_MODEL
      if (!apiUrl || !apiKey || !model) {
        return 'Vision API not configured. Set visionApiUrl/visionApiKey/visionModel in Omni config, or pass apiUrl/apiKey/model args.'
      }
      try {
        const imageBase64 = fs.readFileSync(screenshotPath).toString('base64')
        const prompt = buildVisualQaPrompt(args?.requirement || '')
        const output = await callVisionApi({ apiUrl, apiKey, model, imageBase64, prompt })
        const parsed = parseVisualQaResponse(output)
        const lines = [
          `Visual QA verdict: ${parsed.verdict}`,
          `Screenshot: ${screenshotPath}`,
          `Model: ${model}`,
        ]
        if (parsed.findings.length) {
          lines.push('', 'Findings:', ...parsed.findings.map((f) => `- ${f}`))
        }
        lines.push('', 'Raw response:', parsed.raw)
        return lines.join('\n')
      } catch (error) {
        return `Visual QA failed: ${error?.message || error}`
      }
    },
  })

  registerTool({
    name: 'omni_benchmark',
    description: 'Collect a real agent-run benchmark result for one task and arm (raw or omni). Writes JSON to benchmark/results/<arm>/<taskId>.json.',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Stable task id, e.g. real-001' },
        arm: { type: 'string', enum: ['raw', 'omni'], description: 'raw = no Omni guidance; omni = with Omni control-plane guidance' },
        task: { type: 'string', description: 'Task description' },
        criteria: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria' },
        level: { type: 'string', description: 'Optional benchmark level, e.g. L3 Small feature' },
      },
      required: ['taskId', 'arm', 'task'],
    },
    async execute(args) {
      const session = currentSession()
      const agent = session && agentFor(session)
      const subagents = ctxGet('subagents') 
      if (!session || !agent || !subagents?.start) return 'Benchmark collection requires an active session with subagents.'
      const taskId = String(args?.taskId || '').trim()
      const arm = String(args?.arm || '').toLowerCase()
      const task = String(args?.task || '').trim()
      const criteria = Array.isArray(args?.criteria) ? args.criteria.filter(Boolean) : ['task completed', 'relevant checks pass']
      const level = String(args?.level || 'L1 Single-file')
      if (!taskId || !['raw', 'omni'].includes(arm) || !task) return 'Usage: taskId, arm (raw|omni), task are required.'

      const taskType = classifyTaskType(task)
      const prompt = arm === 'raw'
        ? `Task:\n${task}\n\nAcceptance criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}\n\nWork on the task. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`
        : `Task:\n${task}\n\nAcceptance criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}\n\n${buildMethodologyDirective(taskType)}\n\nMission skeleton:\n${formatMissionPlan(buildMission(task, { taskType }))}\n\nVerification: run the relevant checks and report evidence before replying. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`

      const start = Date.now()
      try {
        const run = await subagents.start('spawn', {
          label: `benchmark-${taskId}-${arm}`,
          prompt: [{ type: 'text', text: prompt }],
          parent: agent,
          maxDepth: 1,
        })
        const result = await run.result
        const output = (Array.isArray(result.output) ? result.output : [])
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('')
        try { await run.dispose() } catch { /* best-effort */ }
        const success = /BENCHMARK:\s*PASS/i.test(output)
        const record = {
          id: taskId,
          arm,
          task,
          criteria,
          level,
          success,
          firstPass: success ? 1 : 0,
          finalPass: success ? 1 : 0,
          regressionRate: 0,
          humanInterventions: 0,
          toolCalls: 0,
          repairCount: 0,
          failureRecoveryRate: success ? 1 : 0,
          tokens: 0,
          cost: 0,
          durationMs: Date.now() - start,
          output: output.slice(0, 2000),
        }
        const cwd = session.meta?.cwd || session.header?.cwd
        let saved = ''
        if (cwd) {
          try {
            const dir = path.join(cwd, 'benchmark', 'results', arm)
            fs.mkdirSync(dir, { recursive: true })
            const file = path.join(dir, `${taskId}.json`)
            fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8')
            saved = file
          } catch (error) {
            saved = `save-failed: ${error?.message || error}`
          }
        }
        return `Collected ${arm} result for ${taskId}: ${success ? 'PASS' : 'FAIL'} (${Date.now() - start}ms)\nSaved: ${saved || '(no cwd)'}`
      } catch (error) {
        return `Benchmark run failed: ${error?.message || error}`
      }
    },
  })

  registerTool({
    name: 'omni_benchmark_all',
    description: 'Run all tasks from benchmark/real-tasks.json in the current workspace for one arm (raw or omni) and save results.',
    parameters: {
      type: 'object',
      properties: {
        arm: { type: 'string', enum: ['raw', 'omni'], description: 'raw or omni' },
        maxParallel: { type: 'number', description: 'How many benchmark subagents to run concurrently (default 1)' },
      },
      required: ['arm'],
    },
    async execute(args) {
      const session = currentSession()
      const agent = session && agentFor(session)
      const subagents = ctxGet('subagents') 
      if (!session || !agent || !subagents?.start) return 'Benchmark batch requires an active session with subagents.'
      const arm = String(args?.arm || '').toLowerCase()
      if (!['raw', 'omni'].includes(arm)) return 'arm must be raw or omni.'
      const cwd = session.meta?.cwd || session.header?.cwd
      if (!cwd) return 'No workspace cwd found.'
      const tasksPath = path.join(cwd, 'benchmark', 'real-tasks.json')
      const bundledTasksPath = path.join(__dirname, '..', 'benchmark', 'real-tasks.json')
      const resolvedTasksPath = fs.existsSync(tasksPath) ? tasksPath : bundledTasksPath
      if (!fs.existsSync(resolvedTasksPath)) return `real-tasks.json not found in workspace (${tasksPath}) or bundle (${bundledTasksPath})`
      const tasks = JSON.parse(fs.readFileSync(resolvedTasksPath, 'utf8'))
      const maxParallel = Math.max(1, Number(args?.maxParallel) || 1)
      const results = []
      const runOne = async (t) => {
        const task = String(t.task || '')
        const criteria = Array.isArray(t.criteria) ? t.criteria : []
        const prompt = arm === 'raw'
          ? `Task:\n${task}\n\nAcceptance criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}\n\nWork on the task. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`
          : `Task:\n${task}\n\nAcceptance criteria:\n${criteria.map((c) => `- ${c}`).join('\n')}\n\n${buildMethodologyDirective(classifyTaskType(task))}\n\nVerification: run relevant checks and report evidence. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`
        try {
          const start = Date.now()
          const run = await subagents.start('spawn', {
            label: `benchmark-${t.id}-${arm}`,
            prompt: [{ type: 'text', text: prompt }],
            parent: agent,
            maxDepth: 1,
          })
          const result = await run.result
          const output = (Array.isArray(result.output) ? result.output : [])
            .filter((block) => block?.type === 'text' && typeof block.text === 'string')
            .map((block) => block.text)
            .join('')
          try { await run.dispose() } catch { /* best-effort */ }
          const success = /BENCHMARK:\s*PASS/i.test(output)
          const record = {
            id: t.id, arm, task, criteria, level: t.level || 'L1 Single-file', success,
            firstPass: success ? 1 : 0, finalPass: success ? 1 : 0, regressionRate: 0,
            humanInterventions: 0, toolCalls: 0, repairCount: 0, failureRecoveryRate: success ? 1 : 0,
            tokens: 0, cost: 0, durationMs: Date.now() - start, output: output.slice(0, 2000),
          }
          const dir = path.join(cwd, 'benchmark', 'results', arm)
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, `${t.id}.json`), JSON.stringify(record, null, 2), 'utf8')
          results.push(`${t.id}: ${success ? 'PASS' : 'FAIL'}`)
        } catch (error) {
          results.push(`${t.id}: ERROR ${error?.message || error}`)
        }
      }
      for (let i = 0; i < tasks.length; i += maxParallel) {
        const batch = tasks.slice(i, i + maxParallel)
        await Promise.all(batch.map((t) => runOne(t)))
      }
      return `Benchmark batch (${arm}) complete:\n${results.join('\n')}`
    },
  })

  registerTool({
    name: 'omni_benchmark_status',
    description: 'Show collected OmniBench result counts, coverage, and missing task ids for raw/omni arms.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute() {
      const session = currentSession()
      const cwd = session?.meta?.cwd || session?.header?.cwd
      if (!cwd) return 'No workspace cwd found.'
      const resultsRoot = path.join(cwd, 'benchmark', 'results')
      const groups = collectResults(resultsRoot)
      const summary = summarizeResults(groups)
      const tasksPath = path.join(cwd, 'benchmark', 'real-tasks.json')
      const bundledTasksPath = path.join(__dirname, '..', 'benchmark', 'real-tasks.json')
      const tasks = fs.existsSync(tasksPath)
        ? JSON.parse(fs.readFileSync(tasksPath, 'utf8'))
        : fs.existsSync(bundledTasksPath)
          ? JSON.parse(fs.readFileSync(bundledTasksPath, 'utf8'))
          : []
      const missing = missingTaskIds(resultsRoot, tasks)
      const lines = [formatResultSummary(summary), '']
      if (missing.length) {
        lines.push(`Missing pairs (${missing.length}):`)
        for (const m of missing) lines.push(`- ${m.id}: raw=${m.raw ? 'yes' : 'no'} omni=${m.omni ? 'yes' : 'no'}`)
      } else {
        lines.push('All known real tasks have both raw and omni results.')
      }
      return lines.join('\n')
    },
  })

  registerTool({
    name: 'omni_benchmark_import',
    description: 'Import one or more real OmniBench result records into benchmark/results/<arm>/. Useful for pasting runs collected in another DSH session.',
    parameters: {
      type: 'object',
      properties: {
        records: { type: 'array', items: { type: 'object' }, description: 'Array of result records; each requires id, arm, task, success.' },
        record: { type: 'object', description: 'Single result record; alternative to records.' },
        arm: { type: 'string', enum: ['raw', 'omni'], description: 'Arm override when importing a single record without arm.' },
      },
    },
    async execute(args) {
      const session = currentSession()
      const cwd = session?.meta?.cwd || session?.header?.cwd
      if (!cwd) return 'No workspace cwd found.'
      const resultsRoot = path.join(cwd, 'benchmark', 'results')
      const list = Array.isArray(args?.records) ? args.records : (args?.record ? [args.record] : [])
      if (!list.length) return 'Provide record or records.'
      const imported = []
      const errors = []
      for (const rec of list) {
        const record = { ...rec }
        if (args?.arm && !record.arm) record.arm = args.arm
        try {
          const file = importBenchmarkRecord(resultsRoot, record)
          imported.push(file)
        } catch (error) {
          errors.push(`${record?.id || '?'}: ${error?.message || error}`)
        }
      }
      const lines = [`Imported ${imported.length} record(s).`]
      if (imported.length) lines.push(...imported.map((f) => `- ${f}`))
      if (errors.length) lines.push('Errors:', ...errors)
      return lines.join('\n')
    },
  })

  registerTool({
    name: 'omni_ast_scan',
    description: 'Scan source files in the workspace with Tree-sitter (or lightweight fallback) and return graph/definition statistics.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of source files to scan (default 200)' },
      },
    },
    async execute(args) {
      const session = currentSession()
      const cwd = session?.meta?.cwd || session?.header?.cwd
      if (!cwd) return 'No workspace cwd found.'
      const files = collectSourceFiles(cwd, { limit: Number(args?.limit) || 200 })
      if (!Object.keys(files).length) return 'No supported source files found to scan.'
      const graph = await buildAstGraph(files)
      const defCount = Object.values(graph.files || {}).reduce((sum, info) => sum + (info.definitions?.length || 0), 0)
      const lines = [
        `AST scan: ${Object.keys(files).length} files, ${graph.edges.length} edges, ${defCount} definitions`,
        '',
      ]
      const byKind = {}
      for (const edge of graph.edges.slice(0, 20)) {
        byKind[edge.kind] = (byKind[edge.kind] || 0) + 1
        lines.push(`- ${edge.from} ${edge.kind}-> ${edge.to}`)
      }
      if (graph.edges.length > 20) lines.push(`… and ${graph.edges.length - 20} more edges`)
      lines.push('', 'Edge kinds:', Object.entries(byKind).map(([k, v]) => `${k}=${v}`).join(', '))
      return lines.join('\n')
    },
  })

  async function createMissionExecutor({ session, agent, subagents, task, taskType, frontend, brief, capabilityBrain, evidenceRecords, resumeKey, contract: contractArg }) {
    const cwd = session?.meta?.cwd || session?.header?.cwd
    let brain = capabilityBrain

    const saveProgress = async (snapshot = {}) => {
      if (!cwd || !resumeKey) return
      const dag = snapshot.dag
      saveMissionState(cwd, resumeKey, {
        status: dag ? (isMissionDagComplete(dag) ? 'completed' : 'active') : 'active',
        dag,
        evidence: evidenceRecords,
        metrics: snapshot.metrics || {},
        capabilityBrain: brain,
        brief,
        task,
        taskType,
        savedAt: new Date().toISOString(),
      })
    }

    const contract = contractArg || buildTaskContract({
      taskText: task,
      decision: createTaskDecision({ taskText: task, taskType, complexity: 'plan', risk: 'low' }),
      acceptance: brief.acceptanceCriteria,
    })

    const act = async (action) => {
      const goal = action.task?.goal || action.taskId || ''
      const visualQa = frontend && /validate|verify|visual|ui/i.test(goal) && config.autoVisualQA !== false
        ? `\n\n${buildVisualQaStepRequirement()}`
        : ''
      const taskContext = await getProjectContext(session, taskType, goal).catch(() => '')
      const prompt = `${buildKernelPrompt({
        contract: { ...contract, objective: `${task} — Task ${action.taskId}: ${goal}` },
        contextCapsule: taskContext || '',
      })}${visualQa}`
      const role = roleForTask(action.task || {})
      const sandbox = capabilityToolFilter(brain, action.task?.requiredCapabilities || [], role)
      const run = await subagents.start('spawn', {
        label: `mission-${action.taskId}`,
        prompt: [{ type: 'text', text: prompt }],
        parent: agent,
        maxDepth: 1,
        ...(sandbox.allow.length || sandbox.deny.length ? { toolFilter: sandbox } : {}),
      })
      const result = await run.result
      const output = (Array.isArray(result.output) ? result.output : [])
        .filter((block) => block?.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('')
      try { await run.dispose() } catch { /* best-effort */ }

      const harness = extractHarnessEvidence({ ...result, output })
      const hasStructured = harness.commands.length > 0 || harness.tests.length > 0 || harness.files.length > 0 || harness.findings.length > 0
      const trustOk = ['T2', 'T3', 'T4'].includes(harness.trustLevel)
      const taskAcceptanceText = action.task?.acceptance?.[0]
      const criterion = contract.acceptance?.find((c) => c.text === taskAcceptanceText || c.id === taskAcceptanceText) || contract.acceptance?.[0]
      const criterionId = criterion?.id || action.taskId
      let record
      if (hasStructured) {
        record = {
          id: `E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          type: 'harness',
          source: action.taskId,
          criterionId,
          kind: harness.tests?.length ? 'test.pass' : harness.commands?.length ? 'command' : 'tool',
          artifacts: (harness.files || []).map((f) => f.file).filter(Boolean),
          subject: action.task?.goal || '',
          value: output.slice(0, 2000),
          ok: trustOk && evidencePass(harness),
          trustLevel: harness.trustLevel || 'T0',
          evidence: harness,
          at: new Date().toISOString(),
        }
      } else {
        const captured = captureEvidence({ entries: evidenceRecords }, {
          type: 'agent_output',
          source: action.taskId,
          criterionId,
          value: output.slice(0, 2000),
          ok: false,
          trustLevel: 'T0',
        })
        record = captured.record
      }
      evidenceRecords.push(record)
      return {
        output,
        evidenceId: record.id,
        evidence: harness,
        hasStructuredEvidence: hasStructured,
        tokenUsage: result?.tokenUsage ?? result?.usage?.totalTokens ?? 0,
        cost: result?.cost ?? 0,
        toolCalls: result?.toolCalls ?? result?.usage?.toolCalls ?? 0,
      }
    }

    const observe = async (result, _current, action) => {
      const goal = action?.task?.goal || ''
      const needsVisual = frontend && /validate|verify|visual|ui/i.test(goal) && config.autoVisualQA !== false
      if (needsVisual && !/VISUAL_QA:\s*PASS/i.test(result.output || '')) return { type: 'test_failure', reason: 'visual QA failed' }

      const harness = result.evidence || {}
      const hasStructured = result.hasStructuredEvidence === true || harness.commands?.length || harness.tests?.length || harness.files?.length || harness.findings?.length
      if (hasStructured) {
        const passed = evidencePass(harness)
        const trustOk = ['T2', 'T3', 'T4'].includes(harness.trustLevel)
        if (!passed || !trustOk) {
          brain = recordCapabilityOutcome(brain, action?.task?.allowedTools?.[0], false)
          return {
            type: passed ? 'verification_needed' : 'test_failure',
            reason: passed ? `evidence trust ${harness.trustLevel || 'T0'} insufficient for completion` : 'structured harness evidence failed',
            evidence: harness,
          }
        }
        brain = recordCapabilityOutcome(brain, action?.task?.allowedTools?.[0], true)
        return { type: 'step_done', evidence: harness }
      }

      // Coding tasks never accept model self-reported PASS: T2/T3 evidence is required.
      if (['bugfix', 'feature', 'refactor', 'test'].includes(taskType)) {
        brain = recordCapabilityOutcome(brain, action?.task?.allowedTools?.[0], false)
        return { type: 'verification_needed', reason: 'coding task requires T2/T3 harness evidence' }
      }

      if (/FAIL|error|失败|not ok/i.test(result.output || '')) {
        const failure = classifyFailure({ type: 'unknown', reason: result.output || '' })
        brain = recordCapabilityOutcome(brain, action?.task?.allowedTools?.[0], false)
        return { type: failure.category, reason: failure.recovery, detail: String(result.output || '').slice(0, 500) }
      }
      brain = recordCapabilityOutcome(brain, action?.task?.allowedTools?.[0], true)
      return { type: 'step_done' }
    }

    return { act, observe, saveProgress, getCapabilityBrain: () => brain }
  }

  registerTool({
    name: 'omni_capability_audit',
    description: 'Audit current Harness capabilities against the Omni Coding Baseline or task requirements.',
    parameters: {
      type: 'object',
      properties: {
        requirements: { type: 'array', items: { type: 'string' }, description: 'Optional task capability requirements' },
        baseline: { type: 'boolean', description: 'Run baseline audit when no requirements are given (default true)' },
      },
    },
    async execute(args) {
      const session = currentSession()
      const toolsService = ctxGet('tools') 
      const toolNames = await collectToolNames(toolsService)
      let brain = autoPopulateCapabilityBrain(createCapabilityBrain(), toolNames)
      brain = loadCapabilityManifests(brain, config.capabilityManifests || [])
      const requirements = Array.isArray(args?.requirements) ? args.requirements.map(String).filter(Boolean) : []
      const audit = requirements.length ? taskTimeAudit(brain, requirements) : baselineAudit(brain)
      return formatCapabilityAudit(audit)
    },
  })

  registerTool({
    name: 'omni_capability_provision',
    description: 'Detect missing capabilities, discover candidate plugins/skills, evaluate a minimal set, and optionally provision after approval/dry-run.',
    parameters: {
      type: 'object',
      properties: {
        requirements: { type: 'array', items: { type: 'string' }, description: 'Task capability requirements (preferred)' },
        missing: { type: 'array', items: { type: 'string' }, description: 'Explicit missing capabilities (alternative to requirements)' },
        mode: { type: 'string', enum: ['recommend', 'auto-trusted', 'manual'], description: 'Provisioning trust mode (default auto-trusted)' },
        dryRun: { type: 'boolean', description: 'Only evaluate and print the plan (default true)' },
        maxPlugins: { type: 'number', description: 'Maximum plugins to install for this task (default 2)' },
        profile: { type: 'string', description: 'DSH profile to provision into (default web)' },
      },
      required: [],
    },
    async execute(args) {
      const session = currentSession()
      const toolsService = ctxGet('tools') 
      const toolNames = await collectToolNames(toolsService)
      let brain = autoPopulateCapabilityBrain(createCapabilityBrain(), toolNames)
      brain = loadCapabilityManifests(brain, config.capabilityManifests || [])
      const provisioning = capabilityProvisioning
      const requirements = Array.isArray(args?.requirements) ? args.requirements.map(String).filter(Boolean) : []
      const explicitMissing = Array.isArray(args?.missing) ? args.missing.map(String).filter(Boolean) : []
      const missing = explicitMissing.length
        ? explicitMissing
        : requirements.length
          ? taskTimeAudit(brain, requirements).missing
          : baselineAudit(brain).missing

      if (!missing.length) return 'No missing capabilities detected.'

      const adapters = [
        createStaticRegistryAdapter(provisioning.registry || []),
        ...(Array.isArray(provisioning.adapters) ? provisioning.adapters : []),
      ]
      const candidates = await discoverCandidates(missing, adapters)
      if (!candidates.length) {
        return `No candidate providers found for: ${missing.join(', ')}`
      }

      const mode = args?.mode || provisioning.mode || 'auto-trusted'
      const plan = evaluateProvisionPlan(missing, candidates, brain, {
        mode,
        maxPlugins: Number(args?.maxPlugins ?? provisioning.maxTaskPlugins ?? 2),
        trustedSources: provisioning.trustedSources || [],
      })

      const lines = [
        `Missing (${missing.length}): ${missing.join(', ')}`,
        `Candidates (${candidates.length}):`,
        ...candidates.map((c) => `- ${c.id || c.package}: ${(c.provides || []).join(', ')}${c.verified ? ' [verified]' : ''}`),
        '',
        `Selected minimal set (${plan.selected.length}):`,
        ...plan.selected.map((s) => `- ${s.candidate.id} score=${s.score}`),
        `Requires approval: ${plan.requiresApproval.map((s) => s.candidate.id).join(', ') || '(none)'}`,
        `Still missing: ${plan.solution.missing.join(', ') || '(none)'}`,
      ]

      if (args?.dryRun !== false) {
        lines.push('', 'Dry run: no changes made. Set dryRun:false to provision (requires trusted mode + executor).')
        return lines.join('\n')
      }

      const result = await provisionCapabilities(plan, {
        mode,
        profile: args?.profile || provisioning.profile || 'web',
        trustedSources: provisioning.trustedSources || [],
        execute: provisioning.execute || defaultCapabilityExecutor,
        probeTools: toolNames,
        probeSkills: provisioning.probeSkills || [],
      })
      const cwd = session?.meta?.cwd || session?.header?.cwd
      const installed = (result.results || []).filter((r) => r.status === 'ready')
      if (cwd && installed.length) {
        for (const r of installed) {
          appendCapabilityAudit(cwd, {
            taskId: session.id,
            capabilityGap: missing,
            provider: r.candidate?.id,
            package: r.candidate?.package || r.candidate?.id,
            version: r.candidate?.version,
            source: r.candidate?.source,
            reason: plan.missing?.join(', ') || '',
            approvedBy: mode,
            installedAt: new Date().toISOString(),
            probeResult: r.probe?.ok ?? null,
          })
        }
      }
      lines.push('', 'Provision result:')
      lines.push(formatProvisionResult(result))
      if (installed.length) {
        lines.push(`\nOmni added during this task (${installed.length}):`)
        for (const r of installed) {
          lines.push(`- ${r.candidate?.package || r.candidate?.id} (reason: ${plan.missing?.join(', ') || 'capability gap'})`)
        }
      }
      return lines.join('\n')
    },
  })

  registerTool({
    name: 'omni_capability_probe',
    description: 'Probe whether an installed provider actually exposes its expected tools/skills.',
    parameters: {
      type: 'object',
      properties: {
        provider: { type: 'string', description: 'Provider id in the Capability Brain' },
        expectedTools: { type: 'array', items: { type: 'string' }, description: 'Tool names the provider should expose' },
        expectedSkills: { type: 'array', items: { type: 'string' }, description: 'Skill names the provider should expose' },
      },
      required: ['provider'],
    },
    async execute(args) {
      const session = currentSession()
      const toolsService = ctxGet('tools') 
      const toolNames = await collectToolNames(toolsService)
      let brain = autoPopulateCapabilityBrain(createCapabilityBrain(), toolNames)
      brain = loadCapabilityManifests(brain, config.capabilityManifests || [])
      const provider = (brain.capabilities || []).find((c) => c.id === args?.provider)
      if (!provider) return `Provider "${args?.provider}" not found in Capability Brain.`
      const probe = await probeCapability(
        { ...provider, expectedTools: args?.expectedTools || [], expectedSkills: args?.expectedSkills || [] },
        { tools: toolNames, skills: capabilityProvisioning.probeSkills || [] },
      )
      const lines = [`Probe ${args.provider}: ${probe.ok ? 'READY' : 'BROKEN'}`]
      for (const check of probe.checks) lines.push(`- ${check.ok ? '✓' : '✗'} ${check.type} ${check.name}`)
      return lines.join('\n')
    },
  })

  registerTool({
    name: 'omni_capability_performance',
    description: 'Track and inspect whether provisioned plugins/skills measurably improve task success, false completion, tokens, or tool errors.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'record', 'recommend'], description: 'Action (default list)' },
        provider: { type: 'string', description: 'Provider id' },
        successBefore: { type: 'number', description: 'Task success before provisioning' },
        successAfter: { type: 'number', description: 'Task success after provisioning' },
        falseCompletionBefore: { type: 'number', description: 'False completion rate before' },
        falseCompletionAfter: { type: 'number', description: 'False completion rate after' },
        tokensBefore: { type: 'number', description: 'Token usage before' },
        tokensAfter: { type: 'number', description: 'Token usage after' },
        toolErrorsBefore: { type: 'number', description: 'Tool errors before' },
        toolErrorsAfter: { type: 'number', description: 'Tool errors after' },
        usageDays: { type: 'number', description: 'Days since last use (for recommend)' },
        uniqueCapabilities: { type: 'number', description: 'Number of unique capabilities (for recommend)' },
        coveredBy: { type: 'array', items: { type: 'string' }, description: 'Other providers covering the same capabilities (for recommend)' },
      },
      required: [],
    },
    async execute(args) {
      const session = currentSession()
      const cwd = session?.meta?.cwd || session?.header?.cwd
      if (!cwd) return 'No workspace cwd found.'
      const action = args?.action || 'list'
      let registry = loadPerformanceRegistry(cwd)
      if (action === 'record') {
        if (!args?.provider) return 'provider is required for record.'
        registry = recordProvisionOutcome(registry, args.provider, {
          successBefore: args.successBefore,
          successAfter: args.successAfter,
          falseCompletionBefore: args.falseCompletionBefore,
          falseCompletionAfter: args.falseCompletionAfter,
          tokensBefore: args.tokensBefore,
          tokensAfter: args.tokensAfter,
          toolErrorsBefore: args.toolErrorsBefore,
          toolErrorsAfter: args.toolErrorsAfter,
        })
        const file = savePerformanceRegistry(cwd, registry)
        const value = evaluateProviderValue(registry.providers[args.provider])
        return `Recorded ${args.provider}: ${value.label} (${value.value})\nSaved: ${file}`
      }
      if (action === 'recommend') {
        if (!args?.provider) return 'provider is required for recommend.'
        const rec = recommendDemotion(registry, args.provider, {
          usageDays: Number(args.usageDays) || 0,
          uniqueCapabilities: Number(args.uniqueCapabilities) || 0,
          coveredBy: Array.isArray(args.coveredBy) ? args.coveredBy : [],
        })
        return `${rec.providerId}: ${rec.recommendation} — ${rec.reason}`
      }
      return formatPerformanceRegistry(registry)
    },
  })

  registerTool({
    name: 'omni_mission_run',
    description: 'Run a Mission Planner loop with real subagents: Observe → Think → Act → Replan until completed or maxSteps.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Mission task description' },
        taskType: { type: 'string', enum: ['bugfix', 'feature', 'refactor', 'test', 'review', 'other'], description: 'Optional task type' },
        maxSteps: { type: 'number', description: 'Max loop steps (default 20)' },
        maxParallel: { type: 'number', description: 'Max tasks to run concurrently (default 1)' },
        maxTokens: { type: 'number', description: 'Max token budget (0 = unlimited)' },
        maxCost: { type: 'number', description: 'Max cost budget (0 = unlimited)' },
        maxToolCalls: { type: 'number', description: 'Max tool calls (0 = unlimited)' },
        maxRepairs: { type: 'number', description: 'Max repairs before blocking (0 = unlimited)' },
        maxReplans: { type: 'number', description: 'Max replans before blocking (0 = unlimited)' },
        maxWallClockMs: { type: 'number', description: 'Max wall-clock time in ms (0 = unlimited)' },
      },
      required: ['task'],
    },
    async execute(args) {
      const session = currentSession()
      const agent = session && agentFor(session)
      const subagents = ctxGet('subagents') 
      if (!session || !agent || !subagents?.start) return 'Mission run requires an active session with subagents.'
      const task = String(args?.task || '').trim()
      if (!task) return 'Task is required.'
      const taskType = args?.taskType || classifyTaskType(task)
      const maxSteps = Number(args?.maxSteps) || 20
      const frontend = isFrontendTask(task)
      const mission = buildMission(task, { taskType })
      const brief = await compileTaskWithLLM(task, { llm: ctxGet('llm') , agent })

      const toolsService = ctxGet('tools') 
      const toolNames = await collectToolNames(toolsService)
      let capabilityBrain = autoPopulateCapabilityBrain(createCapabilityBrain(), toolNames)
      capabilityBrain = loadCapabilityManifests(capabilityBrain, config.capabilityManifests || [])
      const dag = bindCapabilitiesToDag(generateMissionDag(mission, brief, { taskType }), capabilityBrain)
      const evidenceRecords = []
      const cwd = session?.meta?.cwd || session?.header?.cwd
      const resumeKey = cwd ? `mission-${Date.now().toString(36)}` : null
      const contract = buildTaskContract({
        taskText: task,
        decision: createTaskDecision({ taskText: task, taskType, complexity: 'plan', risk: 'low' }),
        acceptance: brief.acceptanceCriteria,
      })
      const executor = await createMissionExecutor({
        session,
        agent,
        subagents,
        task,
        taskType,
        frontend,
        brief,
        capabilityBrain,
        evidenceRecords,
        resumeKey,
        contract,
      })

      const finalDag = await runDagLoop(dag, {
        act: executor.act,
        observe: executor.observe,
        onProgress: executor.saveProgress,
        maxSteps,
        maxParallel: Number(args?.maxParallel) || 1,
        maxTokens: Number(args?.maxTokens) || 0,
        maxCost: Number(args?.maxCost) || 0,
        maxToolCalls: Number(args?.maxToolCalls) || 0,
        maxRepairs: Number(args?.maxRepairs) || 0,
        maxReplans: Number(args?.maxReplans) || 0,
        maxWallClockMs: Number(args?.maxWallClockMs) || 0,
      })
      capabilityBrain = executor.getCapabilityBrain()

      const metrics = finalDag.metrics || {}
      const evSummary = evidenceSummary({ entries: evidenceRecords })
      let resumeInfo = ''
      if (cwd && resumeKey) {
        const saved = saveMissionState(cwd, resumeKey, {
          status: finalDag.status,
          dag: finalDag.dag,
          evidence: evidenceRecords,
          metrics,
          capabilityBrain,
          brief,
          task,
          taskType,
          savedAt: new Date().toISOString(),
        })
        resumeInfo = `\nSaved mission state: ${saved}`
      }
      const currentRevision = createDshHostAdapter(ctx).getWorkspaceRevision(session.id)
      if (cwd) {
        recordMissionRecovery(cwd, { taskId: session.id, actions: finalDag.actions, outcome: finalDag.status === 'done' ? 'success' : 'failed' })
      }
      const proof = verifyCompletion(contract, bindEvidenceToCriteria(contract, evidenceRecords), { currentRevision })
      return [
        `Mission run: ${finalDag.status}`,
        `Proof of completion: ${proof.verifiedCount}/${proof.requiredCount} criteria verified${proof.missing.length ? ` (missing: ${proof.missing.join(', ')})` : ''}`,
        `Tasks done: ${finalDag.dag.tasks.filter((t) => t.status === 'done').length}/${finalDag.dag.tasks.length}`,
        `Steps: ${finalDag.actions.length}`,
        `Replans: ${metrics.replanCount || 0}, Repairs: ${metrics.repairCount || 0}, ToolCalls: ${metrics.toolCalls || 0}, Tokens: ${metrics.tokenUsage || 0}, Cost: ${metrics.cost || 0}`,
        `Evidence captured: ${evSummary.total} (failed=${evSummary.failed})`,
        `Mission: ${task}`,
        resumeInfo,
        '',
        formatMissionDag(finalDag.dag),
      ].join('\n')
    },
  })

  registerTool({
    name: 'omni_mission_resume',
    description: 'Resume a saved Mission DAG from .omni/missions/<key>.json. Without a key, lists saved missions.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Saved mission state key (from omni_mission_run output)' },
        maxSteps: { type: 'number', description: 'Max additional loop steps (default 20)' },
        maxParallel: { type: 'number', description: 'Max tasks to run concurrently (default 1)' },
        maxTokens: { type: 'number', description: 'Max token budget for the resumed portion (0 = unlimited)' },
        maxCost: { type: 'number', description: 'Max cost budget for the resumed portion (0 = unlimited)' },
        maxToolCalls: { type: 'number', description: 'Max tool calls for the resumed portion (0 = unlimited)' },
        maxRepairs: { type: 'number', description: 'Max repairs before blocking (0 = unlimited)' },
        maxReplans: { type: 'number', description: 'Max replans before blocking (0 = unlimited)' },
        maxWallClockMs: { type: 'number', description: 'Max wall-clock time in ms (0 = unlimited)' },
      },
      required: [],
    },
    async execute(args) {
      const session = currentSession()
      const agent = session && agentFor(session)
      const subagents = ctxGet('subagents') 
      const cwd = session?.meta?.cwd || session?.header?.cwd
      if (!cwd) return 'No workspace cwd found.'
      const key = String(args?.key || '').trim()
      if (!key) {
        const keys = listMissionStates(cwd)
        return keys.length
          ? `Saved missions:\n${keys.map((k) => `- ${k}`).join('\n')}\n\nPass "key" to resume one.`
          : 'No saved missions found in .omni/missions.'
      }
      const saved = loadMissionState(cwd, key)
      if (!saved) {
        const keys = listMissionStates(cwd)
        return `No saved mission found for key "${key}". Available: ${keys.join(', ') || '(none)'}`
      }
      if (saved.status === 'completed') return `Mission "${key}" is already completed.`
      if (!session || !agent || !subagents?.start) return 'Mission resume requires an active session with subagents.'

      const task = saved.task || saved.dag?.mission?.task || ''
      const taskType = saved.taskType || classifyTaskType(task)
      const frontend = isFrontendTask(task)
      const brief = saved.brief || { objective: task, acceptanceCriteria: [] }
      const evidenceRecords = Array.isArray(saved.evidence) ? saved.evidence : []
      const toolsService = ctxGet('tools') 
      let capabilityBrain = saved.capabilityBrain || autoPopulateCapabilityBrain(createCapabilityBrain(), await collectToolNames(toolsService))
      capabilityBrain = loadCapabilityManifests(capabilityBrain, config.capabilityManifests || [])
      const contract = buildTaskContract({
        taskText: task,
        decision: createTaskDecision({ taskText: task, taskType, complexity: 'plan', risk: 'low' }),
        acceptance: brief.acceptanceCriteria,
      })

      const executor = await createMissionExecutor({
        session,
        agent,
        subagents,
        task,
        taskType,
        frontend,
        brief,
        capabilityBrain,
        evidenceRecords,
        resumeKey: key,
        contract,
      })

      const finalDag = await runDagLoop(saved.dag, {
        act: executor.act,
        observe: executor.observe,
        onProgress: executor.saveProgress,
        maxSteps: Number(args?.maxSteps) || 20,
        maxParallel: Number(args?.maxParallel) || 1,
        maxTokens: Number(args?.maxTokens) || 0,
        maxCost: Number(args?.maxCost) || 0,
        maxToolCalls: Number(args?.maxToolCalls) || 0,
        maxRepairs: Number(args?.maxRepairs) || 0,
        maxReplans: Number(args?.maxReplans) || 0,
        maxWallClockMs: Number(args?.maxWallClockMs) || 0,
      })

      const metrics = finalDag.metrics || {}
      saveMissionState(cwd, key, {
        status: finalDag.status,
        dag: finalDag.dag,
        evidence: evidenceRecords,
        metrics,
        capabilityBrain: executor.getCapabilityBrain(),
        brief,
        task,
        taskType,
        savedAt: new Date().toISOString(),
      })
      const evSummary = evidenceSummary({ entries: evidenceRecords })
      const currentRevision = createDshHostAdapter(ctx).getWorkspaceRevision(session.id)
      const proof = verifyCompletion(contract, bindEvidenceToCriteria(contract, evidenceRecords), { currentRevision })
      return [
        `Mission resume: ${finalDag.status}`,
        `Proof of completion: ${proof.verifiedCount}/${proof.requiredCount} criteria verified${proof.missing.length ? ` (missing: ${proof.missing.join(', ')})` : ''}`,
        `Tasks done: ${finalDag.dag.tasks.filter((t) => t.status === 'done').length}/${finalDag.dag.tasks.length}`,
        `Additional steps: ${finalDag.actions.length}`,
        `Replans: ${metrics.replanCount || 0}, Repairs: ${metrics.repairCount || 0}, ToolCalls: ${metrics.toolCalls || 0}, Tokens: ${metrics.tokenUsage || 0}, Cost: ${metrics.cost || 0}`,
        `Evidence captured: ${evSummary.total} (failed=${evSummary.failed})`,
        `Mission: ${task}`,
        '',
        formatMissionDag(finalDag.dag),
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
      const toolsService = ctxGet('tools') 
      if (isRouterStandardAvailable(toolsService, agent)) {
        return 'router-standard owns reasoning-mode routing. Use dev_router_mode <spec|weak|react|...> instead.'
      }
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
      const subagents = ctxGet('subagents') 
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
          const routerStandard = isRouterStandardAvailable(ctxGet('tools') , agent)
          return {
            kind: 'success',
            text: [
              `omni-router: ${state.kind || 'unclassified'}`,
              `taskType=${state.taskType || 'unknown'}`,
              `thinkingMode=${state.thinkingMode || 'balanced'}`,
              `riskLevel=${state.riskLevel || 'unknown'}`,
              `planRequested=${state.planRequested}`,
              `directOverride=${state.directOverride}`,
              `routerStandard=${routerStandard ? 'delegated' : 'not-detected'}`,
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
          const toolsService = ctxGet('tools') 
          if (isRouterStandardAvailable(toolsService, agent)) {
            return { kind: 'success', text: 'router-standard owns reasoning-mode routing. Use /dev_router_mode or dev_router_mode <spec|weak|react|...> instead.' }
          }
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
    const agent = ctxGet('agent')
    if (agent && agent.session) return agent.session
    const last = [...agents.values()].at(-1)
    return last?.session
  }

  // Default-path completion bridge:
  // DSH events -> OmniEvent -> Evidence Record -> OmniTaskState.evidence
  // This makes "Proven when done" machine-enforced even when the host executes
  // normally and Omni only injects a Kernel Prompt.
  const hostBridge = createDshHostAdapter(ctx)
  hostBridge.subscribeEvents((event) => {
    const st = event.sessionId ? states.get(event.sessionId) : null
    if (!st) return
    if (!st.omniTaskState) st.omniTaskState = buildCanonicalOmniState(st)
    if (!Array.isArray(st.omniTaskState.evidence)) st.omniTaskState.evidence = []
    const payload = event.payload || {}
    const external = payload.provider || payload.delivery || payload.status || payload.verifier === true
    const record = external
      ? adaptEvidenceFromProvider({ provider: payload.provider || event.host || 'provider', result: payload })
      : omniEventToEvidenceRecord(event)
    if (record) st.omniTaskState.evidence.push(record)
  })
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