# OmniBench Smoke Run

最小 Smoke：**1 repo × 1 bug × raw/omni 2 arms × 3 runs = 6 runs**。
只验证链路：`runner → headless → code change → hidden verifier → results.json`，不要求 Release Gates 全过。

## 文件

```text
fixture-pagination/   带 pagination off-by-one bug 的本地 git fixture（commit b384172）
scripts/verify-task.js  独立 hidden verifier（0=已修复 1=bug存在 2+=infra）
run-raw.cmd            raw arm：独立 DSH_HOME + headless（无 Omni）
run-omni.cmd           omni arm：独立 DSH_HOME + headless（有 Omni）
bootstrap-omni.cmd     omni arm 一次性初始化（安装 dsh-omni-router 到独立 DSH_HOME）
run-fake.cmd / fix-agent.js  沙箱假 agent（链路验证用，不用于真实成绩）
smoke.json             manifest（runs=3, arms=[raw,omni]）
results/               结果输出目录（OMNIBENCH_RESULTS）
```

## 真实运行步骤

### 0. 初始化 fixture（每台机器一次）

```bash
node benchmark/omnibench-v2/smoke/bootstrap.mjs
```

（fixture 以普通文件提交、不含 .git；bootstrap 会重建 git 仓库并把真实 commit sha 写入 smoke.json，同时创建 raw/omni 的独立 DSH_HOME 目录。）

### 1. 初始化 omni arm（只做一次）

```bat
benchmark\omnibench-v2\smoke\bootstrap-omni.cmd
```

然后在该 DSH_HOME 里确认 `Omni Router` 预设可用。

### 2. 执行 6 次 headless run

```bash
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/smoke/smoke.json --exec
```

- raw arm → `run-raw.cmd`（独立 `DSH_HOME=smoke/homes/raw`）
- omni arm → `run-omni.cmd`（独立 `DSH_HOME=smoke/homes/omni`，含 Omni）

### 3. 查看结果

```bash
node benchmark/omnibench-v2/matrix.mjs smoke/results/<latest>.json
node benchmark/omnibench-v2/gates.mjs smoke/results/<latest>.json
```

Smoke 阶段只要求：6/6 运行完成、validity/verifier/telemetry 链路正确。
Gates 里 `Repositories>=50 / Tasks>=100 / uplift` 等 FAIL 属预期（数据量不足）。

## 沙箱链路自检（无需 DSH）

```bash
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/smoke/smoke.json --exec --agent-command 'call "D:\dsh\DSHWOR~1\01\OMNI-R~1\BENCHM~1\OMNIBE~1\smoke\run-fake.cmd"'
```

已实测：6/6 passed，matrix/gates 输出正常。

## verifier exit contract

```text
0   → bug fixed
1   → bug present
2+  → infra error（run 无效）
```