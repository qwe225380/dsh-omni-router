# Changelog

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
