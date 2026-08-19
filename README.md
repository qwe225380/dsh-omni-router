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

- **复杂度自动路由**：简单任务直接做，复杂/模糊任务先方案。
- **思维模式路由**：自动选择 `spec`（方案优先）/ `react`（直接执行）/ `balanced`（自动）。
- **任务类型识别**：`bugfix` / `feature` / `refactor` / `test` / `review` / `other`。
- **Plan Mode 集成**：复用 DSH 内置 Plan Mode，方案必须经你确认后才执行。
- **项目上下文收集**：按任务类型 + 语义关键词发现相关文件，生成有界上下文摘要。
- **Risk Model**：独立评估风险等级，高风险（数据库/auth/生产配置）即使复杂度低也强制 plan + approval。
- **Adaptive Rerouting**：执行中可通过 `omni_reroute` / `/omni reroute` 在 direct ↔ plan 间动态切换。
- **代码化方案模板**：目标、范围、涉及文件、步骤、接口/数据变更、测试计划、风险、兼容性、回滚、验收标准。
- **TDD 提示**：编码任务自动提示“先写失败测试 → 实现 → 通过”。
- **交付门提示**：完成前提示运行测试/doublecheck，防止“假完成”。
- **Git 工作流提示**：分支/worktree、规范 commit、diff 审查。
- **验收清单提示**：方案批准后自动用 todo 追踪验收标准。
- **轻量验证**：简单任务改完也要求跑测试或语法检查。
- **状态持久化**：分类/思维模式/任务类型写入会话事件，resume 可恢复。
- **降级保护**：Plan Mode 不可用时自动限制为只读工具。
- **Hybrid 分类**：启发式置信度 + 低置信度时 LLM 结构化分类。
- **Policy/State Orchestration**：用 `workflowPolicy` 状态机代替大量重复 prompt。
- **Agent 选择**：`selectAgentForTask` 推荐 frontend/backend/db/browser/security/review agent。
- **Router Benchmark**：内置 `benchmark/run.mjs`（39 个任务），可评估 accuracy / false-direct rate。
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
- Model tools: `omni_status`, `omni_plan`, `omni_direct`, `omni_mode`, `omni_reroute`.

## Configuration

```yaml
- id: omni-router
  name: ./src/omni-router.mjs
  config:
    requireConfirmation: true
    useLLMClassification: false
    # planFirstKeywords: [自定义, 关键词]
    # directKeywords: [直接跑, 马上改]
```

See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for details.

## Repository structure

```
omni-router/
├── agent.cordis.yml
├── preset.yml
├── src/omni-router.mjs
├── test/omni-router.test.mjs
├── benchmark/run.mjs
├── scripts/install-preset.mjs
├── docs/ (INSTALL/CONFIGURATION/ARCHITECTURE/COMPATIBILITY/EXAMPLES/ROADMAP)
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
npm run benchmark
```

Reports router accuracy and the critical false-direct / false-plan rates on `benchmark/tasks.json`.

Current baseline (399 tasks):
- complexity accuracy: 67.7%
- false-direct rate: 9.7%
- false-plan rate: 9.7%

## License

MIT
