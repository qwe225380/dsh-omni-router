# 多模型评估

Omni Router 通过 DSH 标准 `ctx.llm` 接口工作，理论上兼容任何 DSH 支持的 provider。

## 快速对比评估

项目提供 `benchmark/llm-eval.mjs`，可以用 OpenAI 兼容 API 对比 **Heuristic Router** 和 **LLM Router** 的分类效果：

```bash
OPENAI_API_KEY=sk-... node benchmark/llm-eval.mjs --limit=20
```

可选环境变量：

| 变量 | 默认值 |
|---|---|
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | `gpt-4o-mini` |

## 建议测试模型

- DeepSeek 系列（V3 / V4）
- Qwen 系列
- OpenAI / Claude / Gemini（通过兼容接口）
- 本地模型（Ollama / vLLM）

## 说明

- 该脚本只用于离线对比，不参与 DSH 运行。
- 正式的多模型兼容测试建议在 DSH 真实会话中分别切换 provider 验证。