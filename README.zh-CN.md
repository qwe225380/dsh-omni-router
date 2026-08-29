# Omni

> [English](./README.en.md)

> **Omni 给 DeepSeek Harness 增加一层任务级可靠性：**
> 判断何时介入、准备正确上下文、约束完成条件、验证真实证据，并在失败时改变策略。
> 它优先复用 DSH 已有的 Skills、Tools 和 Plugins，而不是重新实现它们。

**DSH 给 Agent 能力，Omni 让结果可靠。**

**默认快。必要时聪明。完成必须有证据。**

```bash
dsh plugin --profile web add dsh-omni-router
```

---

## Why Omni

Coding Agent 最常见的六个问题：

- 找错代码和上下文
- 复杂任务做着做着跑偏
- 忘掉验收条件
- 测试没有真正跑
- 失败后重复同一种办法
- 最后说“完成了”，实际并没有完成

Omni 就是为了解决这些工程问题，而不是再做一个“Router”。

---

## What Omni does

| 核心价值 | Omni 实际做什么 |
|---|---|
| 🧠 **Intervention Intelligence** | 简单任务真正 NOOP，复杂任务才进入 Assist / Guard |
| 🎯 **Context & Task Intelligence** | Task Contract + 精准 Context + Capability Sufficiency |
| ✅ **Proof & Recovery** | Evidence / Freshness / Acceptance coverage / Recovery |
| ♻️ **Reuse first** | 设计原则：优先复用 DSH 已有 Tool / Skill / Plugin，不重复造轮子 |
| 🧩 **Capability Gap Management** | 只在确实阻塞任务时补齐缺口 |
| 🔄 **失败纪律** | retry 不奏效时 repair / expand context / change hypothesis |

---

## 30 秒 Demo

### Without Omni

```text
User:
修复 refreshSession 偶发并发刷新三次的问题

Agent:
修改 session.ts
运行了一些检查
Done ✅
```

问题：

- 真实并发测试没跑
- 调用方漏了一个
- 没有 regression test
- 没有证据证明“真的完成了”

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

## 一个插件，复用整个 DSH 生态

> 这不是 Omni 的核心，而是它的生态策略：**Reuse first. Don't reimplement host capabilities.**

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

> **Omni 不追求自己拥有最多能力，而是尽可能让已经存在的优秀能力发挥作用。**

### 示例：前端 UI 修复

```text
用户：
帮我检查这个网页的实现，并修复 UI 问题。

Omni:
1. 判断这是前端任务
2. 检查当前 DSH 能力
3. 已有 Browser → 直接复用
4. 已有 UI/Verification Skill → 继续由 DSH 使用
5. 不再安装重复能力
6. 生成 UI acceptance criteria
7. DSH 执行
8. 收集 screenshot / tool / test evidence
9. Verify
```

### 示例：复杂重构

```text
当前环境：
✓ Git
✓ Testing
✓ Skills
✗ 某个任务要求的特殊能力

Omni:
已有能力 → 全部复用
缺失能力 → 只补这个 gap
```

---

## Under the hood

Omni 的用户界面很简单，但内部并不是一个 Prompt 模板。

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

Omni 不只是功能堆叠，它专门处理这些 Agent failure modes：

```text
✓ 模型自己声称测试通过
  → model evidence 只能 T0/T1

✓ Tool 执行结果和模型文字混淆
  → provenance-aware Evidence

✓ 文件修改后旧测试结果仍被当有效
  → Evidence freshness / invalidation

✓ permission / dependency / timeout 被误认为成功
  → success whitelist + failure taxonomy

✓ 中文任务检索不到英文 symbol
  → multilingual query tokenizer + semantic expansion

✓ 相同失败无限 retry
  → failure-aware recovery

✓ 简单任务被复杂框架拖慢
  → true L0 NOOP

✓ 已经有插件还重复造能力
  → capability reuse first

✓ 缺能力时用户需要手动安装
  → trusted capability provisioning

✓ 两个 Router 同时控制模型
  → compatibility delegation
```

---

## Omni 不只是 Router

```text
普通 Router
Task → choose mode/model/agent

Omni
Task
→ 判断是否需要介入
→ 复用已有能力
→ 补齐缺失能力
→ 准备正确 Context
→ 定义 Acceptance
→ Host 执行
→ 收集真实 Evidence
→ 验证完成
→ 失败后恢复
```

> **Routing is one decision. Reliability is the whole lifecycle.**

---

## Works better with good plugins

Omni 不要求生态围绕自己重写。

例如安装 `dsh-router-standard` 后，Omni 可以自动生成组合预设：

```text
Omni Router + Router Standard
```

Router Standard 继续负责 DeepSeek persona / attention / workflow routing；Omni 负责 capability、context、evidence 和 reliability。

---

## Built like infrastructure, not a prompt pack

Omni 对 routing、Context、Evidence、Capability、Recovery、Host Adapter、Installer 和 OmniBench 均有独立测试覆盖（约 60 个测试文件）。

每个 RC 都要求完整 `npm test` 回归；Benchmark 支持 multi-arm（raw / omni / mid / frontier / stack / stack_omni…）。

## Measured Reliability

```text
Evidence Federation  第三方结果 → EvidenceRecord v1（provider 自报 trust 无效）
Context Metrics      Recall@5/10 · Precision · Token 开销 · irrelevant ratio
Intervention KPIs    NOOP Precision · missed/false intervention rate
Recovery Telemetry   failure fingerprint · retry/repair/hypothesis funnel · success rate
Multi-arm Benchmark  comparePair(baseline, candidate) + release gates
```

---

## Proof of Completion

每个验收标准都有 id（如 `C1`、`C2`）。每个标准必须至少有一条 fresh evidence 记录并满足要求的信任等级：

| Trust | Source |
|---|---|
| T0 | model claim |
| T1 | agent observation / model-written JSON |
| T2 | host/tool output |
| T3 | deterministic command/test execution |
| T4 | independent / hidden verifier |

```text
Completed.
✓ C1 根因已修复
✓ C2 已添加回归测试
✓ C3 143 个测试通过
Proof: 3/3
```

如果 DSH 当前没有可靠事件 hook，Omni 会诚实地输出：

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

在数据达到这些 Gate 之前，不会宣称 frontier parity。

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
mission/         mission-ir · planner-dag · mission-dag（兼容层）
host/            interface · dsh-adapter
benchmark/       omnibench-v2 runner · matrix · gates
```

---

## FAQ

**Q: 它会拖慢简单任务吗？**

A: 不会。L0 是真正的 NOOP，Omni 不注入任何 prompt。

**Q: 它会替换 DeepSeek Harness 吗？**

A: 不会。DSH 仍然拥有执行、工具、Skills、插件、Runtime。

**Q: 它会接管我的插件吗？**

A: 不会。Omni 只定义“任务达到什么状态才算成功”，不调度具体插件。

**Q: 它能自动安装技能/插件吗？**

A: 能。默认 `recommend` 模式：识别缺口 → 搜索 → 推荐 → 用户/Host 审批后才安装；只有显式开启 `auto-trusted` 才自动安装，并记录 `.omni/capability-audit.json`。

**Q: 它和 Router Standard 冲突吗？**

A: 不冲突。检测到 Router Standard 时，Omni 自动生成组合预设，并让出 reasoning/persona routing。

---

## Credits / Inspirations

Omni 的设计受到 DeepSeek Harness 社区多个项目的启发，尤其是：

- `dsh-router-standard / dsh-routing-suite`
  - persona routing
  - attention engineering
  - progressive disclosure
  - real Harness assembly-chain research

Omni 不替代这些能力，而是让它们在同一任务可靠性闭环中协同工作。

---

## License

[MIT](./LICENSE)