# Omni

> [中文](./README.md)

### Make DeepSeek Harness more reliable at real software engineering.

**Fast by default. Smart when needed. Proven when done.**

Omni is a lightweight **Agent Reliability Kernel** for DeepSeek Harness.

It does not write code for DeepSeek, and it does not re-implement the Harness.
It addresses the most common and expensive coding-agent problems:

- Wrong code or wrong context
- Losing track in complex tasks
- Forgetting acceptance criteria
- Tests not actually running
- Repeating the same failed strategy
- Saying "done" without actually finishing

After installing Omni, you keep using DeepSeek Harness normally.

```text
Simple task
→ raw DSH

Complex task
→ focused context + task contract
→ DSH executes
→ real evidence
→ verified completion
```

> **DeepSeek Harness owns execution. Omni owns reliability.**

[Install](#install) · [How it works](#how-it-works) · [Why Omni](#why-omni) · [Router Standard](#relation-to-dsh-routing-suite--router-standard) · [Benchmark](#benchmark-status)

---

## Without Omni

```text
User:
Fix refreshSession firing three concurrent refreshes

Agent:
modified session.ts
ran some checks
Done ✅
```

Problems:

- The real concurrency test never ran
- A caller was missed
- No regression test was added
- No evidence that "done" is actually true

---

## With Omni

```text
Task Contract
C1 one refresh request per session
C2 concurrent callers behave correctly
C3 regression test passes

Relevant Context
session.ts
middleware/auth.ts
websocket/reconnect.ts
session-concurrency.test.ts

DSH executes...

Evidence
✓ concurrency test: 28/28
✓ full auth suite: 143/143
✓ relevant files verified

Proof: 3/3
```

> Omni does not ask you to learn a new workflow. It turns "done" into "done with evidence".

---

## How it works

```text
              Task
               │
               ▼
        Does Omni help?
          /        \
        NO          YES
        │            │
       DSH      Contract + Context
        │            │
        └──────┬─────┘
               ▼
          DSH executes
               │
               ▼
          Real Evidence
               │
               ▼
         Proven Complete
```

Omni does three things:

1. **Decide** when intervention helps
2. **Prepare** focused context and constraints
3. **Verify** that the work is actually complete

Simple tasks default to **NOOP**: Omni fully exits and adds near-zero overhead.

---

## Why Omni

### 1. Invisible by default

Simple task → NOOP.

Omni does not intervene just to prove it exists.

### 2. Focused context

Complex tasks get only the relevant code, call relationships, tests, and constraints.

### 3. Failure-aware recovery

It does not retry the same prompt after the same failure.

Repeated identical failures trigger a strategy shift: expand context, re-investigate, change capability, or re-plan.

### 4. Proven completion

**Done is proven, not declared.**

Every acceptance criterion is bound to evidence.

---

## How is Omni different?

| Project type     | Main purpose                                         |
| ---------------- | ---------------------------------------------------- |
| DeepSeek Harness | Agent runtime / tools / execution                    |
| Agent Skills     | Reusable task expertise                              |
| Router Standard  | DeepSeek persona / attention / workflow routing      |
| Omni             | **Task reliability / context / evidence / recovery** |

> Omni intentionally reuses the layers above instead of replacing them.

---

## Relation to dsh-routing-suite / Router Standard

Omni and Router Standard can be used together.

| Capability                  | Router Standard | Omni     |
| --------------------------- | --------------- | -------- |
| Persona / reasoning routing | ✅               | Delegate |
| Progressive tool disclosure | ✅               | Host     |
| Task Contract               | —               | ✅        |
| Focused repo context        | —               | ✅        |
| Evidence trust              | —               | ✅        |
| Criterion-based completion  | —               | ✅        |
| Failure recovery            | Partial         | ✅        |
| Cross-host reliability      | —               | Goal     |

> **Router Standard decides how DeepSeek works. Omni decides whether the engineering task is actually done.**

When Router Standard is detected, Omni delegates reasoning/persona routing to avoid two routers controlling the model.

---

## Ecosystem & Inspirations

### Inspirations

Omni is inspired by several DeepSeek Harness community projects, especially:

- `dsh-router-standard / dsh-routing-suite`
  - persona routing
  - attention engineering
  - progressive disclosure
  - real Harness assembly-chain research

### Integrations

- Detects Router Standard automatically
- Delegates reasoning/persona routing when detected
- Consumes its tool/evidence signals when available

### Omni-compatible

A plugin does not need to be modified for Omni.

If it exposes tools, events, or capability metadata through DSH, Omni can treat it as a capability / evidence provider.

| Project / Capability        | Omni strategy                          |
| --------------------------- | -------------------------------------- |
| `dsh-router-standard`       | **Delegate** persona/reasoning routing |
| DSH native Skills           | **Reuse** automatic activation         |
| Browser plugin              | **Reuse** browser capability           |
| Testing/verification Skills | **Reuse evidence/results**             |
| Git plugins                 | **Reuse** native workflow              |
| MCP servers                 | **Treat as host capabilities**         |
| Missing capability          | **Provision only when necessary**      |

> **Omni does not replace good plugins. It makes them work together inside one reliability loop.**

---

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

---

## Proof of Completion

Each acceptance criterion has an id (e.g. `C1`, `C2`). Every criterion needs at least one fresh evidence record at the required trust level:

| Trust | Source |
|---|---|
| T0 | model claim |
| T1 | agent observation / model-written JSON |
| T2 | host/tool output |
| T3 | deterministic command/test execution |
| T4 | independent / hidden verifier |

```text
Completed.
✓ C1 Root cause fixed
✓ C2 Regression test added
✓ C3 143 tests passed
Proof: 3/3
```

If DSH has no reliable event hook yet, Omni honestly reports:

```text
Verified
Partially Verified
Unverified
```

---

## Benchmark Status

```text
3.0 RC benchmark validation is in progress.

Target:
≥50 repos
≥100 tasks
≥3 paired runs/task
hidden verifier 100%
Medium/Hard uplift ≥10pp
False completion <3%
Cost ≤2.5×
```

No frontier parity claim will be made until these gates pass.

```bash
npm run omnibench:v2:generate -- benchmark/omnibench-v2/manifest.local.example.json
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/manifest.local.example.json --exec
node benchmark/omnibench-v2/matrix.mjs <results.json>
node benchmark/omnibench-v2/gates.mjs <results.json>
```

---

## Architecture

```text
kernel/          task-contract · intervention-gate · omni-event · evidence-trust
context/         query-tokenizer · capsule · freshness
recovery/        failure-taxonomy · strategy-shift · recovery-policy
capability/      auditor · quality · solver · provisioner · performance
mission/         mission-ir · planner-dag · mission-dag (compat)
host/            interface · dsh-adapter
benchmark/       omnibench-v2 runner · matrix · gates
```

---

## Developer Mode

Default model-visible tools:

- `omni_status`
- `omni_explain`
- `omni_doctor`

Legacy runtime / benchmark / capability tools are not registered by default.

To expose them:

```yaml
developerMode: true
# or
exposeDeveloperTools: true
```

---

## FAQ

**Q: Does it slow down simple tasks?**

A: No. L0 is a true NOOP; Omni injects no prompt.

**Q: Does it replace DeepSeek Harness?**

A: No. DSH keeps execution, tools, skills, plugins, and runtime.

**Q: Does it take over my plugins?**

A: No. Omni defines what "success" means; it does not micromanage plugin calls.

**Q: Does it conflict with Router Standard?**

A: No. When Router Standard is detected, Omni delegates reasoning/persona routing.

**Q: Can it still prove completion without DSH events?**

A: It reports `Verified / Partially Verified / Unverified` instead of lying.

---

> **Reuse what works. Coordinate what matters. Verify what finishes.**