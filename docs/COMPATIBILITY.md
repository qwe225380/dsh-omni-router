# 兼容性说明

## 运行环境

- DeepSeek Harness 0.2.1 系列（`package.json` 声明 `engines.dsh: >=0.2.1-0 <0.3.0`）
- Node.js 20 / 22 / 24（CI 矩阵验证）
- Windows / Linux / macOS

`engines.dsh` 是 DSH 插件兼容性检查唯一采信的字段：声明了它，`peerDependencies` 会被忽略；未声明时才逐个检查 `@deepseek-ai/dsh-*` peer。缺少这个字段的插件不会收到任何"兼容性未验证"提示，因此本插件显式声明。

## 安装位置

preset 根目录按 `DSH_HOME` 解析，未设置时回退到 `~/.dsh`：

| 运行形态 | preset 根目录 |
| --- | --- |
| 桌面版（`DSH_HOME` 指向 `…\dsh-desktop\harness`） | `$DSH_HOME/.agent-presets` |
| CLI（未设置 `DSH_HOME`） | `~/.dsh/.agent-presets` |

两种形态对这个目录的处理并不相同：

- **桌面版**：启动时扫描该目录，把 `agent.cordis.yml` 转成 `preset-<id>` 声明行写进 web profile 的 `cordis.patch.yml`，并在写入前自动把 `persona` 的旧字段 `text` 迁移为 `prefix`（原件备份在 `.agent-presets/.persona-prefix-backups/`）。安装器只需把文件放对位置。
- **CLI**：`dsh` 本体不扫描该目录。0.2.x 的 preset 只有在 profile patch 里声明成 `@deepseek-ai/dsh-agent-preset` 行才存在，因此 CLI 用户需要自己加一行（例如通过 `dsh --patch`）。

## 已跟进的内核变更

| 变更 | 发生版本 | 本插件的处理 |
| --- | --- | --- |
| 作用域 `persona` 行的字段 `text` 改名 `prefix` | 0.1.7 系列 | preset 已改用 `prefix`；桌面端另有自动迁移兜底 |
| preset 注册表改为声明式，注册表本身不再扫描目录 | 0.1.7-rc.1 起 | 安装器改为按 `DSH_HOME` 写入目录，交给桌面端登记 |
| 插件兼容性改用 `engines.dsh` / `dsh.minVersion` 判定 | 0.2.0 系列 | `package.json` 增加 `engines.dsh` |
| 安装根目录随桌面版迁移（不再是 `~/.dsh`） | 桌面版 0.1.7+ | 安装器与 `scripts/install-preset.mjs` 优先读取 `DSH_HOME` |

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

- 安装后需要完全重启 DSH，preset 才会出现在列表里
- `dsh plugin add` 通过安装器自动复制 preset；CLI 形态仍需声明 preset 行
- 组合形态 `omni-router-standard` 依赖本机已安装的 `router-standard` preset，缺少时不会创建
- 风险/计划词库是启发式的，复杂语义仍需 LLM 二次判断
