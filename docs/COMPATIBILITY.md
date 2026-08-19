# 兼容性说明

## 运行环境

- DeepSeek Harness 0.1.0-rc.6 及以上（0.1.0 系列）
- Node.js 20 / 22 / 24（CI 矩阵验证）
- Windows / Linux / macOS

## 可选插件兼容

Omni Router 可独立运行。以下插件安装后会自动增强体验，未安装也不影响核心功能：

- [dsh-trio](https://github.com/huey1in/trio)：浏览器自动化、MCP、GitHub/GitLab
- [dsh-doublecheck](https://github.com/PerryLink/dsh-doublecheck)：交付质量门
- [superpowers-dsh](https://github.com/LayneChai/superpowers-dsh)：TDD / 调试 / 规划技能

## 模型兼容

- 主要面向 DeepSeek 系列模型
- 通过 DSH 标准 `ctx.llm` 接口工作，理论上兼容任何 DSH 支持的 provider
- LLM 结构化分类需要模型能输出 JSON；如果不能，会自动降级为启发式结果

## 已知限制

- Agent preset 形态需要复制到 `~/.dsh/.agent-presets/omni-router`
- `dsh plugin add` 会通过安装器自动复制，但需要重启 DSH 生效
- 风险/计划词库是启发式的，复杂语义仍需 LLM 二次判断
