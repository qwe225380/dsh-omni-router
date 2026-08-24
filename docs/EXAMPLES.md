# 使用示例

## 1. 复杂任务：自动进入 Plan Mode

**用户输入：**
```
帮我设计一个用户登录功能
```

**Omni Router 行为：**
- 复杂度：`plan`
- 任务类型：`feature`
- 思维模式：`spec`
- 风险：medium
- 自动进入 Plan Mode，要求输出：
  - Goal / Scope / Involved files / Steps / Interface / Test plan / Risks / Compatibility / Rollback / Acceptance criteria
- 用户批准后才会执行

## 2. 简单任务：直接执行

**用户输入：**
```
把这个变量名改成 foo
```

**Omni Router 行为：**
- 复杂度：`direct`
- 任务类型：`other`
- 思维模式：`balanced`
- 直接执行，并提示完成后跑语法/测试检查

## 3. 高风险任务：即使“小改动”也强制 plan

**用户输入：**
```
删掉这个没用的数据库字段
```

**Omni Router 行为：**
- 复杂度：`plan`
- 风险：`high`
- 强制 Plan Mode + 人工确认
- 防止误删生产数据

## 4. 手动覆盖

```
/omni direct        # 强制直接执行
/omni plan          # 强制先出方案
/omni mode spec     # 设置思维模式为 spec
/omni reroute plan  # 执行中动态切到 plan
```

## 5. 委派给专属 Agent

```
omni_delegate task="修复登录接口超时"
```

返回：
```
Suggested agent: security-agent
Subagent service available: yes
Workflow policy: {"planning":"required","approval":"required",...}
```

如果子代理服务可用，会真实派发。