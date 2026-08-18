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

export const inject = ['systemPrompt', 'tools', 'llm']

/** Default tokens that make a task look plan-first. */
const DEFAULT_PLAN_FIRST_KEYWORDS = [
  '设计', '架构', '重构', '方案', '需求', '系统', '优化',
  'design', 'architecture', 'refactor', 'plan', 'requirement', 'spec',
]

/** Default tokens that force direct execution. */
const DEFAULT_DIRECT_KEYWORDS = [
  '直接做', '直接执行', '马上做', 'just do it', 'do it now',
]

/** Normalize user text for classification. */
function normalize(text) {
  return String(text || '').trim().toLowerCase()
}

/**
 * Classify a task text as `plan` or `direct`.
 *
 * Explicit override words win first. Otherwise a task is plan-first when it
 * contains a plan-first keyword or is long enough to be ambiguous.
 */
export function classifyComplexity(text, config = {}) {
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
    if (normalized.includes(token.toLowerCase())) return 'direct'
  }
  for (const token of planFirst) {
    if (normalized.includes(token.toLowerCase())) return 'plan'
  }

  // Very short, imperative, concrete requests are usually safe to run directly.
  if (raw.length <= 40) return 'direct'

  // Long, multi-sentence requests are more likely to hide ambiguity.
  return 'plan'
}

/**
 * Decide whether the session should enter plan mode.
 */
export function shouldEnterPlanMode(kind, config = {}) {
  if (kind !== 'plan') return false
  return config.requireConfirmation !== false
}

/**
 * Cordis plugin entry.
 */
export function apply(ctx, config = {}) {
  const states = new Map() // session.id -> { kind, planRequested, directOverride }
  const agents = new Map() // session.id -> Agent

  function stateFor(session) {
    let state = states.get(session.id)
    if (!state) {
      state = { kind: null, planRequested: false, directOverride: false }
      states.set(session.id, state)
    }
    return state
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
      if (state.planRequested) setPlanMode(agent, false)
      state.planRequested = false
      return
    }
    if (planWords.some((w) => lower.includes(w))) {
      state.kind = 'plan'
      state.directOverride = false
      if (shouldEnterPlanMode('plan', config)) {
        state.planRequested = setPlanMode(agent, true) || true
      }
      return
    }

    // First real message: classify once.
    if (state.kind === null) {
      state.kind = classifyComplexity(text, config)
      if (shouldEnterPlanMode(state.kind, config)) {
        state.planRequested = setPlanMode(agent, true) || true
      }
    }
  })

  // Soft fallback: if plan mode is unavailable, inject a plan-first instruction
  // into the system prompt so the model still produces a plan before acting.
  ctx.on('system-prompt/assemble', async (assembled, context, next) => {
    const result = await next()
    const agent = context.agent
    if (!agent) return result
    const state = states.get(agent.session.id)
    if (!state || state.kind !== 'plan' || !state.planRequested) return result
    const pm = planMode()
    if (pm) return result // hard gate is active; no extra injection needed

    const sections = Array.isArray(result.sections) ? [...result.sections] : []
    sections.push({
      name: 'omni-router:plan-first',
      order: 40,
      text: `The user's first task is complex or ambiguous. Before making any edits or running mutating commands, produce a structured plan covering: goal, scope, implementation steps, risks, and acceptance criteria. Then call ask_user_question to ask the user to confirm or adjust the plan. Do not proceed with implementation until the user explicitly confirms.`,
    })
    return { ...result, sections }
  })

  // ---- model-facing manual controls -------------------------------------

  function registerTool(tool) {
    ctx.effect(() => ctx.tools.register({
      ...tool,
      parameters: tool.parameters || {},
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
      const state = states.get(session.id) || { kind: null, planRequested: false, directOverride: false }
      return [
        `omni-router: ${state.kind || 'unclassified'}`,
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
      return 'Direct execution mode set.'
    },
  })

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
