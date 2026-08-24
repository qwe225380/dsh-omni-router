# Omni

> GitHub：https://github.com/qwe225380/dsh-omni-router
> [English](./README.md)

> **默认快，必要时聪明，完成必须有证据。**
> **Decide · Compose · Verify**
> 安装即可使用，继续写代码。

**Omni** 是一个 DeepSeek Harness 的 **reliability and orchestration control plane**，定位为 Intelligence Runtime：把复杂度路由、任务编译、项目上下文、能力编排、Mission DAG、Runtime 预算、证据验证、Memory/Learning、Benchmark 组合成一个统一的、自动运行的工程闭环。

## 为什么需要 Omni Router？

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

## 功能

### 核心能力（自带）

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
- **Project Brain v1/v2/v3**：`buildProjectBrain` 聚合仓库快照、符号索引、依赖/测试映射、工程约定；v2 用 SQLite + 轻量 AST + git graph 持久化到 `.omni/project-brain.db`，并解析真实 import/call/extends/implements 图边；可选安装 `web-tree-sitter` + `tree-sitter-wasms` 后自动升级为 Tree-sitter AST 解析（`indexProjectBrainV3WithAst` / `omni_ast_scan`）；v3 在 SQLite 之上叠加 Hybrid Retrieval 沿真实图双向扩展查询。
- **Mission Planner v1**：`buildMission` 把任务组织成 Mission → Phase → Task 骨架，支持动态 Replan。
- **Agent Runtime**：`omni_mission_run` 用真实 subagents 执行 Observe → Think → Act → Replan 循环，带 `maxGlobalSteps` / `maxReplans` / `maxSameActionRetries` / `maxRepairs` / `maxTokens` / `maxCost` / `maxToolCalls` / `maxWallClockMs` 预算。
- **统一主链（优化5 Integration）**：`omni_mission_run` 已接入 Task Compiler → Capability Brain → Mission DAG → `bindCapabilitiesToDag` → DAG Runtime → Evidence，并统一 ExecutionBudget；DAG 失败会保留 failed → Repair → Retry lineage。
- **优化6 Correctness**：Evidence Store 真正累积、failed→repair→retry 可最终 completed、role-aware DAG sandbox、Resolver V2 全链路、event-based failure taxonomy、完整 CI。
- **P1 能力**：Planner-generated DAG（可并行分支）、Dynamic Context Expansion（按 uncertainty 自动升级）、Capability Manifest（插件/skill 声明式能力）、Failure-aware DAG mutation（按失败分类生成 repair）。
- **P1/P2 能力**：Evidence Store（harness-captured 证据记录，`omni_mission_run` 自动采集）、Memory v3（skill distillation、execution policies、historical failures、cross-session strategies）。
- **Memory Engine**：`src/memory-engine.mjs` 统一 Memory v1/v2/v3，主 Runtime 已切换为单一 Memory Engine API。
- **Evidence Engine / Write Locks**：`src/evidence-engine.mjs` 统一证据协议与存储；DAG scheduler 通过 `selectReadyBatch` 避免 write overlap 并行冲突。
- **Stage 3/5**：Recursive Project Index、contextBudget 接入、Per-task Context、Missing capability handling、OmniBench v2 prompt generator。
- **Stage 4（部分）**：`compileDagToWorkflow` 将 Mission DAG 编译为 DSH-native workflow outline。
- **P1/P3 能力**：Real capability sandbox（已接入 `omni_mission_run`，按 role + capability 生成 toolFilter）、Capability Resolver v2（risk/reliability 综合打分）、OmniBench v2 runner（manifest schema + prepare + prompt generation + `--exec` 本地执行/结果采集 + DAG-to-plan compile）。
- **2.1 收敛增强**：Mission Resume（`omni_mission_resume` 跨 session 继续 DAG，`runDagLoop` 支持 `onProgress` 周期保存）、Harness evidence extraction（`extractHarnessEvidence` 从 commands/tests/toolCalls/EVIDENCE_JSON 提取机器可验证证据）、context token budget（`maxContextTokens` 真正限制检索输出）、semantic failure retrieval + evidence-backed skill distillation、OmniBench v2 real runner。
- **2.2 Capability Auto-Provisioning（优化7）**：Capability Auditor（baseline/task-time audit）、Gap Detection、Plugin/Skill Quality Scoring、Minimal Capability Set Solver、Discovery Adapters（marketplace/hub/static registry）、Trusted Auto Provisioning（recommend/auto-trusted/manual）、Post-install probe、Install rollback transaction、Capability performance learning / redundancy detection。
- **2.3 Progressive Intelligence（优化8）**：L0 Direct / L1 Assisted / L2 Orchestrated / L3 Guarded 四级渐进智能；Context Capsule（最小相关上下文 + 动态 needs）；Strategy Shift（相同失败策略自动换策略，不再盲目 retry）；`omni_explain` / `omni_doctor` 用户入口。
- **2.4 Reliability Kernel（优化9）**：TaskContract 统一任务契约；Intervention Gate（默认 NOOP，按 Expected Utility 决定是否介入）；OmniEvent / Host Interface（宿主无关事件与能力协商）；Evidence Trust（T0-T4）与 Invalidation；Context Freshness（workspace fingerprint）；Recovery Policy（retry/repair/expand/replan/escalate/stop）。
- **3.0-convergence M1（优化10）**：success-whitelist 失败处理；主链禁止模型自证（coding 任务需 T2/T3 evidence）；EVIDENCE_JSON 降权 T1；OmniEvent unknown；中文 QueryTokenizer；installer 自动升级；OmniBench fresh worktree/timeout/hidden verifier/raw-omni 分离/真实 telemetry。
- **TaskDecision**：`createTaskDecision` 生成唯一决策对象，Policy/Runtime 统一消费，避免重复 classify 分叉。
- **Evidence Protocol**：`src/evidence.mjs` 用结构化 command/file/test/finding 证据判定 PASS/FAIL；`isQaPass` 已支持从 QA 输出解析 JSON evidence，不再只信文本。
- **Task Compiler**：`compileTask` 生成 objective / constraints / non-goals / acceptance / hidden assumptions / ambiguities / invariants / risk / artifacts；`compileTaskWithLLM` 可用 LLM 增强。
- **Capability Brain**：`src/capability-brain.mjs` 以 provider-agnostic 方式注册/解析/选择能力，缺失时优雅降级；支持从工具名自动发现能力。
- **Role capability sandbox**：QA / Reviewer / Judge 通过 `toolFilter` 禁止 edit/write/shell，权限来自 Runtime 而非模型自觉。
- **Mission DAG**：`src/mission-dag.mjs` 用 Task 依赖图代替固定模板，支持插入任务、就绪调度、并行批次、失败时插入 repair。
- **DAG-driven Runtime**：`runDagLoop` 真正按 DAG 执行 ready tasks，支持 `maxParallel` 并行。
- **Capability-aware DAG**：`bindCapabilitiesToDag` 把 Task 的 requiredCapabilities 解析为具体 provider id。
- **Progressive Context Expansion**：`src/context-expansion.mjs` 按 repo map → symbols → implementations → callers → tests/configs 逐步展开上下文。
- **Hybrid Retrieval**：`src/hybrid-retrieval.mjs` 组合 lexical + symbol + graph/test 扩展，返回排序候选。
- **Failure Taxonomy**：`src/failure-taxonomy.mjs` 稳定分类失败（test/build/dependency/scope/permission/timeout）并给出恢复路径。
- **Memory v2**：`omni_memory` 维护 project/decision/failure/trajectory/learnedSkills；支持 `recordLearnedSkill` / `retrieveLearnedSkill` / `learnFromTrajectory`，自动持久化到 `.omni/memory.json`。
- **Experience-based Router**：`src/experience-router.mjs` 根据 learned skill 偏置后续路由。
- **Capability performance learning**：`recordCapabilityOutcome` 更新 successRate / lastUsed，能力解析优先历史表现。
- **OES False Completion**：评分加入 honesty 维度，惩罚“说 DONE 但实际没完成”。
- **Policy/State Orchestration**：用 `workflowPolicy` 状态机代替大量重复 prompt。
- **Agent 选择**：`selectAgentForTask` 推荐 frontend/backend/db/browser/security/review agent。
- **Fable 风格子代理链**：`omni_delegate` 可运行 builder → qa-verifier → (repair → qa-verifier)* → code-reviewer → judge，独立验证 + 冷读对抗审查 + 证据交接 + 最终裁决。
- **技能建议**：根据任务类型/文本自动提示加载相关技能（`skill` 工具），避免重复实现已有能力。
- **工程原则**：轻量注入 Omni 原创的工程原则、Integrity Rules、独立 Verifier/Repair 证据链（`methodologyDirectives: false` 可关闭）。
- **dsh-routing-suite 兼容**：检测到 router-standard 时自动让出 reasoning-mode 路由，避免重复开发；未检测到时保留 Omni 自身轻量路由。
- **Router Benchmark**：内置 `benchmark/run.mjs`（556 个任务），可评估 accuracy / false-direct rate。
- **Engineering Benchmark v1**：`npm run benchmark:engineering` 用 OES 评分评估端到端工程交付质量（L1-L10）。
- **Real agent-run comparison**：`omni_benchmark` / `omni_benchmark_all` 收集 raw/omni 真实运行结果（`real-tasks.json` 10 个 L1-L10 任务；workspace 没有该文件时自动使用 bundle 内任务集；`omni_benchmark_all` 支持 `maxParallel` 并发采集），`omni_benchmark_status` 查看采集覆盖率，`omni_benchmark_import` 可导入外部会话结果，`npm run benchmark:compare` 输出 OES 对比，`npm run benchmark:continuous` 输出趋势并自动检测回退（支持 `--json`）。
- **Visual QA 硬编排**：前端/UI 任务在 `omni_mission_run` 的 validate 阶段强制 `browser_screenshot` + `omni_visual_check`，未 PASS 则 Replan；可 `autoVisualQA: false` 关闭。
- **Benchmark 分析**：`benchmark/analyze.mjs` 输出混淆矩阵和最高频误判词。
- **LLM 对比评估**：`benchmark/llm-eval.mjs` 可对比 Heuristic vs LLM 路由效果。
- **手动控制**：`/omni` 命令 + `omni_*` 工具。

### 编排复用（推荐安装）

| 插件 | 提供能力 | Omni Router 如何用 |
|---|---|---|
| [dsh-trio](https://github.com/huey1in/trio) | 浏览器自动化、MCP、GitHub/GitLab | 需要浏览器/PR/远程操作时自动可用 |
| [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck) | 交付质量门、验证、返工检测 | 复杂编码任务完成前提示走质量门 |
| [superpowers-dsh](https://github.com/LayneChai/superpowers-dsh) | TDD、调试、规划、协作技能 | 编码任务自动提示加载对应技能 |

> 这些不是强制依赖。装了 → 完整能力；没装 → Omni Router 核心功能依然可用。

## 安装

### 通过 DSH 插件命令一键安装

```bash
dsh plugin --profile web add dsh-omni-router
```

安装后会自动把 Omni Router 预设复制到 `~/.dsh/.agent-presets/omni-router`，重启 DSH 后选择 **Omni Router**。

### 通过 npm 安装

```bash
npm i dsh-omni-router
cd node_modules/dsh-omni-router
node scripts/install-preset.mjs
```

### 一键安装

```bash
# Linux / macOS
./install.sh

# Windows PowerShell
./install.ps1

# 跨平台
node scripts/install-preset.mjs
```

安装后重启 DSH，新建会话选择 **Omni Router**。

## 手动控制

- 说 **“直接做”** / **“直接执行”** → 强制直接执行。
- 说 **“先出方案”** / **“先设计方案”** → 强制先出方案。
- `/omni status` — 查看当前路由状态。
- `/omni plan` — 进入方案优先模式。
- `/omni direct` — 进入直接执行模式。
- `/omni mode spec|react|balanced` — 设置思维模式。
- `/omni reroute plan|direct` — 动态切换当前任务路由。
- 模型工具：`omni_status` / `omni_explain` / `omni_doctor` / `omni_plan` / `omni_direct` / `omni_mode` / `omni_reroute` / `omni_delegate` / `omni_memory` / `omni_benchmark` / `omni_mission_run` / `omni_mission_resume` / `omni_capability_audit` / `omni_capability_provision` / `omni_capability_probe` / `omni_capability_performance` / `omni_visual_check`。

## 配置

```yaml
- id: omni-router
  name: ./src/omni-router.mjs
  config:
    requireConfirmation: true
    useLLMClassification: false
    # planFirstKeywords: [自定义, 关键词]
    # directKeywords: [直接跑, 马上改]
    # Visual QA（OpenAI 兼容视觉端点）
    # autoVisualQA: true
    # visionApiUrl: https://api.openai.com/v1/chat/completions
    # visionApiKey: sk-...
    # visionModel: gpt-4o-mini
```

详细说明见 [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)。

## 仓库结构

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

## 测试

```sh
npm test
```

## 评估

```sh
# 路由准确率（556 个任务）
npm run benchmark

# 工程 OES 示例
npm run benchmark:engineering

# 真实 agent-run OES 对比：Omni vs raw Flash
npm run benchmark:compare

# 查看 OmniBench 采集覆盖率 / 缺失配对
npm run benchmark:status
```

- `benchmark/run.mjs` — `benchmark/tasks.json` 路由准确率 / false-direct / false-plan。
- `benchmark/engineering-run.mjs` — `benchmark/engineering-tasks.json` 的 OES 框架。
- `benchmark/compare.mjs` — 读取 `benchmark/results/{raw,omni}/*.json` 输出 OES 对比。
- 在 DSH 会话中用 `omni_benchmark` 工具采集真实运行结果。

当前路由基线（556 个任务）：
- 复杂度准确率：73.7%
- 任务类型准确率：95.9%
- 思维模式准确率：71.4%
- false-direct 率：0.0%
- false-plan 率：0.0%

当前 OmniBench 真实基线（2026-08-21，10 个 L1-L10 任务）：
- raw：10/10 PASS，平均 OES 1.000
- omni：10/10 PASS，平均 OES 1.000
- 缺失配对：无
- 回退告警：无
- 完整报告：`docs/OmniBench-2026-08-21.md`

## 许可证

MIT