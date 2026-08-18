# Omni Router（实验）

> GitHub：https://github.com/qwe225380/dsh-omni-router

一个极简的 DeepSeek Harness Agent 预设，按任务复杂度自动路由：

- **简单 / 明确任务** → 直接使用完整工具执行。
- **复杂 / 模糊任务** → 进入内置 Plan Mode，先生成结构化方案，经你确认后再执行。

## 安装

### 一键安装（推荐）

在仓库根目录执行：

```bash
# Linux / macOS
./install.sh

# Windows PowerShell
./install.ps1

# 跨平台
node scripts/install-preset.mjs
```

安装后重启 DSH，新建会话选择 **Omni Router (experimental)**。

### 手动安装

```powershell
$target = Join-Path $env:USERPROFILE '.dsh\.agent-presets\omni-router'
if (Test-Path -LiteralPath $target) { throw "Preset already exists: $target" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
Copy-Item -Recurse -LiteralPath '.\omni-router' -Destination $target
```

## 行为

1. 第一条真实用户消息被分类为 `plan` 或 `direct`。
2. 编码任务进一步识别为 `bugfix` / `feature` / `refactor` / `test` / `review` / `other`。
3. `plan` 任务进入 DSH 内置 Plan Mode。
4. 在 Plan Mode 中模型会收到：
   - 代码化方案模板（目标、范围、涉及文件、步骤、接口/数据变更、测试计划、风险、兼容性、回滚、验收标准）
   - 自动收集的项目上下文摘要（项目结构 + README/package.json 等关键文件）
   - 编码任务的 TDD 指引（先写失败测试）
   - 交付门提示（完成前用测试/doublecheck 验证）
5. 用户通过 `exit_plan_mode` 批准后才会开始执行。
6. 直接任务会收到轻量验证提示（改完至少跑相关测试或语法检查）。

## 手动控制

- 说 **“直接做”** / **“直接执行”** → 强制直接执行。
- 说 **“先出方案”** / **“先设计方案”** → 强制先出方案。
- 使用 `/omni` 命令：
  - `/omni status` — 查看当前分类和门控状态。
  - `/omni plan` — 进入方案优先模式。
  - `/omni direct` — 进入直接执行模式。
- 或调用模型工具：`omni_status` / `omni_plan` / `omni_direct`。

## 兼容性

- 只使用 DSH 公共扩展点（`session/event`、`system-prompt/assemble`、`ctx.planMode`、`ctx.tools.register`、`ctx.commands`）。
- 不强制依赖 dsh-trio、dsh-doublecheck、superpowers-dsh；已装则自动可用，未装也能正常运行。
- 不修改其它预设。

## 可扩展性

配置位于 `agent.cordis.yml` 的 `omni-router` 行：

```yaml
- id: omni-router
  name: ./src/omni-router.mjs
  config:
    requireConfirmation: true
    useLLMClassification: false   # 设为 true 后，不确定的任务会交给模型判断
    # planFirstKeywords: [自定义, 关键词]
    # directKeywords: [直接跑, 马上改]
```

## 测试

```sh
npm test
# 或
node test/omni-router.test.mjs
```

## 许可证

MIT
