# Changelog

## [1.27.0] - 2026-08-19

- 继续推进优化3/4.md：
  - Project Brain v3：新增 `src/project-brain-v3.mjs`，SQLite + Hybrid Retrieval 图增强查询
  - Task Compiler LLM 化：`compileTaskWithLLM` 可用 LLM 生成结构化 brief，失败回退启发式
  - Capability Brain 自动发现：`autoPopulateCapabilityBrain` 从已安装工具名自动注册能力
  - Benchmark runner 支持 `falseCompletionRate`

## [1.26.0] - 2026-08-19

- 继续推进优化3/4.md：
  - `omni_mission_run` 切换为 DAG-driven 执行（`runDagLoop`），支持 `maxParallel`
  - `getProjectContext` 接入 Progressive Context Expansion（`progressiveContext` / `contextExpansionLevel` 可配）
  - Hybrid Retrieval：新增 `src/hybrid-retrieval.mjs`（lexical + symbol + graph/test 扩展）
  - Memory v2：新增 `learnedSkills` / `recordLearnedSkill` / `retrieveLearnedSkill`
  - Capability performance learning：`recordCapabilityOutcome` 更新 successRate / lastUsed
  - OES 新增 False Completion Rate（honesty 维度）

## [1.25.0] - 2026-08-19

- P2 深度集成：
  - `runDagLoop`：真正按 Mission DAG 执行 ready tasks，支持并行 `maxParallel`
  - `bindCapabilitiesToDag`：把 Task 的 requiredCapabilities 解析为具体 provider id
  - Progressive Context Expansion：新增 `src/context-expansion.mjs`，按层级逐步展开 repo map → symbols → implementations → callers → tests/configs

## [1.24.0] - 2026-08-19

- P2 优化（依据 优化3/4.md）：
  - Mission DAG：新增 `src/mission-dag.mjs`，Task 带依赖/能力约束/验证/回滚，支持插入、就绪调度、并行批次
  - Observation-driven DAG mutation：`applyObservationToDag` 在 test/build failure 时插入 repair 任务
  - Failure Taxonomy：新增 `src/failure-taxonomy.mjs`，稳定分类失败并给出恢复路径
  - `omni_mission_run` 返回 Mission DAG 视图

## [1.23.0] - 2026-08-19

- P1 优化（依据 优化3/4.md）：
  - Task Compiler：新增 `src/task-compiler.mjs`，生成 objective / constraints / non-goals / acceptance / hidden assumptions / ambiguities / invariants / risk / artifacts
  - Capability Brain：新增 `src/capability-brain.mjs`，provider-agnostic 能力注册、解析、选择、缺失降级
  - Role capability sandbox：`agent-chain` 的 QA / Reviewer / Judge 通过 `toolFilter` 禁止 edit/write/shell，权限来自 Runtime
  - `omni_mission_run` 注入 Task Compiler 生成的 Task Brief

## [1.22.0] - 2026-08-19

- P0 优化（依据 优化3/4.md）：
  - 真实 Replan：`applyObservation` 真正切换到 `nextPhase`，不再只加计数器
  - Runtime budgets：`maxGlobalSteps` / `maxReplans` / `maxSameActionRetries` / `maxTokens` / `maxCost`
  - Evidence Protocol：新增 `src/evidence.mjs`，结构化 command/file/test/finding 证据，`evidencePass` 不再只信文本
  - 统一 TaskDecision：新增 `src/task-decision.mjs`，Policy Engine 消费同一决策对象，避免重复 classify 分叉

## [1.21.0] - 2026-08-19

- Visual QA 硬编排：
  - `omni_mission_run` 在前端/UI 任务的 `validate` 阶段强制要求 `browser_screenshot` + `omni_visual_check`
  - 未出现 `VISUAL_QA: PASS` 视为失败并触发 Replan
  - 新增 `isFrontendTask` / `buildVisualQaStepRequirement`
  - 可通过 `autoVisualQA: false` 关闭

## [1.20.0] - 2026-08-19

- Visual QA 闭环：
  - 新增 `src/visual-qa.mjs`：视觉模型 API 调用、提示词、结果解析
  - 新增 `omni_visual_check` 工具：接收浏览器截图路径 → 调视觉模型 → 返回 PASS/FAIL + findings
  - 支持 OpenAI-compatible 视觉端点（`visionApiUrl` / `visionApiKey` / `visionModel` 或环境变量）
  - 配合 DSH 已装的 `browser_screenshot` 使用，形成“生成 → 截图 → 视觉检查 → 修复”闭环

## [1.19.0] - 2026-08-19

- Project Brain v2：SQLite + 轻量 AST + git graph
  - 新增 `src/project-brain-v2.mjs`，使用 `node:sqlite` 持久化到 `.omni/project-brain.db`
  - 表：files / symbols / edges / git_state
  - `indexSource` 解析符号与 import 边
  - `buildGitGraph` / `readGitGraph` 记录 branch/head/changed/staged
  - `queryRelevant` 按任务文本检索符号与文件

## [1.18.0] - 2026-08-19

- Agent Runtime 真执行循环：
  - 新增 `src/agent-runtime.mjs`：Observe → Think → Act → Replan 状态机
  - `createRuntimeState` / `nextRuntimeAction` / `applyObservation` / `runMissionLoop`
  - 新增 `omni_mission_run` 工具：用真实 subagents 按 Mission 阶段逐步执行，失败自动 Replan

## [1.17.0] - 2026-08-19

- Memory 磁盘持久化：
  - 新增 `loadMemoryFile` / `saveMemoryFile`，写入 `.omni/memory.json`
  - 会话启动时自动加载磁盘记忆，`persistState` 自动保存
  - `omni_memory` 增删改都会落盘，长任务可跨会话 resume

## [1.16.0] - 2026-08-19

- 真实 agent-run benchmark runner：
  - 新增 `src/benchmark-runner.mjs`：归一化 run、OES 评分、raw vs omni 对比
  - 新增 `benchmark/real-tasks.json`（真实任务集）
  - 新增 `benchmark/compare.mjs`：读取 `benchmark/results/{raw,omni}/*.json` 输出对比
  - 新增 `omni_benchmark` 工具：在 DSH 会话内收集真实 raw/omni 单任务结果
  - 新增 `npm run benchmark:compare`

## [1.15.0] - 2026-08-19

- 许可证清理：
  - 卸载全部 `fable5-*` skills（原仓库无许可证，避免再分发）
  - `methodology.mjs` 重写为 Omni 原创表达，移除 fable5 衍生文本
  - `skill-suggest` 移除 `fable5-*` 候选
  - README 不再标注 “Fable5 方法论”，改为 “工程原则”
- 功能不受影响：Project Brain / Mission Planner / Judge / Memory / Agent Chain / Engineering Benchmark 全部保留

## [1.14.0] - 2026-08-19

- Omni Engineering Benchmark v1：
  - 新增 `src/engineering-benchmark.mjs`：OES 评分（六维加权）、L1-L10 分级、批量汇总
  - 新增 `benchmark/engineering-run.mjs` + `benchmark/engineering-tasks.json`
  - 新增 `npm run benchmark:engineering`
  - 从“路由准确率”升级为“端到端工程交付质量”评估框架

## [1.13.0] - 2026-08-19

- Memory v1：新增 `src/memory.mjs`
  - 结构化记忆：project / decisions / failures / trajectory
  - `omni_memory` 工具：status / add / clear
  - 会话事件持久化 memory，resume 可恢复
  - 系统提示注入最近记忆摘要（配合 `fable5-session-state-management`，不重复）

## [1.12.0] - 2026-08-19

- Verifier / Judge / Repair 强化：
  - 子代理链新增最终 `judge` 阶段：builder → qa → (repair → qa)* → code-reviewer → judge
  - 新增 `src/judge.mjs`：六维评分（correctness/completeness/robustness/clarity/scope/honesty）、JUDGE PASS/FAIL、Repair Budget
  - `scoreDelivery` 按最低维度判定 pass/rework，防止“平均分掩盖短板”

## [1.11.0] - 2026-08-19

- Mission Planner v1：新增 `src/mission-planner.mjs`
  - Mission → Phase → Task 骨架（understand/design/implement/validate/deliver）
  - bugfix / refactor 专属阶段
  - `decideReplan` 根据验证失败/新信息/范围变化触发动态 Replan
- Plan Mode 注入 `omni-router:mission` 任务骨架，详细计划仍路由到 `writing-plans` / `fable5-task-planning`

## [1.10.0] - 2026-08-19

- Project Brain v1：新增 `src/project-brain.mjs`
  - 仓库快照、符号索引、依赖/测试映射、工程约定检测
  - `buildTaskContext` 把 Project Brain 压缩成有界任务上下文
- 将仓库智能函数从 `omni-router.mjs` 迁移到 `project-brain.mjs`，保持向后兼容 re-export
- `getProjectContext` 现在使用 Project Brain 生成更精准的任务上下文

## [1.9.0] - 2026-08-19

- dsh-routing-suite 兼容让位模式：检测到 router-standard（`dev_router_status` / `dev_router_mode`）时，Omni 不再抢 reasoning-mode 路由
- 新增 `src/compat.mjs`：router-standard 检测 + 让位提示
- `omni_mode` / `/omni mode` / thinking-mode 提示在 router-standard 存在时自动让位
- Omni 专注 Intent / Policy / Context / Skill 路由 / Methodology / Agent Chain / Verifier / Repair

## [1.8.0] - 2026-08-19

- 接入 fable5 核心原则：Prime Directives、Integrity Rules、独立 Verifier/Repair 证据链
- 新增 `src/methodology.mjs`，以轻量编排层注入系统提示（可 `methodologyDirectives: false` 关闭）
- 技能建议扩展：支持 `fable5-*` 前缀 skills，与 superpowers 共存不冲突
- 已安装 26 个 `fable5-*` skills 到用户技能目录

## [1.7.0] - 2026-08-19

- 去冗余重构：TDD / Delivery Gate / Git / 验收清单 / 轻量验证提示全部改为“加载对应 skill”的短路由提示
- 不再在 Omni 内重复实现 superpowers / dsh-doublecheck 等已有技能能力
- 详细流程交给 `test-driven-development`、`red-green-tdd`、`verification-before-completion`、`delivery-proof`、`using-git-worktrees`、`writing-plans` 等技能

## [1.6.0] - 2026-08-19

- 技能建议：根据任务类型/文本自动注入相关技能名，模型通过 `skill` 工具按需加载
- 新增 `src/skill-suggest.mjs`：任务 → 技能映射、可用性过滤、提示文本生成
- 避免重复实现已有技能能力（调试/TDD/审查/验证等），只做“路由到技能”

## [1.5.1] - 2026-08-19

- 修复 `chain: off` 仍会执行 QA/Repair 的问题：现在严格只跑 builder
- `runAgentChain` 遵循 `buildAgentChain` 的 stages，不再多跑未启用阶段

## [1.5.0] - 2026-08-19

- Fable 风格子代理链：`omni_delegate` 升级为 builder → qa-verifier → (repair → qa-verifier)* → code-reviewer
- 新增 `src/agent-chain.mjs` 模块（Agent Runtime / Verifier 第一块切片）
- 独立 QA Verifier：不信任 builder 口头报告，只接受命令输出/file:line 证据
- 轻量 Repair Loop：qa FAIL 后先根因诊断再补丁，默认最多 1 次（可配，上限 3）
- 对抗性 Code Reviewer：冷读审查，专查假进度/丢需求/弱化测试/越界改动

## [1.4.0] - 2026-08-19

- Intent Engine：`buildIntent` 提取 desired outcome / constraints / acceptance criteria
- Context Budget：`buildContextBudget` 按复杂度/风险分配上下文预算
- Agent Runtime 核心 API：`decideNextAction` 返回下一步最佳行动
- `classifyTaskType` 补充“增加”识别

## [1.3.0] - 2026-08-19

- Policy Engine：`buildPolicyDecision` 统一输出完整决策对象
- Project Brain 第一步：`buildRepositorySnapshot` 仓库快照
- 系统提示注入统一 Policy Decision

## [1.2.0] - 2026-08-19

- 新增 `benchmark/llm-eval.mjs`（Heuristic vs LLM 对比评估）
- 新增 `docs/MULTI_MODEL.md`
- 新增 `npm run llm-eval`

## [1.1.0] - 2026-08-19

- 新增 `benchmark/analyze.mjs`（混淆矩阵 + 高频误判词）
- Router 支持 `balanced` 三态复杂度（计划/直接/平衡）
- 新增 `npm run analyze`

## [1.0.0] - 2026-08-19

- 🎉 正式版发布
- 预设名称从 `Omni Router (experimental)` 改为 `Omni Router`
- 功能已稳定：Hybrid / Risk / Adaptive / Agent 选择 / Policy 状态机 / Context Graph / Agent 派发
- Benchmark 399 任务，CI 多版本矩阵

## [0.24.0] - 2026-08-19

- 新增 `docs/EXAMPLES.md`（使用示例）
- 新增 `docs/ROADMAP.md`（路线图）

## [0.23.0] - 2026-08-19

- Benchmark 扩充到 399 个任务
- 当前基线：complexity accuracy 67.7%，false-direct 9.7%，false-plan 9.7%

## [0.22.0] - 2026-08-19

- Context Graph 真实符号提取：`extractSymbolsFromText` 从文件内容中提取函数/类/常量
- Benchmark 扩充到 351 个任务
- 当前基线：complexity accuracy 69.5%，false-direct 8.2%，false-plan 7.4%

## [0.21.0] - 2026-08-19

- CI 增加 Node 20/22/24 矩阵
- 新增 `docs/COMPATIBILITY.md`
- Benchmark 扩充到 298 个任务
- 当前基线：complexity accuracy 71.5%，false-direct 6.8%，false-plan 8.7%

## [0.20.0] - 2026-08-19

- 247 任务 benchmark：false-direct 0%、false-plan 3.4%
- complexity accuracy 78.1%
- 计划/风险词库进一步精准化

## [0.19.0] - 2026-08-19

- `omni_delegate` 支持真实子代理派发（subagents.start）
- Benchmark 扩充到 247 个任务
- 当前基线：complexity accuracy 72.5%，false-direct 7.4%，false-plan 10.2%

## [0.18.0] - 2026-08-19

- 新增 Dependency Hints（依赖图第一版）
- Benchmark 扩充到 199 个任务
- 当前基线：complexity accuracy 75.9%，false-direct 4.5%，false-plan 10.0%

## [0.17.0] - 2026-08-19

- 151 任务 benchmark：false-direct 0%、false-plan 0%
- complexity accuracy 81.5%
- 风险/计划词库精准化

## [0.16.0] - 2026-08-19

- Benchmark 扩充到 151 个任务
- 当前基线：complexity accuracy 70.2%，false-direct 12.9%，false-plan 15.8%

## [0.15.0] - 2026-08-19

- 计划词库大幅扩充，针对 102 任务 benchmark 误判优化
- false-direct rate 35.7% → 8.9%
- complexity accuracy 58.8% → 72.5%

## [0.14.0] - 2026-08-19

- Symbol 提示：`suggestSymbolsForTask` 根据任务推荐相关符号
- Context Graph 增加 `symbols` 字段，注入上下文
- 新增 `omni_delegate` 工具：推荐专属 agent + 委派计划
- Benchmark 扩充到 102 个任务

## [0.13.0] - 2026-08-19

- 计划词库扩充：改造/迁移/升级/更换/替换/定时任务
- 高风险词补充：连接池
- Benchmark 扩充到 63 个任务
- false-direct rate 30% → 21.9%，false-plan rate 8.3% → 6.3%

## [0.12.0] - 2026-08-19

- False-Plan Rate 优化：移除“优化”强 plan 词、长文本默认 direct + 低置信度
- Context Graph 第一版：`buildContextGraph` 相关文件 + 测试映射
- 风险模型细化：删除操作仅在涉及数据库/生产/auth 时才算高风险
- Benchmark：false-plan rate 16.7% → 8.3%

## [0.11.0] - 2026-08-19

- False Direct Rate 专项优化：风险等级覆盖“修复/删除”等强直执行号
- Benchmark：复杂度准确率 43.6% → 64.1%，false-direct rate 70% → 25%

## [0.10.0] - 2026-08-19

- Agent/Toolchain 选择：`selectAgentForTask` 推荐 frontend/backend/db/browser/security/review agent
- Policy/State Orchestration：`workflowPolicy` 生成状态机（planning/approval/testing/review/git）
- 系统提示注入精简为单一 workflow policy + suggested agent
- Benchmark 扩充到 39 个任务

## [0.9.0] - 2026-08-18

- Risk Model：`estimateRisk` 将风险等级独立于复杂度，高风险强制 plan + approval
- Adaptive Rerouting：`omni_reroute` 工具 + `/omni reroute` 命令，支持 direct ↔ plan 动态切换
- Context Discovery 第一版：`discoverRelevantFiles` 按任务语义发现相关文件/目录
- 状态新增 `riskLevel`，持久化恢复

## [0.8.0] - 2026-08-18

- Hybrid Classification：启发式置信度 + 低置信度 LLM 结构化分类
- 新增 `heuristicComplexity` / `parseLLMClassification`
- 新增 Router Benchmark：`benchmark/run.mjs` + `benchmark/tasks.json`
- 暴露 `npm run benchmark` 评估路由质量

## [0.7.0] - 2026-08-18

- Bundle 插件化：支持 `dsh plugin add dsh-omni-router` 一键安装
- 新增自动安装器插件：加载 bundle 时自动复制预设到 `.agent-presets`

## [0.6.0] - 2026-08-18

- 项目上下文智能裁剪：按任务类型选择关键文件，并限制注入长度
- 新增验收清单提示：方案批准后自动用 todo 追踪验收标准
- 为 npm 发布做好准备（package.json 元数据完整）

## [0.5.0] - 2026-08-18

- 集成思维模式路由：`spec` / `react` / `balanced`
- 新增 `/omni mode` 命令和 `omni_mode` 工具
- README 补充推荐插件说明（dsh-trio / dsh-doublecheck / superpowers-dsh）

## [0.4.0] - 2026-08-18

- 全面标准化仓库结构：新增 `src/`、`test/`、`docs/`、`.github/workflows/ci.yml`
- 新增中文文档 `README.zh-CN.md`
- 新增 `CHANGELOG.md`、`CONTRIBUTING.md`、`SECURITY.md`
- 新增一键安装脚本（`install.ps1` / `install.sh` / `scripts/install-preset.mjs`）
- 新增 Git 工作流提示
- 新增可选 LLM 分类（`useLLMClassification`）
- 新增 `/omni` 命令
- 新增 package.json 元数据

## [0.3.0] - 2026-08-18

- 阶段 2 完成：TDD 提示、doublecheck 交付门、轻量验证

## [0.2.0] - 2026-08-18

- 阶段 1 完成：代码任务类型识别、项目上下文收集、代码化方案模板

## [0.1.0] - 2026-08-18

- 初始版本：复杂度自动路由 + Plan Mode 确认门
