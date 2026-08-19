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

export const name = 'omni-router'

export const inject = ['systemPrompt', 'tools', 'llm', 'commands']

/** Default tokens that make a task look plan-first. */
const DEFAULT_PLAN_FIRST_KEYWORDS = [
  '设计', '架构', '重构', '方案', '需求', '系统', '优化',
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
  for (const token of STRONG_DIRECT_HINTS) {
    if (normalized.includes(token)) return { value: 'direct', confidence: 0.85 }
  }

  // Short keyword-less requests: likely direct, but ambiguous enough to let an
  // LLM override when confidence-based fallback is enabled.
  if (raw.length <= 20) return { value: 'direct', confidence: 0.6 }
  if (raw.length <= 40) return { value: 'direct', confidence: 0.7 }

  // Long requests are more likely to hide ambiguity.
  return { value: 'plan', confidence: 0.6 }
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
  if (kind !== 'plan') return false
  return config.requireConfirmation !== false
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
  if (/(新增|新做|做一个|实现|feature|add|开发)/.test(normalized)) return 'feature'
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
 * Return a TDD hint for coding task types. Non-coding types get an empty string.
 */
export function tddHintForType(type) {
  if (!['bugfix', 'feature', 'refactor', 'test'].includes(type)) return ''
  return 'Use TDD: write a failing test first (red), run it to confirm it fails, implement the change, then run it again to see it pass (green). If a red-green-tdd or test-driven-development skill is available, load and follow it.'
}

/**
 * Return a delivery-gate hint that prevents "claiming done without proof".
 */
export function deliveryGateHint(type = 'other') {
  const coding = ['bugfix', 'feature', 'refactor', 'test'].includes(type)
  if (!coding) return ''
  return 'Before declaring the task done, run the delivery/quality gate: verify requirements, test evidence, implementation consistency, and review conclusion. If dsh-doublecheck tools are available (doublecheck_report, doublecheck_spec, etc.), use them; otherwise perform the same checks manually. If any red item remains, report rework required instead of done.'
}

/**
 * Return a lightweight verification hint for direct/simple tasks.
 */
export function lightVerificationHint() {
  return 'This is a direct task. After making changes, run a lightweight verification before declaring done: run the relevant tests or at least a syntax/type check. If a check fails, fix it before reporting completion.'
}

/**
 * Return a hint that turns plan acceptance criteria into a trackable checklist.
 */
export function acceptanceChecklistHint() {
  return 'After the plan is approved, use todo_write to create a checklist from the acceptance criteria. Track each item during execution and mark it done only when the corresponding verification passes.'
}

/**
 * Return Git workflow guidance for coding tasks.
 */
export function gitWorkflowHint(type) {
  if (!['bugfix', 'feature', 'refactor', 'test'].includes(type)) return ''
  return 'Use a clean Git workflow: create or switch to a focused feature branch (or worktree), keep the change scoped, write a conventional commit message (feat/fix/refactor/test), and review the diff before finishing.'
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
      state = readPersistedState(session) || { kind: null, taskType: null, thinkingMode: null, planRequested: false, directOverride: false }
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

  async function getProjectContext(session, taskType = 'other') {
    const fs = ctx.get('fs') || ctx.fs
    if (!fs) return ''
    const cwd = session.meta?.cwd || session.header?.cwd
    if (!cwd) return ''
    try {
      const root = await fs.resolve('.', { cwd })
      const entries = await fs.listDir(root)
      const keyFiles = selectKeyFilesForTask(taskType, entries)
      const files = {}
      for (const name of keyFiles) {
        try {
          const target = await fs.resolve(name, { cwd })
          files[name] = await fs.readText(target)
        } catch {
          // Ignore unreadable files; context collection is best-effort.
        }
      }
      return buildContextSummary(entries, files, { maxTotalChars: 3000 })
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
      if (state.taskType === null) state.taskType = classifyTaskType(text)
      if (state.thinkingMode === null) state.thinkingMode = classifyThinkingMode(text)
      if (state.planRequested) setPlanMode(agent, false)
      state.planRequested = false
      persistState(session, state)
      return
    }
    if (planWords.some((w) => lower.includes(w))) {
      state.kind = 'plan'
      state.directOverride = false
      if (state.taskType === null) state.taskType = classifyTaskType(text)
      if (state.thinkingMode === null) state.thinkingMode = classifyThinkingMode(text)
      if (shouldEnterPlanMode('plan', config)) {
        state.planRequested = setPlanMode(agent, true) || true
      }
      persistState(session, state)
      return
    }

    // First real message: classify once.
    if (state.kind === null) {
      state.taskType = classifyTaskType(text)
      state.thinkingMode = classifyThinkingMode(text)
      if (needsLLMClassification(text, config)) {
        state.pendingText = text // resolved asynchronously during first assembly
      } else {
        state.kind = classifyComplexity(text, config)
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

    if (state.kind === 'plan' && state.planRequested) {
      if (state.context === undefined) {
        state.context = await getProjectContext(agent.session, taskType)
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
      const state = states.get(session.id) || { kind: null, taskType: null, thinkingMode: null, planRequested: false, directOverride: false }
      return [
        `omni-router: ${state.kind || 'unclassified'}`,
        `taskType=${state.taskType || 'unknown'}`,
        `thinkingMode=${state.thinkingMode || 'balanced'}`,
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
        return { kind: 'success', text: 'Usage: /omni status | plan | direct | mode <spec|react|balanced>' }
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
