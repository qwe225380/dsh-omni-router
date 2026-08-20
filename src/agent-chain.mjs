/**
 * Fable-style agent orchestration chain.
 *
 * Pure helpers + runtime orchestration for omni_delegate:
 *   builder -> qa-verifier -> (repair -> qa-verifier)* -> code-reviewer
 *
 * Subagents are one-shot and spawned fresh, so qa-verifier and code-reviewer
 * never see the builder's reasoning trace (cold review).
 */

import { buildJudgePrompt, isJudgePass } from './judge.mjs'

const DEFAULT_MAX_REPAIRS = 1
const MAX_REPAIR_CAP = 3

export function clampRepairs(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return DEFAULT_MAX_REPAIRS
  return Math.max(0, Math.min(MAX_REPAIR_CAP, Math.floor(n)))
}

export function normalizeChain(value) {
  return ['full', 'auto', 'off'].includes(value) ? value : 'full'
}

export function formatCriteria(criteria) {
  const list = Array.isArray(criteria) ? criteria.filter(Boolean) : []
  if (!list.length) return '- task is implemented as requested\n- relevant tests pass\n- no regressions or out-of-scope changes'
  return list.map((c) => `- ${c}`).join('\n')
}

export function defaultCriteria(taskText) {
  const text = String(taskText || '')
  if (/(bug|fix|修复|报错|错误|崩溃|500)/i.test(text)) {
    return ['bug is reproduced and fixed', 'regression test passes', 'no new regressions']
  }
  if (/(feature|新增|新做|做一个|实现|增加)/i.test(text)) {
    return ['requested feature exists', 'relevant tests pass', 'no regressions or out-of-scope changes']
  }
  if (/(refactor|重构|优化)/i.test(text)) {
    return ['observable behavior is preserved', 'existing tests pass', 'no public API change unless stated']
  }
  return ['task is completed as requested', 'no regressions or out-of-scope changes']
}

/**
 * Build the chain plan.
 * - full: builder -> qa-verifier -> code-reviewer (repair runs only on qa FAIL)
 * - auto: direct/low -> builder -> qa-verifier; otherwise full
 * - off: builder only (legacy single-spawn behavior)
 */
export function buildAgentChain(taskText, options = {}) {
  const task = String(taskText || '').trim()
  const chain = normalizeChain(options.chain)
  const maxRepairs = clampRepairs(options.maxRepairs)
  const criteria = Array.isArray(options.criteria) && options.criteria.length
    ? options.criteria
    : defaultCriteria(task)
  const scope = String(options.scope || '').trim()

  let stages = ['builder']
  if (chain === 'full') {
    stages = ['builder', 'qa-verifier', 'code-reviewer', 'judge']
  } else if (chain === 'auto') {
    const direct = options.complexity === 'direct' && ['low', undefined].includes(options.risk)
    stages = direct ? ['builder', 'qa-verifier'] : ['builder', 'qa-verifier', 'code-reviewer', 'judge']
  }
  // 'off' keeps stages = ['builder']

  return { task, chain, stages, criteria, scope, maxRepairs }
}

export function buildBuilderPrompt(taskText, options = {}) {
  return `You are the builder agent in a software-engineering chain. Implement exactly the requested change, no more and no less.

Task:
${taskText}

Acceptance criteria:
${formatCriteria(options.criteria)}

${options.scope ? `Scope:\n${options.scope}\n` : ''}Rules:
- Read before you write; do not call unconfirmed APIs.
- Smallest change that fully satisfies the criteria.
- Do not silently drop or shrink requirements.
- Do not edit files outside scope.
- Do not weaken, skip, or delete tests.
- After implementing, run the relevant verification command(s) yourself if possible.
- Return a concise report: files changed, diff summary, and verification evidence (actual command output or "not run: <reason>").

If you cannot satisfy the acceptance criteria, say so explicitly instead of claiming done.`
}

export function buildQaPrompt(taskText, options = {}) {
  return `You are the independent QA verifier. You never trust the builder's word. You have NO edit tools; verify only.

Task:
${taskText}

Acceptance criteria:
${formatCriteria(options.criteria)}

Builder report:
${options.builderOutput || '(none)'}

Procedure:
1. Run the relevant tests/build/lint/typecheck commands (or inspect actual outputs if already present).
2. Probe edge cases relevant to the criteria.
3. For each criterion, return strict PASS or FAIL with actual command output or file:line evidence.
4. If you cannot run a check, say "NOT RUN: <command>" — do not count it as PASS.
5. Do not modify any files.

Return a report starting with either "QA: PASS" or "QA: FAIL" followed by per-criterion evidence.`
}

export function buildRepairLoop(taskText, options = {}) {
  const attempt = Math.max(1, Number(options.attempt) || 1)
  const maxRepairs = clampRepairs(options.maxRepairs)
  return `You are the repair agent in an agent chain. The QA verifier reported failures. Your job is to diagnose root cause, form a falsifiable hypothesis, gather evidence, apply the smallest patch, and prepare for re-verification.

Task:
${taskText}

Acceptance criteria:
${formatCriteria(options.criteria)}

${options.scope ? `Scope:\n${options.scope}\n` : ''}QA evidence (actual output):
${options.qaEvidence || '(none)'}

Repair attempt ${attempt} of ${maxRepairs}.

Procedure:
1. Classify the failure.
2. Find the root cause (read the relevant code/output before patching).
3. State a falsifiable hypothesis.
4. Collect evidence that confirms or refutes it.
5. Apply the smallest change that satisfies the criteria.
6. Do NOT weaken or skip tests. Do NOT edit files outside scope.
7. Report: root cause, hypothesis, evidence, what you changed, and the exact command to re-verify.

Return a concise repair report with evidence.`
}

export function buildReviewerPrompt(taskText, options = {}) {
  return `You are the adversarial code reviewer. You have never seen the builder's reasoning; review the output cold.

Task:
${taskText}

Acceptance criteria:
${formatCriteria(options.criteria)}

Builder report:
${options.builderOutput || '(none)'}

QA report:
${options.qaReport || '(none)'}

Hunt specifically for:
- fake progress (stubs/canned returns presented as done)
- silently dropped or narrowed requirements
- weakened/skipped/deleted tests
- out-of-scope edits / scope creep
- unverified API calls or version mismatches
- regression risks

Return findings by severity (critical/high/medium/low) with file:line or evidence. If no critical/high findings, end with "REVIEW: PASS". Otherwise end with "REVIEW: FAIL".`
}

export function isQaPass(output) {
  const text = String(output || '')
  return /QA:\s*PASS/i.test(text) && !/QA:\s*FAIL/i.test(text)
}

export function hasCriticalFindings(output) {
  const text = String(output || '')
  return /critical|high|blocker/i.test(text) && !/REVIEW:\s*PASS/i.test(text)
}

export function formatChainReport(results = {}) {
  const lines = []
  lines.push(`Agent chain report: ${results.status || 'unknown'}`)
  if (results.task) lines.push(`Task: ${results.task}`)
  if (results.criteria?.length) lines.push(`Criteria:\n${formatCriteria(results.criteria)}`)
  if (results.scope) lines.push(`Scope: ${results.scope}`)
  lines.push('')
  for (const stage of results.stages || []) {
    const role = stage.role || 'unknown'
    const status = stage.status || 'unknown'
    lines.push(`--- ${role} [${status}]${stage.attempt ? ` (attempt ${stage.attempt})` : ''} ---`)
    lines.push(stage.output || stage.error || '(no output)')
    lines.push('')
  }
  if (results.error) lines.push(`Error: ${results.error}`)
  return lines.join('\n').trim()
}

/**
 * Run one one-shot subagent and return its stage record.
 */
export function roleToolFilter(role) {
  switch (role) {
    case 'qa-verifier':
      return { deny: ['edit', 'write', 'str_replace_editor', 'browser_click', 'browser_type'] }
    case 'code-reviewer':
      return { deny: ['edit', 'write', 'str_replace_editor'] }
    case 'judge':
      return { deny: ['edit', 'write', 'str_replace_editor', 'pwsh', 'bash'] }
    default:
      return null
  }
}

export async function runStage(subagents, parent, role, prompt, attempt) {
  const filter = roleToolFilter(role)
  const run = await subagents.start('spawn', {
    label: role,
    prompt: [{ type: 'text', text: prompt }],
    parent,
    maxDepth: 1,
    ...(filter ? { toolFilter: filter } : {}),
  })
  try {
    const result = await run.result
    const output = outputText(result.output)
    const status = result.stopReason === 'completed' ? 'completed' : 'failed'
    return { role, status, output, ...(attempt !== undefined ? { attempt } : {}) }
  } finally {
    try { await run.dispose() } catch { /* best-effort release */ }
  }
}

function outputText(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/**
 * Runtime chain. `deps` = { subagents, parent }; `options` = chain options.
 */
export async function runAgentChain(deps, options = {}) {
  const { subagents, parent } = deps || {}
  const taskText = String(options.taskText || '').trim()
  const plan = buildAgentChain(taskText, options)
  const stages = []

  if (!subagents?.start || !parent) {
    return {
      ok: false,
      status: 'failed',
      error: 'subagents service unavailable',
      stages,
      report: formatChainReport({ status: 'failed', task: taskText, criteria: plan.criteria, scope: plan.scope, stages, error: 'subagents service unavailable' }),
    }
  }

  // 1. Builder
  const builder = await runStage(subagents, parent, 'builder', buildBuilderPrompt(taskText, plan))
  stages.push(builder)
  if (builder.status !== 'completed') {
    return finalize({ status: 'failed', taskText, plan, stages, error: 'builder failed or refused' })
  }

  // 2. QA (skipped entirely for `chain: off`)
  if (!plan.stages.includes('qa-verifier')) {
    return finalize({ status: 'ready', taskText, plan, stages })
  }

  let qa = await runStage(subagents, parent, 'qa-verifier', buildQaPrompt(taskText, { ...plan, builderOutput: builder.output }))
  stages.push(qa)
  let qaPass = isQaPass(qa.output)
  let repairs = 0

  // 3. Repair loop (only when qa FAIL and plan allows it)
  while (!qaPass && repairs < plan.maxRepairs) {
    repairs += 1
    const repair = await runStage(subagents, parent, 'repair', buildRepairLoop(taskText, {
      ...plan,
      qaEvidence: qa.output,
      attempt: repairs,
    }), repairs)
    stages.push(repair)
    if (repair.status !== 'completed') break
    qa = await runStage(subagents, parent, 'qa-verifier', buildQaPrompt(taskText, {
      ...plan,
      builderOutput: `${builder.output}\n\nRepair report:\n${repair.output}`,
    }))
    stages.push(qa)
    qaPass = isQaPass(qa.output)
  }

  if (!qaPass) {
    return finalize({ status: 'needs_rework', taskText, plan, stages, error: 'qa verification failed after repair attempts' })
  }

  // 4. Code reviewer (full chains only)
  let review = null
  if (plan.stages.includes('code-reviewer')) {
    review = await runStage(subagents, parent, 'code-reviewer', buildReviewerPrompt(taskText, {
      ...plan,
      builderOutput: builder.output,
      qaReport: qa.output,
    }))
    stages.push(review)
    if (review.status !== 'completed' || hasCriticalFindings(review.output)) {
      return finalize({ status: 'needs_rework', taskText, plan, stages, error: review.status !== 'completed' ? 'reviewer failed' : 'reviewer found critical/high findings' })
    }
  }

  // 5. Judge (full chains only)
  if (plan.stages.includes('judge')) {
    const judge = await runStage(subagents, parent, 'judge', buildJudgePrompt(taskText, {
      ...plan,
      builderOutput: builder.output,
      qaReport: qa.output,
      reviewReport: review?.output || '(none)',
    }))
    stages.push(judge)
    if (judge.status !== 'completed' || !isJudgePass(judge.output)) {
      return finalize({ status: 'needs_rework', taskText, plan, stages, error: judge.status !== 'completed' ? 'judge failed' : 'judge did not pass the delivery' })
    }
  }

  return finalize({ status: 'ready', taskText, plan, stages })
}

function finalize({ status, taskText, plan, stages, error }) {
  const report = formatChainReport({
    status,
    task: taskText,
    criteria: plan.criteria,
    scope: plan.scope,
    stages,
    ...(error ? { error } : {}),
  })
  return { ok: true, status, stages, report, error }
}
