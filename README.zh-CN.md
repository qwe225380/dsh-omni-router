# Omni Router

> GitHub：https://github.com/qwe225380/dsh-omni-router
> [English](./README.md)

**Omni Router** 是一个 DeepSeek Harness Agent 预设，它不是一个“单一功能插件”，而是一层**智能编排层**：把复杂度路由、思维模式路由、任务类型识别、Plan Mode、项目上下文、TDD、交付门、Git 工作流等能力组合成一个统一的、自动运行的工程闭环。

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
- **Policy/State Orchestration**：用 `workflowPolicy` 状态机代替大量重复 prompt。
- **Agent 选择**：`selectAgentForTask` 推荐 frontend/backend/db/browser/security/review agent。
- **Fable 风格子代理链**：`omni_delegate` 可运行 builder → qa-verifier → (repair → qa-verifier)* → code-reviewer，独立验证 + 冷读对抗审查 + 证据交接。
- **技能建议**：根据任务类型/文本自动提示加载相关技能（`skill` 工具），避免重复实现已有能力。
- **Router Benchmark**：内置 `benchmark/run.mjs`（399 个任务），可评估 accuracy / false-direct rate。
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
- 模型工具：`omni_status` / `omni_plan` / `omni_direct` / `omni_mode` / `omni_reroute`。

## 配置

```yaml
- id: omni-router
  name: ./src/omni-router.mjs
  config:
    requireConfirmation: true
    useLLMClassification: false
    # planFirstKeywords: [自定义, 关键词]
    # directKeywords: [直接跑, 马上改]
```

详细说明见 [docs/CONFIGURATION.md](./docs/CONFIGURATION.md)。

## 仓库结构

```
omni-router/
├── agent.cordis.yml
├── preset.yml
├── src/omni-router.mjs
├── test/omni-router.test.mjs
├── benchmark/run.mjs
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

## 路由评估

```sh
npm run benchmark
```

在 `benchmark/tasks.json` 上报告路由准确率、false-direct / false-plan 率。

当前基线（399 个任务）：
- 复杂度准确率：67.7%
- false-direct 率：9.7%
- false-plan 率：9.7%

## 许可证

MIT
