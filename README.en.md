# Omni

> [中文](./README.md)

Agent Reliability Kernel for DeepSeek Harness.

**Fast by default. Smart when needed. Proven when done.**

Omni does three things:

1. **Decide** when intervention helps
2. **Prepare** focused context and constraints
3. **Verify** that the work is actually complete

> DeepSeek Harness owns execution. Omni owns reliability.

## Install

```bash
dsh plugin --profile web add dsh-omni-router
```

Or from npm:

```bash
npm i dsh-omni-router
cd node_modules/dsh-omni-router
node scripts/install-preset.mjs
```

Restart DSH and select **Omni Router** in a new session.

## How it works

```
User task
   ↓
Intervention Gate
   ├─ NOOP  → raw DSH (Omni exits)
   ├─ ASSIST → Task Contract + Context + Verify
   └─ GUARD  → approval + independent evidence (high risk)
   ↓
DeepSeek Harness executes
   ↓
Evidence (T0–T4 trust levels)
   ↓
Proof of Completion
```

- Simple tasks stay simple: L0 is a true no-op with near-zero overhead.
- Complex tasks get a Task Contract, focused Context Capsule, and Recovery Policy.
- Missing capabilities are provisioned only when an acceptance criterion requires them.

## Proof of Completion

Each acceptance criterion has an id, e.g. `C1`, `C2`. Every criterion must have at
least one fresh evidence record meeting its required trust level:

| Trust | Source |
|---|---|
| T0 | model claim |
| T1 | agent observation / model-written JSON |
| T2 | host/tool output |
| T3 | deterministic command/test execution |
| T4 | independent/hidden verifier |

Final result:

```text
Completed.
✓ C1 Root cause fixed
✓ C2 Regression test added
✓ C3 143 tests passed
Proof: 3/3
```

## Benchmark

```bash
npm run omnibench:v2:generate -- benchmark/omnibench-v2/manifest.local.example.json
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/manifest.local.example.json --exec
node benchmark/omnibench-v2/matrix.mjs <results.json>
node benchmark/omnibench-v2/gates.mjs <results.json>
```

3.0 release gates: ≥50 repos, ≥100 tasks, ≥3 paired runs/task, hidden verifier
100%, Medium/Hard uplift ≥10pp, false completion <3%, cost ≤2.5×.

## Architecture

```
kernel/          task-contract · intervention-gate · omni-event · evidence-trust
context/         query-tokenizer · capsule · freshness
recovery/        failure-taxonomy · strategy-shift · recovery-policy
capability/      auditor · quality · solver · provisioner · performance
mission/         mission-ir · planner-dag · mission-dag (compatibility)
host/            interface · dsh-adapter
benchmark/       omnibench-v2 runner · matrix · gates
```

## Advanced / Developer

- Model-visible tools by default: `omni_status`, `omni_explain`, `omni_doctor`.
- Set `developerMode: true` (or `exposeDeveloperTools: true`) to expose the
  legacy runtime / benchmark / capability tools during migration.
- Historical architecture notes: [docs/architecture-history.md](./docs/architecture-history.md).