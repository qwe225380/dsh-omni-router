# OmniBench Smoke Run

最小 Smoke：**1 repo × 1 bug × raw/omni 2 arms × 3 runs = 6 runs**。
只验证链路：`bootstrap → preflight → headless → code change → hidden verifier → results.json → matrix`，不要求 Release Gates 全过。

## 文件

```text
fixture-pagination/     pagination off-by-one bug fixture（普通文件提交，不含 .git）
scripts/verify-task.js  独立 hidden verifier（0=fixed / 1=present / 2+=infra）
bootstrap.mjs           每台机器一次：重建 fixture git、按本机路径重写 smoke.json、
                        生成 omni.patch.yml + omni-package-path.txt、创建 homes/
bootstrap-omni.cmd      把 dsh-omni-router 装进 homes/omni 的 headless profile
preflight.mjs           --dump-config 身份验证（raw ≠ omni-router；omni = omni-router）
run.mjs                 编排器：preflight → 6 runs → 结果路径 → matrix
run-raw.cmd             raw arm：独立 DSH_HOME + headless，标准/default 组合
run-omni.cmd            omni arm：独立 DSH_HOME + headless + --patch omni.patch.yml
omni.patch.yml          （bootstrap 生成）官方 loader patch：把 omni-router 行插入
                        headless host plane + agentPresets.defaultId=omni-router
run-fake.cmd/fix-agent.js  沙箱假 agent（链路自检用，不用于真实成绩）
smoke.json              manifest（bootstrap 重写 repo/commit/agent 命令）
results/                统一结果目录（OMNIBENCH_RESULTS=smoke/results）
```

## 完整运行流程（复制即用）

```bash
# ① bootstrap（每台机器一次；自动计算所有本机路径）
node benchmark/omnibench-v2/smoke/bootstrap.mjs

# ② omni bootstrap（把 Omni 装进独立 DSH_HOME 的 headless profile）
benchmark\omnibench-v2\smoke\bootstrap-omni.cmd

# ③+④+⑤+⑥ 一键：preflight(raw/omni) → 6 runs → 最新 results 路径 → matrix
node benchmark/omnibench-v2/smoke/run.mjs
```

也可以分开执行：

```bash
# ③ preflight（任一条 FAIL 会 fail-closed，禁止开始计结果）
node benchmark/omnibench-v2/smoke/preflight.mjs --arm raw
node benchmark/omnibench-v2/smoke/preflight.mjs --arm omni

# ④ 执行 6 runs
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/smoke/smoke.json --exec

# ⑤ 最新结果文件（写进 smoke/results/）
dir benchmark\omnibench-v2\smoke\results

# ⑥ matrix
node benchmark/omnibench-v2/matrix.mjs <smoke/results 下最新 json>
```

## omni arm 如何保证使用 Omni（官方机制）

- 官方 shipped `headless` bundle 不组合 preset roster（见 dsh-headless 源码注释），模型行读 host 全局层。
- omni arm 通过官方 **loader patch overlay**（`--patch omni.patch.yml`，launcher 官方 flag）把 `omni-router` 行插入 headless host plane，并尽力设置 `agentPresets.defaultId: omni-router`。
- raw arm 不带 patch，保持标准/default 组合。
- `preflight.mjs` 用官方 **`dsh --profile headless --dump-config`**（不 boot Agent）证明两侧身份：
  - raw：组合中不含 omni-router → PASS
  - omni：组合中含 omni-router → PASS
  - 无法证明 → FAIL，run.mjs 直接停止，不产生任何计分结果。

## verifier exit contract

```text
0   → bug fixed
1   → bug present
2+  → infra error（run 无效）
```

## 沙箱链路自检（无需 DSH）

```bash
node benchmark/omnibench-v2/smoke/bootstrap.mjs
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/smoke/smoke.json --exec --agent-command 'call <smoke\run-fake.cmd 的短路径或绝对路径>'
```

已实测：6/6 passed，matrix/gates 输出正常。