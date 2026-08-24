# Omni

> [English](./README.en.md)

DeepSeek Harness 的 Agent Reliability Kernel（智能可靠性内核）。

**默认快。必要时聪明。完成必须有证据。**

Omni 只做三件事：

1. **Decide** — 判断是否值得介入
2. **Prepare** — 准备精准上下文与约束
3. **Verify** — 证明工作真的完成了

> DeepSeek Harness 负责执行。Omni 负责可靠性。

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

## 工作方式

```
用户任务
   ↓
Intervention Gate
   ├─ NOOP   → 原始 DSH（Omni 完全退出）
   ├─ ASSIST → Task Contract + Context + Verify
   └─ GUARD  → 审批 + 独立证据（高风险）
   ↓
DeepSeek Harness 执行
   ↓
Evidence（T0–T4 信任等级）
   ↓
Proof of Completion
```

- 简单任务保持简单：L0 是真正的 no-op，开销接近 0。
- 复杂任务获得 Task Contract、精准 Context Capsule 与 Recovery Policy。
- 只有当验收标准要求时才补齐缺失能力。

## 完成证明

每个验收标准都有 id（如 `C1`、`C2`）。每个标准必须至少有一条 fresh evidence
记录并满足要求的信任等级：

| 信任 | 来源 |
|---|---|
| T0 | 模型声称 |
| T1 | Agent 观察 / 模型自己写的 JSON |
| T2 | Host/tool 输出 |
| T3 | 确定性 command/test 执行 |
| T4 | 独立 / hidden verifier |

最终输出：

```text
Completed.
✓ C1 根因已修复
✓ C2 已添加回归测试
✓ C3 143 个测试通过
Proof: 3/3
```

## Benchmark

```bash
npm run omnibench:v2:generate -- benchmark/omnibench-v2/manifest.local.example.json
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/manifest.local.example.json --exec
node benchmark/omnibench-v2/matrix.mjs <results.json>
node benchmark/omnibench-v2/gates.mjs <results.json>
```

3.0 Release Gate：≥50 repo、≥100 task、每 task ≥3 paired runs、hidden verifier
100%、Medium/Hard uplift ≥10pp、false completion <3%、成本 ≤2.5×。

## 架构

```
kernel/          task-contract · intervention-gate · omni-event · evidence-trust
context/         query-tokenizer · capsule · freshness
recovery/        failure-taxonomy · strategy-shift · recovery-policy
capability/      auditor · quality · solver · provisioner · performance
mission/         mission-ir · planner-dag · mission-dag（兼容层）
host/            interface · dsh-adapter
benchmark/       omnibench-v2 runner · matrix · gates
```

## 高级 / 开发者

- 默认模型可见工具只有：`omni_status`、`omni_explain`、`omni_doctor`。
- 设置 `developerMode: true`（或 `exposeDeveloperTools: true`）才暴露旧的
  runtime / benchmark / capability 工具。
- 历史架构说明：[docs/architecture-history.zh-CN.md](./docs/architecture-history.zh-CN.md)。