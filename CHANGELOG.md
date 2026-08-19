# Changelog

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
