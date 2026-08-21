# 路线图

## 已完成

- [x] V1 Keyword Router
- [x] V2 Hybrid Router（heuristic + confidence + LLM）
- [x] V3 Risk-aware Router（complexity ≠ risk）
- [x] V4 Adaptive Router（direct ↔ plan 动态切换）
- [x] Agent 选择（frontend/backend/db/browser/security/review）
- [x] Policy/State Orchestration（workflowPolicy）
- [x] Context Graph 第一版（相关文件 + 测试映射 + symbols + dependency hints + 真实符号提取）
- [x] Agent Orchestrator（真实子代理派发）
- [x] Benchmark 399 任务
- [x] Benchmark 扩到 500+（当前 556 个路由任务）
- [x] CI 多版本矩阵（Node 20/22/24）
- [x] 兼容性文档

## 下一步（按优先级）

- [ ] 多模型实测（DeepSeek / Qwen / 其它）
- [ ] 降低 false-direct / false-plan
- [ ] Context Graph 完整版（真实依赖图解析）
- [ ] 发布正式版 1.0.0
- [ ] 设置面板（Web UI）
- [ ] 插件市场收录确认

## 长期方向

- Agent Decision Layer：把“用户意图 → 风险评估 → Agent/Skill/Tool 选择 → 执行 → 验证 → 重新路由”抽象成独立层
- Expected Utility 优化：不只追求分类准确率，而是优化 Task Success Rate / token cost / latency
