# Omni

> [English](./README.en.md)

### Make DeepSeek Harness more reliable at real software engineering.

**默认快。必要时聪明。完成必须有证据。**

Omni 是 DeepSeek Harness 的轻量 **Agent Reliability Kernel**。

它不会替 DeepSeek 写代码，也不会重新实现 Harness。
它只解决 Coding Agent 最常见、也最昂贵的几个问题：

- 找错代码和上下文
- 复杂任务做着做着跑偏
- 忘掉验收条件
- 测试没有真正跑
- 失败后重复同一种办法
- 最后说“完成了”，实际并没有完成

安装 Omni 后，你仍然正常使用 DeepSeek Harness。

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

[安装](#安装) · [工作原理](#工作原理) · [为什么用 Omni](#为什么用-omni) · [与 Router Standard 的区别](#与-dsh-routing-suite--router-standard-的关系) · [Benchmark](#benchmark-status)

---

## 问题：没有 Omni 时

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

---

## 有 Omni 时

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

> Omni 不要求用户学习新的 workflow，它只在后台把“完成”变成“有证据的完成”。

---

## 工作原理

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

Omni 只做三件事：

1. **Decide** — 判断是否值得介入
2. **Prepare** — 准备精准上下文与约束
3. **Verify** — 证明工作真的完成了

简单任务默认 **NOOP**：Omni 完全退出，几乎不增加开销。

---

## 为什么用 Omni

### 1. Invisible by default

简单任务 → NOOP。

Omni 不为了体现存在感而介入。

### 2. Focused context

复杂任务只给模型真正相关的代码、调用关系、测试和约束。

### 3. Failure-aware recovery

失败后不会只把同一个 prompt 再跑一次。

相同失败重复出现时，会自动换策略：扩大上下文、重新调查、换能力、重新规划。

### 4. Proven completion

**Done is proven, not declared.**

每个验收标准都绑定证据；没有证据不能算完成。

---

## 与其他项目的区别

| Project type     | Main purpose                                         |
| ---------------- | ---------------------------------------------------- |
| DeepSeek Harness | Agent runtime / tools / execution                    |
| Agent Skills     | Reusable task expertise                              |
| Router Standard  | DeepSeek persona / attention / workflow routing      |
| Omni             | **Task reliability / context / evidence / recovery** |

> Omni intentionally reuses the layers above instead of replacing them.

---

## 与 dsh-routing-suite / Router Standard 的关系

Omni 与 Router Standard 可以同时使用，但解决的问题不同。

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

一句话：

> **Router Standard 决定 DeepSeek 怎么工作；Omni 判断工程任务是否真正完成。**

检测到 Router Standard 时，Omni 会主动让出 reasoning/persona routing，避免两个 Router 同时控制模型。

---

## 生态兼容与致谢

### Inspirations

Omni 的设计受到 DeepSeek Harness 社区多个项目的启发，尤其是：

- `dsh-router-standard / dsh-routing-suite`
  - persona routing
  - attention engineering
  - progressive disclosure
  - real Harness assembly-chain research

### Integrations

- 自动检测 Router Standard
- 检测到后 delegate reasoning/persona routing
- 消费其产生的 tool/evidence 信号（如果可用）

### Omni-compatible

一个插件不需要为 Omni 专门改造。

只要它能够通过 DSH 暴露工具、事件或 capability metadata，Omni 就可以把它视为一个 capability / evidence provider。

```text
Existing plugin
     ↓
DSH
     ↓
tool / event / capability metadata
     ↓
Omni understands it
```

| Project / Capability        | Omni strategy                          |
| --------------------------- | -------------------------------------- |
| `dsh-router-standard`       | **Delegate** persona/reasoning routing |
| DSH native Skills           | **Reuse** automatic activation         |
| Browser plugin              | **Reuse** browser capability           |
| Testing/verification Skills | **Reuse evidence/results**             |
| Git plugins                 | **Reuse** native workflow              |
| MCP servers                 | **Treat as host capabilities**         |
| Missing capability          | **Provision only when necessary**      |

> **Omni 不替代优秀插件，而是让它们在同一个任务可靠性闭环中协同工作。**

---

## 安装

```bash
dsh plugin --profile web add dsh-omni-router
```

或通过 npm：

```bash
npm i dsh-omni-router
cd node_modules/dsh-omni-router
node scripts/install-preset.mjs
```

重启 DSH，新建会话时选择 **Omni Router**。

---

## Proof of Completion

每个验收标准都有 id（如 `C1`、`C2`）。每个标准必须至少有一条 fresh evidence
记录并满足要求的信任等级：

| Trust | Source |
|---|---|
| T0 | model claim |
| T1 | agent observation / model-written JSON |
| T2 | host/tool output |
| T3 | deterministic command/test execution |
| T4 | independent / hidden verifier |

最终输出：

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

而不会假装完成。

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

在数据达到这些 Gate 之前，不会宣称 frontier parity。

等真实数据跑出来后会更新为：

```text
Raw Flash        XX%
Flash + Omni     YY%
Δ                 +ZZpp
False completion X%
Cost              X.X×
```

运行方式：

```bash
npm run omnibench:v2:generate -- benchmark/omnibench-v2/manifest.local.example.json
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/manifest.local.example.json --exec
node benchmark/omnibench-v2/matrix.mjs <results.json>
node benchmark/omnibench-v2/gates.mjs <results.json>
```

---

## 架构

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

## 开发者模式

默认模型可见工具只有：

- `omni_status`
- `omni_explain`
- `omni_doctor`

旧 runtime / benchmark / capability 工具在默认模式下不注册。

需要时设置：

```yaml
developerMode: true
# 或
exposeDeveloperTools: true
```

---

## FAQ

**Q: 它会拖慢简单任务吗？**

A: 不会。L0 是真正的 NOOP，Omni 不注入任何 prompt。

**Q: 它会替换 DeepSeek Harness 吗？**

A: 不会。DSH 仍然拥有执行、工具、Skills、插件、Runtime。

**Q: 它会接管我的插件吗？**

A: 不会。Omni 只定义“任务达到什么状态才算成功”，不调度具体插件。

**Q: 它和 Router Standard 冲突吗？**

A: 不冲突。检测到 Router Standard 时，Omni 主动让出 reasoning/persona routing，只负责可靠性闭环。

**Q: 没有 DSH 事件时还能证明完成吗？**

A: 会显示 `Verified / Partially Verified / Unverified`，不会谎报完成。

---

> **Reuse what works. Coordinate what matters. Verify what finishes.**
>
> **好的能力直接复用，关键环节统一协作，最终结果必须验证。**