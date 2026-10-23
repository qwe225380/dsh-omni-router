# 安装指南

## 环境要求

- DeepSeek Harness 0.2.1 系列（`engines.dsh: >=0.2.1-0 <0.3.0`）
- Node.js >= 22

## 一键安装

```bash
# 从仓库根目录
./install.sh          # Linux / macOS
./install.ps1         # Windows PowerShell
node scripts/install-preset.mjs  # 跨平台
```

脚本会把预设安装到 `DSH_HOME` 下的 `.agent-presets/omni-router`；未设置 `DSH_HOME` 时回退到 `~/.dsh`：

```
$DSH_HOME/.agent-presets/omni-router     # 设置了 DSH_HOME（桌面版属于这一类）
~/.dsh/.agent-presets/omni-router        # 未设置 DSH_HOME（CLI 安装）
```

安装后：

1. 完全重启 DSH。
2. 新建空白会话。
3. 选择 **Omni Router**。
4. 发送你的任务。

> 桌面版启动时会扫描该目录并自动登记 preset。standalone `dsh` CLI 不会扫描，
> 需要在 profile patch 里声明 `@deepseek-ai/dsh-agent-preset` 行，详见
> [兼容性说明](COMPATIBILITY.md)。

## 手动安装

```powershell
$home = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $env:USERPROFILE '.dsh' }
$target = Join-Path $home '.agent-presets\omni-router'
if (Test-Path -LiteralPath $target) { throw "Preset already exists: $target" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
Copy-Item -Recurse -LiteralPath '.\omni-router' -Destination $target
```

## 升级

```bash
node scripts/install-preset.mjs --force
```