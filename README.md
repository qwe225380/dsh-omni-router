# Omni Router

> GitHub: https://github.com/qwe225380/dsh-omni-router
> [中文说明](./README.zh-CN.md)

**Omni Router** 是一个 DeepSeek Harness Agent 预设，它不是一个“单一功能插件”，而是一层**智能编排层**：把复杂度路由、思维模式路由、任务类型识别、Plan Mode、项目上下文、TDD、交付门、Git 工作流等能力组合成一个统一的、自动运行的工程闭环。

## Why Omni Router?

单独使用 dsh-routing-suite、dsh-trio、dsh-doublecheck、superpowers-dsh 时，你需要：

- 自己决定什么时候用哪个预设
- 自己记得先出方案还是直接做
- 自己记得要写测试、要验证、要过质量门
- 在不同插件/预设之间手动切换

使用 Omni Router 后，这些判断和编排会自动发生：

```
任务进来
   │
   ├─ 复杂度路由：plan / direct
   ├─ 思维模式路由：spec / react / balanced
   ├─ 任务类型识别：bugfix / feature / refactor / test / review
   │
   ├─ 复杂任务
   │    ├─ 自动进入 Plan Mode
   │    ├─ 自动收集项目上下文
   │    ├─ 生成代码化方案
   │    ├─ 注入 TDD / 交付门 / Git 工作流 / 验收清单提示
   │    ├─ 等你确认
   │    └─ 执行 + 验证
   │
   └─ 简单任务
        └─ 直接执行 + 轻量验证
```

## Features

### Core（核心，自带）

- **复杂度自动路由**：`direct` / `balanced` / `plan` 三态路由，简单任务直接做，复杂/模糊任务先方案。
- **思维模式路由**：自动选择 `spec`（方案优先）/ `react`（直接执行）/ `balanced`（自动）。
- **任务类型识别**：`bugfix` / `feature` / `refactor` / `test` / `review` / `other`。
- **Plan Mode 集成**：复用 DSH 内置 Plan Mode，方案必须经你确认后才执行。
- **项目上下文收集**：按任务类型 + 语义关键词发现相关文件，生成有界上下文摘要。
- **Risk Model**：独立评估风险等级，高风险（数据库/auth/生产配置）即使复杂度低也强制 plan + approval。
- **Adaptive Rerouting**：执行中可通过 `omni_reroute` / `/omni reroute` 在 direct ↔ plan 间动态切换。
- **代码化方案模板**：目标、范围、涉及文件、步骤、接口/数据变更、测试计划、风险、兼容性、回滚、验收标准。
- **TDD 技能路由**：编码任务提示加载 `test-driven-development` / `red-green-tdd`，不重复实现 TDD。
- **交付门技能路由**：完成前提示加载 `verification-before-completion` / `delivery-proof`，不重复实现质量门。
- **Git 技能路由**：编码任务提示加载 `using-git-worktrees` / `git-discipline`。
- **验收清单技能路由**：方案批准后提示加载 `executing-plans` / `writing-plans`。
- **轻量验证技能路由**：简单任务提示加载 `verification-loop` / `verification-before-completion`。
- **状态持久化**：分类/思维模式/任务类型写入会话事件，resume 可恢复。
- **降级保护**：Plan Mode 不可用时自动限制为只读工具。
- **Hybrid 分类**：启发式置信度 + 低置信度时 LLM 结构化分类。
- **Policy Engine**：`buildPolicyDecision` 统一输出完整决策对象（taskType/complexity/risk/executionMode/approval/verification/gitPolicy）。
- **Intent Engine**：`buildIntent` 提取 desired outcome / constraints / acceptance criteria。
- **Context Budget**：`buildContextBudget` 按复杂度/风险分配上下文预算。
- **Next Best Action**：`decideNextAction` 作为 Agent Runtime 核心 API，根据状态返回下一步行动。
- **Repository Snapshot**：`buildRepositorySnapshot` 识别包管理器、测试框架、框架、入口点。
- **Project Brain v1/v2**：`buildProjectBrain` 聚合仓库快照、符号索引、依赖/测试映射、工程约定；`buildTaskContext` 生成有界任务上下文；v2 用 SQLite + 轻量 AST + git graph 持久化到 `.omni/project-brain.db`。
- **Mission Planner v1**：`buildMission` 把任务组织成 Mission → Phase → Task 骨架，支持动态 Replan。
- **Agent Runtime**：`omni_mission_run` 用真实 subagents 执行 Observe → Think → Act → Replan 循环，带 `maxGlobalSteps` / `maxReplans` / `maxSameActionRetries` / `maxTokens` / `maxCost` 预算。
- **TaskDecision**：`createTaskDecision` 生成唯一决策对象，Policy/Runtime 统一消费，避免重复 classify 分叉。
- **Evidence Protocol**：`src/evidence.mjs` 用结构化 command/file/test/finding 证据判定 PASS/FAIL，不再只信文本。
- **Task Compiler**：`compileTask` 生成 objective / constraints / non-goals / acceptance / hidden assumptions / ambiguities / invariants / risk / artifacts。
- **Capability Brain**：`src/capability-brain.mjs` 以 provider-agnostic 方式注册/解析/选择能力，缺失时优雅降级。
- **Role capability sandbox**：QA / Reviewer / Judge 通过 `toolFilter` 禁止 edit/write/shell，权限来自 Runtime 而非模型自觉。
- **Mission DAG**：`src/mission-dag.mjs` 用 Task 依赖图代替固定模板，支持插入任务、就绪调度、并行批次、失败时插入 repair。
- **Failure Taxonomy**：`src/failure-taxonomy.mjs` 稳定分类失败（test/build/dependency/scope/permission/timeout）并给出恢复路径。
- **Memory v1**：`omni_memory` 维护 project/decision/failure/trajectory 结构化记忆，支持长任务 resume；自动持久化到 `.omni/memory.json`。
- **Policy/State Orchestration**：用 `workflowPolicy` 状态机代替大量重复 prompt。
- **Agent 选择**：`selectAgentForTask` 推荐 frontend/backend/db/browser/security/review agent。
- **Fable 风格子代理链**：`omni_delegate` 可运行 builder → qa-verifier → (repair → qa-verifier)* → code-reviewer → judge，独立验证 + 冷读对抗审查 + 证据交接 + 最终裁决。
- **技能建议**：根据任务类型/文本自动提示加载相关技能（`skill` 工具），避免重复实现已有能力。
- **工程原则**：轻量注入 Omni 原创的工程原则、Integrity Rules、独立 Verifier/Repair 证据链（`methodologyDirectives: false` 可关闭）。
- **dsh-routing-suite 兼容**：检测到 router-standard 时自动让出 reasoning-mode 路由，避免重复开发；未检测到时保留 Omni 自身轻量路由。
- **Router Benchmark**：内置 `benchmark/run.mjs`（399 个任务），可评估 accuracy / false-direct rate。
- **Engineering Benchmark v1**：`npm run benchmark:engineering` 用 OES 评分评估端到端工程交付质量（L1-L10）。
- **Real agent-run comparison**：`omni_benchmark` 工具收集 raw/omni 真实运行结果，`npm run benchmark:compare` 输出 OES 对比。
- **Visual QA 硬编排**：前端/UI 任务在 `omni_mission_run` 的 validate 阶段强制 `browser_screenshot` + `omni_visual_check`，未 PASS 则 Replan；可 `autoVisualQA: false` 关闭。
- **Benchmark 分析**：`benchmark/analyze.mjs` 输出混淆矩阵和最高频误判词。
- **LLM 对比评估**：`benchmark/llm-eval.mjs` 可对比 Heuristic vs LLM 路由效果。
- **手动控制**：`/omni` 命令 + `omni_*` 工具。

### Orchestrated（编排复用，推荐安装）

| 插件 | 提供能力 | Omni Router 如何用 |
|---|---|---|
| [dsh-trio](https://github.com/huey1in/trio) | 浏览器自动化、MCP、GitHub/GitLab | 需要浏览器/PR/远程操作时自动可用 |
| [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) | 交付质量门、验证、返工检测 | 复杂编码任务完成前提示走质量门 |
| [superpowers-dsh](https://github.com/LayneChai/superpowers-dsh) | TDD、调试、规划、协作技能 | 编码任务自动提示加载对应技能 |

> 这些不是强制依赖。装了 → 完整能力；没装 → Omni Router 核心功能依然可用。

## Install

### One-command via DSH plugin add

```bash
dsh plugin --profile web add dsh-omni-router
```

This installs the bundle and automatically copies the Omni Router preset into `~/.dsh/.agent-presets/omni-router` on first load. Restart DSH, then select **Omni Router**.

### Install via npm

```bash
npm i dsh-omni-router
cd node_modules/dsh-omni-router
node scripts/install-preset.mjs
```

### One-command install

```bash
# Linux / macOS
./install.sh

# Windows PowerShell
./install.ps1

# Cross-platform
node scripts/install-preset.mjs
```

Then restart DSH and select **Omni Router** in a new session.

## Manual overrides

- Say **“直接做”** / **“直接执行”** → force direct execution.
- Say **“先出方案”** / **“先设计方案”** → force plan-first.
- `/omni status` — show current routing state.
- `/omni plan` — enter plan-first mode.
- `/omni direct` — enter direct mode.
- `/omni mode spec|react|balanced` — set thinking mode.
- `/omni reroute plan|direct` — adaptively reroute current task.
- Model tools: `omni_status`, `omni_plan`, `omni_direct`, `omni_mode`, `omni_reroute`, `omni_delegate`, `omni_memory`, `omni_benchmark`, `omni_mission_run`, `omni_visual_check`.

## Configuration

```yaml
- id: omni-router
  name: ./src/omni-router.mjs
  config:
    requireConfirmation: true
    useLLMClassification: false
    # planFirstKeywords: [自定义, 关键词]
    # directKeywords: [直接跑, 马上改]
    # Visual QA (OpenAI-compatible vision endpoint)
    # autoVisualQA: true
    # visionApiUrl: https://api.openai.com/v1/chat/completions
    # visionApiKey: sk-...
    # visionModel: gpt-4o-mini
```

See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for details.

## Repository structure

```
omni-router/
├── agent.cordis.yml
├── preset.yml
├── src/
│   ├── omni-router.mjs
│   ├── agent-chain.mjs
│   ├── agent-runtime.mjs
│   ├── benchmark-runner.mjs
│   ├── compat.mjs
│   ├── engineering-benchmark.mjs
│   ├── judge.mjs
│   ├── memory.mjs
│   ├── methodology.mjs
│   ├── mission-planner.mjs
│   ├── project-brain.mjs
│   ├── project-brain-v2.mjs
│   └── skill-suggest.mjs
├── test/
├── benchmark/
│   ├── run.mjs
│   ├── engineering-run.mjs
│   ├── real-tasks.json
│   ├── compare.mjs
│   └── tasks.json
├── scripts/install-preset.mjs
├── docs/
├── .github/workflows/ci.yml
├── README.md
├── README.zh-CN.md
└── LICENSE
```

## Test

```sh
npm test
```

## Benchmark

```sh
# Router accuracy (399 tasks)
npm run benchmark

# Engineering OES demo (sample data)
npm run benchmark:engineering

# Real agent-run OES comparison: Omni vs raw Flash
npm run benchmark:compare
```

- `benchmark/run.mjs` — router accuracy / false-direct / false-plan on `benchmark/tasks.json`.
- `benchmark/engineering-run.mjs` — OES framework on `benchmark/engineering-tasks.json`.
- `benchmark/compare.mjs` — reads `benchmark/results/{raw,omni}/*.json` and prints OES comparison.
- Collect real runs with the `omni_benchmark` tool inside a DSH session.

Current router baseline (399 tasks):
- complexity accuracy: 67.7%
- false-direct rate: 9.7%
- false-plan rate: 9.7%

## License

MIT
