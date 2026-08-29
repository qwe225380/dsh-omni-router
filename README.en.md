# Omni

> [中文](./README.md)

> **Omni adds a task-level reliability layer to DeepSeek Harness:**
> decide when to intervene, prepare the right context, constrain completion criteria, verify real evidence, and change strategy on failure.
> It reuses existing DSH Skills, Tools, and Plugins instead of re-implementing them.

**DSH gives agents capabilities. Omni makes their outcomes dependable.**

**Fast by default. Smart when needed. Proven when done.**

```bash
dsh plugin --profile web add dsh-omni-router
```

---

## Why Omni

Coding agents commonly suffer from:

- Wrong code or wrong context
- Losing track in complex tasks
- Forgetting acceptance criteria
- Tests not actually running
- Repeating the same failed strategy
- Saying "done" without actually finishing

Omni exists to solve these engineering problems, not to be another router.

---

## What Omni does

| Core value | What Omni actually does |
|---|---|
| 🧠 **Intervention Intelligence** | Simple tasks are true NOOP; complex tasks get Assist / Guard |
| 🎯 **Context & Task Intelligence** | Task Contract + focused context + capability sufficiency |
| ✅ **Proof & Recovery** | Evidence / freshness / acceptance coverage / recovery |
| ♻️ **Reuse first** | Design principle: prefer installed Tools / Skills / Plugins |
| 🧩 **Capability Gap Management** | Fill gaps only when they block acceptance |
| 🔄 **Failure discipline** | retry → repair → expand context → change hypothesis |

---

## 30-second demo

### Without Omni

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
- No evidence that "done" is true

### With Omni

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

---

## One plugin, reuse the whole DSH ecosystem

> This is not the core of Omni; it is the ecosystem strategy: **Reuse first. Don't reimplement host capabilities.**

```
                    Omni
          Capability + Reliability
                     │
      ┌──────────────┼──────────────┐
      │              │              │
      ▼              ▼              ▼
    Skills         Plugins         Tools
      │              │              │
      ├── TDD        ├── Browser    ├── Shell
      ├── Git        ├── Router     ├── Editor
      └── Verify     └── Others     └── Tests
      │              │              │
      └──────────────┼──────────────┘
                     ▼
              DeepSeek Harness
                     │
                     ▼
                  Execute
                     │
                     ▼
          Evidence → Verify
```

> **Omni does not try to own the most capabilities. It makes the good capabilities you already have work together.**

### Example: Frontend UI fix

```text
User:
Inspect this webpage and fix the UI.

Omni:
1. Detect frontend task
2. Check current DSH capabilities
3. Browser already installed → reuse
4. UI/Verification skill exists → let DSH use it
5. Do not install duplicates
6. Generate UI acceptance criteria
7. DSH executes
8. Collect screenshot / tool / test evidence
9. Verify
```

### Example: Complex refactor

```text
Current environment:
✓ Git
✓ Testing
✓ Skills
✗ Some task-specific capability

Omni:
Existing capabilities → all reused
Missing capability → only fill that gap
```

---

## Under the hood

Omni's surface is simple, but it is not a prompt template.

```text
Task
 │
 ▼
Task Classification
 │
 ▼
Intervention Gate ───────────→ NOOP
 │
 ▼
Task Contract
 ├── Acceptance Criteria
 ├── Risk
 ├── Context Budget
 └── Capability Requirements
 │
 ▼
Context Engine
 ├── multilingual tokenizer
 ├── lexical retrieval
 ├── symbol retrieval
 ├── dependency graph
 └── freshness tracking
 │
 ▼
Capability Audit
 ├── existing tools
 ├── native skills
 ├── installed plugins
 └── missing capabilities
 │
 ▼
DeepSeek Harness
 │
 ▼
DSH Events
 │
 ▼
Evidence Trust
 ├── T0 model claim
 ├── T1 observation
 ├── T2 host/tool
 ├── T3 deterministic execution
 └── T4 independent verifier
 │
 ▼
Criterion Verification
 ├── PASS → Verified
 └── FAIL → Recovery
              │
              └──→ DSH
```

---

## Reliability Engineering

Omni handles these real agent failure modes:

```text
✓ Model claims tests passed
  → model evidence is only T0/T1

✓ Tool output confused with model text
  → provenance-aware Evidence

✓ Old test results used after files changed
  → Evidence freshness / invalidation

✓ permission / dependency / timeout treated as success
  → success whitelist + failure taxonomy

✓ Chinese task cannot find English symbols
  → multilingual query tokenizer + semantic expansion

✓ Same failure retried forever
  → failure-aware recovery

✓ Simple tasks slowed by complex frameworks
  → true L0 NOOP

✓ Rebuilding capabilities that already exist
  → capability reuse first

✓ Users must manually install missing capabilities
  → trusted capability provisioning

✓ Two routers controlling the same model
  → compatibility delegation
```

---

## Omni is not just a router

```text
Normal Router
Task → choose mode/model/agent

Omni
Task
→ decide whether to intervene
→ reuse existing capabilities
→ fill missing capabilities
→ prepare correct context
→ define acceptance
→ host executes
→ collect real evidence
→ verify completion
→ recover from failure
```

> **Routing is one decision. Reliability is the whole lifecycle.**

---

## Works better with good plugins

Omni does not ask the ecosystem to rewrite itself around it.

If `dsh-router-standard` is installed, Omni automatically creates the combined preset:

```text
Omni Router + Router Standard
```

Router Standard keeps handling DeepSeek persona / attention / workflow routing; Omni handles capability, context, evidence, and reliability.

---

## Built like infrastructure, not a prompt pack

Omni has independent test coverage for routing, Context, Evidence, Capability, Recovery, Host Adapter, Installer, and OmniBench (~60 test files).

Every RC requires a full `npm test` regression; benchmark supports multi-arm comparisons (raw / omni / mid / frontier / stack / stack_omni…).

## Measured Reliability

```text
Evidence Federation  third-party results → EvidenceRecord v1 (no self-reported trust)
Context Metrics      Recall@5/10 · Precision · token overhead · irrelevant ratio
Intervention KPIs    NOOP precision · missed/false intervention rate
Recovery Telemetry   failure fingerprint · retry/repair/hypothesis funnel · success rate
Multi-arm Benchmark  comparePair(baseline, candidate) + release gates
```

---

## Proof of Completion

Every acceptance criterion has an id (e.g. `C1`, `C2`). Every criterion needs at least one fresh evidence record at the required trust level:

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

## Compatibility

| Project / Capability | Omni strategy |
|---|---|
| `dsh-router-standard` | **Delegate** persona/reasoning routing |
| DSH native Skills | **Reuse** automatic activation |
| Browser plugin | **Reuse** browser capability |
| Testing/verification Skills | **Reuse evidence/results** |
| Git plugins | **Reuse** native workflow |
| MCP servers | **Treat as host capabilities** |
| Missing capability | **Provision only when necessary** |

---

## Evolution

```text
1.x
Router
↓
2.x
Planner / Context / Capability / Evidence exploration
↓
2.4
Reliability Kernel
↓
3.0
Convergence:
Decide · Prepare · Verify
```

> 3.0 intentionally removed or hid overlapping runtime/router features instead of continuing feature growth.

---

## OmniBench

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

## FAQ

**Q: Does it slow down simple tasks?**

A: No. L0 is a true NOOP; Omni injects no prompt.

**Q: Does it replace DeepSeek Harness?**

A: No. DSH keeps execution, tools, skills, plugins, and runtime.

**Q: Does it take over my plugins?**

A: No. Omni defines what "success" means; it does not micromanage plugin calls.

**Q: Can it auto-install skills/plugins?**

A: Yes, but default is `recommend`: detect gaps → search → recommend → user/host approval before install. Auto-install only with explicit `auto-trusted`, and every change is recorded in `.omni/capability-audit.json`.

**Q: Does it conflict with Router Standard?**

A: No. When Router Standard is detected, Omni auto-creates a combined preset and delegates reasoning/persona routing.

---

## Credits / Inspirations

Omni is inspired by several DeepSeek Harness community projects, especially:

- `dsh-router-standard / dsh-routing-suite`
  - persona routing
  - attention engineering
  - progressive disclosure
  - real Harness assembly-chain research

Omni does not replace these capabilities; it makes them work together in one reliability loop.

---

## License

[MIT](./LICENSE)