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
- [x] Context Graph 完整版（真实依赖图解析：import/call/extends/implements）
- [x] 降低 false-direct / false-plan（556 任务上均为 0.0%）
- [x] OmniBench 真实双臂数据（10 个 L1-L10 任务，raw/omni 各 10 次，2026-08-21）
- [x] Integration Phase P0：Capability Brain 接入 Mission Runtime、Project Brain v3 接入默认 Context、DAG failure/retry lineage、统一 ExecutionBudget、Evidence 禁文本绕过、TaskDecision 持久化、maxParallel 暴露
- [x] Integration Phase P1 第一批：Planner-generated DAG、Dynamic Context Expansion、Capability Manifest、Failure-aware DAG mutation
- [x] P1/P2：Evidence Store、Memory v3（skill distillation / execution policies / historical failures / cross-session strategies）
- [x] P1/P3：Real capability sandbox、OmniBench v2 scaffold
- [x] CI 多版本矩阵（Node 20/22/24）
- [x] 兼容性文档

## 下一步（按优先级）

- [ ] 多模型实测（DeepSeek / Qwen / 其它）
- [ ] 发布正式版 1.0.0
- [ ] 设置面板（Web UI）
- [ ] 插件市场收录确认

## 长期方向

- Agent Decision Layer：把“用户意图 → 风险评估 → Agent/Skill/Tool 选择 → 执行 → 验证 → 重新路由”抽象成独立层
- Expected Utility 优化：不只追求分类准确率，而是优化 Task Success Rate / token cost / latency
