# Fable Agent Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `omni_delegate` into a modular `builder → qa-verifier → (repair → qa-verifier)* → code-reviewer` subagent chain with evidence handoff.

**Architecture:** New `src/agent-chain.mjs` owns pure prompt builders, report formatting, and the runtime chain. `omni-router.mjs` only imports and wires the tool. This keeps the router file stable and satisfies `优化2.md`'s modular control-plane direction.

**Tech Stack:** Node.js ESM, DeepSeek Harness `ctx.subagents.start('spawn')`, node:test.

---

### Task 1: Create `src/agent-chain.mjs`

**Files:**
- Create: `src/agent-chain.mjs`
- Test: `test/agent-chain.test.mjs` (next task)

- [ ] **Step 1: Create the module**

```js
/**
 * Fable-style agent orchestration chain.
 *
 * Pure helpers + runtime orchestration for omni_delegate:
 *   builder -> qa-verifier -> (repair -> qa-verifier)* -> code-reviewer
 *
 * Subagents are one-shot and spawned fresh, so qa-verifier and code-reviewer
 * never see the builder's reasoning trace (cold review).
 */

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
    stages = ['builder', 'qa-verifier', 'code-reviewer']
  } else if (chain === 'auto') {
    const direct = options.complexity === 'direct' && ['low', undefined].includes(options.risk)
    stages = direct ? ['builder', 'qa-verifier'] : ['builder', 'qa-verifier', 'code-reviewer']
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
export async function runStage(subagents, parent, role, prompt, attempt) {
  const run = await subagents.start('spawn', {
    label: role,
    prompt: [{ type: 'text', text: prompt }],
    parent,
    maxDepth: 1,
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

  // 2. QA
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
  if (plan.stages.includes('code-reviewer')) {
    const review = await runStage(subagents, parent, 'code-reviewer', buildReviewerPrompt(taskText, {
      ...plan,
      builderOutput: builder.output,
      qaReport: qa.output,
    }))
    stages.push(review)
    if (review.status !== 'completed' || hasCriticalFindings(review.output)) {
      return finalize({ status: 'needs_rework', taskText, plan, stages, error: review.status !== 'completed' ? 'reviewer failed' : 'reviewer found critical/high findings' })
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
```

- [ ] **Step 2: Verify the file loads**

Run: `node -e "import('./src/agent-chain.mjs').then(m => console.log(Object.keys(m).length))"`
Expected: prints a number (no syntax errors).

---

### Task 2: Create `test/agent-chain.test.mjs`

**Files:**
- Create: `test/agent-chain.test.mjs`

- [ ] **Step 1: Write the tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildAgentChain,
  buildBuilderPrompt,
  buildQaPrompt,
  buildRepairLoop,
  buildReviewerPrompt,
  clampRepairs,
  defaultCriteria,
  formatChainReport,
  hasCriticalFindings,
  isQaPass,
  normalizeChain,
} from '../src/agent-chain.mjs'

test('buildAgentChain full returns builder->qa->reviewer', () => {
  const plan = buildAgentChain('实现退款功能', { chain: 'full', criteria: ['refund API exists'], maxRepairs: 2 })
  assert.deepEqual(plan.stages, ['builder', 'qa-verifier', 'code-reviewer'])
  assert.equal(plan.maxRepairs, 2)
  assert.equal(plan.chain, 'full')
})

test('buildAgentChain auto shortens direct+low risk', () => {
  const plan = buildAgentChain('改一个 typo', { chain: 'auto', complexity: 'direct', risk: 'low' })
  assert.deepEqual(plan.stages, ['builder', 'qa-verifier'])
})

test('buildAgentChain auto keeps full for plan/high risk', () => {
  const plan = buildAgentChain('迁移数据库', { chain: 'auto', complexity: 'plan', risk: 'high' })
  assert.deepEqual(plan.stages, ['builder', 'qa-verifier', 'code-reviewer'])
})

test('buildAgentChain off returns builder only', () => {
  const plan = buildAgentChain('任何任务', { chain: 'off' })
  assert.deepEqual(plan.stages, ['builder'])
})

test('clampRepairs caps at 3 and defaults to 1', () => {
  assert.equal(clampRepairs(undefined), 1)
  assert.equal(clampRepairs(99), 3)
  assert.equal(clampRepairs(0), 0)
})

test('defaultCriteria matches bug/feature/refactor/other', () => {
  assert.match(defaultCriteria('修复登录 500')[0], /bug/i)
  assert.match(defaultCriteria('新增订单接口')[0], /feature/i)
  assert.match(defaultCriteria('重构支付模块')[0], /behavior/i)
  assert.ok(defaultCriteria('随便做点事').length >= 1)
})

test('builder prompt includes task, criteria, and no gold-plating rules', () => {
  const prompt = buildBuilderPrompt('实现退款', { criteria: ['refund exists'] })
  assert.match(prompt, /实现退款/)
  assert.match(prompt, /refund exists/)
  assert.match(prompt, /Smallest change/)
  assert.match(prompt, /Do not edit files outside scope/)
})

test('qa prompt is independent and forbids edits', () => {
  const prompt = buildQaPrompt('修复 bug', { criteria: ['tests pass'], builderOutput: 'done' })
  assert.match(prompt, /NO edit tools/)
  assert.match(prompt, /QA: PASS/)
  assert.match(prompt, /builderOutput|Builder report/)
  assert.match(prompt, /Do not modify any files/)
})

test('repair prompt follows root-cause hypothesis evidence procedure', () => {
  const prompt = buildRepairLoop('修复 bug', { criteria: ['tests pass'], qaEvidence: '2 failed', maxRepairs: 2, attempt: 1 })
  assert.match(prompt, /root cause/i)
  assert.match(prompt, /falsifiable hypothesis/i)
  assert.match(prompt, /evidence/i)
  assert.match(prompt, /Repair attempt 1 of 2/)
})

test('reviewer prompt hunts fake progress and dropped requirements', () => {
  const prompt = buildReviewerPrompt('实现功能', { criteria: ['works'], builderOutput: 'done', qaReport: 'PASS' })
  assert.match(prompt, /fake progress/)
  assert.match(prompt, /silently dropped|dropped or narrowed/i)
  assert.match(prompt, /REVIEW: PASS/)
})

test('isQaPass requires QA PASS and rejects QA FAIL', () => {
  assert.equal(isQaPass('QA: PASS\n- criterion 1: PASS'), true)
  assert.equal(isQaPass('QA: FAIL\n- criterion 1: FAIL'), false)
  assert.equal(isQaPass('ran tests'), false)
})

test('hasCriticalFindings flags critical/high unless review passes', () => {
  assert.equal(hasCriticalFindings('HIGH: missing validation'), true)
  assert.equal(hasCriticalFindings('REVIEW: PASS\nno critical findings'), false)
  assert.equal(hasCriticalFindings('REVIEW: FAIL\ncritical: dropped requirement'), true)
})

test('formatChainReport renders stages and final status', () => {
  const report = formatChainReport({
    status: 'needs_rework',
    task: '修复 bug',
    criteria: ['tests pass'],
    stages: [
      { role: 'builder', status: 'completed', output: 'changed auth.ts' },
      { role: 'qa-verifier', status: 'failed', output: 'QA: FAIL\n2 tests failing' },
    ],
  })
  assert.match(report, /needs_rework/)
  assert.match(report, /修复 bug/)
  assert.match(report, /builder \[completed\]/)
  assert.match(report, /qa-verifier \[failed\]/)
})
```

- [ ] **Step 2: Run the new tests**

Run: `node --test test/agent-chain.test.mjs`
Expected: all pass (14 tests).

---

### Task 3: Wire `omni_delegate` to the chain

**Files:**
- Modify: `src/omni-router.mjs`

- [ ] **Step 1: Add the import at the top**

After the existing imports (there are currently no local imports; add before `export const name`):

```js
import { buildAgentChain, formatChainReport, runAgentChain } from './agent-chain.mjs'
```

- [ ] **Step 2: Replace `omni_delegate` execute body**

Find the `registerTool({ name: 'omni_delegate', ... })` block and replace its `parameters` and `execute` with:

```js
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
```

- [ ] **Step 3: Run router tests**

Run: `node --test test/omni-router.test.mjs`
Expected: all 40 pass.

---

### Task 4: Update `package.json` test script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Change the test script**

```json
"test": "node --test test/omni-router.test.mjs test/agent-chain.test.mjs test/bundle-installer.test.mjs"
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all tests pass.

---

### Task 5: Update docs and version

**Files:**
- Modify: `package.json` (version 1.5.0)
- Modify: `CHANGELOG.md`
- Modify: `README.md` (omni_delegate section)
- Modify: `README.zh-CN.md` (omni_delegate section, if present)

- [ ] **Step 1: Bump version**

In `package.json`, change `"version": "1.4.0"` to `"version": "1.5.0"`.

- [ ] **Step 2: Add changelog entry**

At the top of `CHANGELOG.md` after `# Changelog`:

```md
## [1.5.0] - 2026-08-19

- Fable 风格子代理链：`omni_delegate` 升级为 builder → qa-verifier → (repair → qa-verifier)* → code-reviewer
- 新增 `src/agent-chain.mjs` 模块（Agent Runtime / Verifier 第一块切片）
- 独立 QA Verifier：不信任 builder 口头报告，只接受命令输出/file:line 证据
- 轻量 Repair Loop：qa FAIL 后先根因诊断再补丁，默认最多 1 次（可配，上限 3）
- 对抗性 Code Reviewer：冷读审查，专查假进度/丢需求/弱化测试/越界改动
```

- [ ] **Step 3: Update README**

Find the `omni_delegate` bullet/paragraph and replace with a concise description of the chain and its parameters (`criteria`, `scope`, `chain`, `maxRepairs`).

---

### Task 6: Verification

- [ ] **Step 1: Run full tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Run router benchmark (smoke)**

Run: `npm run benchmark`
Expected: script completes (metrics may stay same; this change does not alter routing heuristics).

- [ ] **Step 3: Commit**

```bash
git add src/agent-chain.mjs test/agent-chain.test.mjs src/omni-router.mjs package.json CHANGELOG.md README.md README.zh-CN.md docs/superpowers/specs/2026-08-19-fable-agent-chain-design.md docs/superpowers/plans/2026-08-19-fable-agent-chain.md
git commit -m "feat: add fable-style subagent chain with independent qa/review/repair"
```
