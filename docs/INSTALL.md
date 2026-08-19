# 安装指南

## 环境要求

- DeepSeek Harness 0.1.0-rc.6 或兼容版本
- Node.js >= 22

## 一键安装

```bash
# 从仓库根目录
./install.sh          # Linux / macOS
./install.ps1         # Windows PowerShell
node scripts/install-preset.mjs  # 跨平台
```

脚本会把预设安装到：

```
~/.dsh/.agent-presets/omni-router
```

安装后：

1. 完全重启 DSH。
2. 新建空白会话。
3. 选择 **Omni Router**。
4. 发送你的任务。

## 手动安装

```powershell
$target = Join-Path $env:USERPROFILE '.dsh\.agent-presets\omni-router'
if (Test-Path -LiteralPath $target) { throw "Preset already exists: $target" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
Copy-Item -Recurse -LiteralPath '.\omni-router' -Destination $target
```

## 升级

```bash
node scripts/install-preset.mjs --force
```
