# Fable Agent Chain Design (Omni Control Plane slice)

Date: 2026-08-19
Status: Approved (with Repair stage added per `优化2.md`)

## Goal

Upgrade `omni_delegate` from a single subagent spawn into a self-enforcing
`builder → qa-verifier → (repair → qa-verifier)* → code-reviewer` chain, so a
DeepSeek V4 Flash session gets independent verification and adversarial cold
review before any work is accepted as done.

## Scope

In scope:
- New modular file `src/agent-chain.mjs` (do not keep piling logic into `omni-router.mjs`).
- Pure functions:
  - `buildAgentChain(taskText, options)` — returns stages, criteria, scope.
  - `buildRepairLoop(taskText, options)` — repair budget/attempts.
  - `formatChainReport(results)` — human-readable evidence report.
  - `runAgentChain(deps, options)` — runtime orchestration using `ctx.subagents`.
- `omni_delegate` tool rewired to call `runAgentChain`.
- Unit tests for pure functions and report formatting.
- README/CHANGELOG/version update to 1.5.0.

Out of scope:
- Full Project Brain / symbol graph / SQLite memory.
- Full Mission Planner / trajectory memory / judge scoring.
- Browser/visual verification.
- These remain later phases from `优化2.md`.

## Architecture

```
omni_delegate (tool)
        │
        ▼
runAgentChain(deps, options)
        │
        ├─ buildAgentChain → builder prompt
        ├─ subagents.start('spawn') → await run.result → dispose
        ├─ qa-verifier prompt (task + criteria + builder output)
        ├─ if qa FAIL and repairs left:
        │     repair prompt (task + criteria + qa evidence)
        │     qa-verifier again (loop, maxRepairs)
        ├─ code-reviewer prompt (task + criteria + builder output + qa report)
        └─ formatChainReport → text result
```

All subagents are one-shot (`subagents.start('spawn')`), spawned fresh with no
parent reasoning trace, so qa-verifier and code-reviewer are genuinely cold.

## Components

### `src/agent-chain.mjs`

- `buildAgentChain(taskText, { criteria, scope, chain, maxRepairs })`
  - `chain: 'full' | 'auto' | 'off'`
  - `full` → builder → qa → (repair if fail) → code-reviewer
  - `auto` → direct+low risk: builder → qa; plan/high risk: full
  - `off` → builder only (current single-spawn behavior)
  - Returns `{ stages, criteria, scope, maxRepairs }`
- `buildRepairLoop(taskText, { criteria, scope, qaEvidence, attempt })`
  - Returns repair agent prompt: classify failure → root cause → hypothesis →
    evidence → patch → re-verify.
- `formatChainReport(results)`
  - Sections: builder, qa-verifier, repair (if any), code-reviewer, overall status.
  - Status: `ready` | `needs_rework` | `failed`.
- `runAgentChain({ subagents, parent, taskText, options })`
  - Uses `subagents.start('spawn', { label, prompt: [{ type: 'text', text }], parent, maxDepth: 1 })`.
  - Awaits `run.result` and calls `run.dispose()`.
  - Extracts text from output blocks.

### `omni_delegate` changes

- New parameters:
  - `criteria` (optional, auto-derived from `buildIntent` when absent)
  - `scope` (optional)
  - `chain` (optional, default `full`; `auto`/`off` supported)
  - `maxRepairs` (optional, default 1, cap 3)
- If `ctx.subagents` unavailable → fallback to current delegation-plan text.
- Returns `formatChainReport` output instead of just run id.

## Error Handling

- Builder run fails/refuses → return `failed` with partial output, stop.
- qa-verifier FAIL → run repair (if attempts remain); repair itself fails →
  stop with `needs_rework` + evidence.
- After repair, qa re-verify FAIL again → if attempts exhausted → `needs_rework`.
- code-reviewer critical/high findings → `needs_rework`; otherwise `ready`.
- Any subagent `run.result` rejection → wrap as failed stage, do not crash tool.

## Testing

- `buildAgentChain('full')` returns builder→qa→reviewer stages.
- `buildAgentChain('auto')` returns shorter chain for direct+low risk.
- `buildAgentChain('off')` returns builder only.
- `formatChainReport` shows builder evidence, qa PASS/FAIL, repair attempts,
  reviewer findings, and final status.
- `buildRepairLoop` prompt includes root-cause/hypothesis/evidence language.
- Existing 40 tests still pass.

## Alignment with `优化2.md`

- Verifier independent of Coder: qa-verifier is a separate subagent with no
  edit tools by contract.
- Evidence beats assertion: every stage returns command output / file:line.
- Repair Loop: `fail → classify → root cause → hypothesis → evidence → patch →
  verify`, with bounded attempts.
- Modularization: new `agent-chain.mjs` instead of growing `omni-router.mjs`.
- This is the first slice of Agent Runtime / Verifier from the Control Plane
  roadmap; Mission Planner / Memory / Judge remain future phases.
