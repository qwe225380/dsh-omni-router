# 架构说明

## 形态

Omni Router 是一个 **DeepSeek Harness Agent 预设**，不是 bundle 插件。

```
omni-router/
├── agent.cordis.yml          # 预设装配
├── preset.yml                # 模式定义
├── src/omni-router.mjs       # 核心逻辑
├── test/omni-router.test.mjs # 单元测试
├── scripts/install-preset.mjs
├── docs/
└── .github/workflows/ci.yml
```

## 核心流程

```
用户第一条消息
   │
   ├─ 识别复杂度（plan / direct）
   ├─ 识别任务类型（bugfix / feature / refactor / test / review / other）
   │
   ├─ direct → 注入轻量验证提示 → 直接执行
   │
   └─ plan → 进入 Plan Mode
        ├─ 自动收集项目上下文
        ├─ 注入代码化方案模板
        ├─ 注入 TDD / 交付门 / Git 工作流提示
        ├─ 用户确认
        └─ 执行
```

## 关键扩展点

| DSH 扩展点 | 用途 |
|---|---|
| `session/event` | 捕获首条用户消息并分类 |
| `system-prompt/assemble` | 注入方案模板、上下文、TDD/交付门/Git 提示 |
| `ctx.planMode` | 进入/退出内置 Plan Mode |
| `ctx.tools.register` | 注册 `omni_status` / `omni_plan` / `omni_direct` |
| `ctx.commands` | 注册 `/omni` 命令 |

## 状态持久化

分类结果通过 `omni/router` 事件写入会话日志，resume/reload 后可恢复。