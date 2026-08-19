# 配置说明

Omni Router 的配置集中在 `agent.cordis.yml` 的 `omni-router` 行：

```yaml
- id: omni-router
  name: ./src/omni-router.mjs
  config:
    requireConfirmation: true
    useLLMClassification: false
    llmConfidenceThreshold: 0.7
    # planFirstKeywords: [自定义, 关键词]
    # directKeywords: [直接跑, 马上改]
```

## 配置项

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `requireConfirmation` | `true` | 复杂任务是否必须进入 Plan Mode 等待确认 |
| `useLLMClassification` | `false` | 是否用模型对“不确定任务”做二次分类 |
| `llmConfidenceThreshold` | `0.7` | 启发式置信度低于该值时触发 LLM 分类 |
| `planFirstKeywords` | 内置关键词 | 额外触发“方案优先”的关键词 |
| `directKeywords` | 内置关键词 | 额外触发“直接执行”的关键词 |

## 手动控制

- 对话中说 **“直接做”** / **“先出方案”** 可临时覆盖自动判断。
- 使用 `/omni plan`、`/omni direct`、`/omni status`、`/omni mode spec|react|balanced` 控制。
- 模型也可调用 `omni_mode` 工具设置思维模式。
