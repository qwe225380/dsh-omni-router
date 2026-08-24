# OmniBench v2

Goal: move from 10 small fixture tasks to a reproducible multi-repo benchmark.

## Requirements (from 优化5.md / 优化6.md)

- 30~100 real GitHub repos
- fixed starting commit
- real issue / task description
- hidden tests
- multiple languages and frameworks
- 10min~2h horizon
- each task runs N>=3 times per arm (raw / omni)
- strict same environment: model, reasoning effort, tools, commit, context, timeout

## Manifest schema

```json
{
  "id": "repo-001",
  "repo": "https://github.com/owner/repo",
  "commit": "fixed-starting-sha",
  "language": "typescript",
  "framework": "express",
  "task": "Fix intermittent login timeout under concurrent session refresh.",
  "acceptance": ["regression test added", "all tests pass"],
  "hiddenTests": ["tests/hidden/session-concurrent.test.js"],
  "setupCommand": "npm ci",
  "baselineCommand": "npm test",
  "agentCommand": "node path/to/dsh-agent-runner.mjs",
  "verifyCommand": "npm run test:hidden",
  "timeoutMs": 7200000,
  "runs": 5
}
```

`setupCommand`, `baselineCommand`, `agentCommand`, and `verifyCommand` are
optional. `agentCommand` receives the generated prompt as a single quoted
argument; when present, `--exec` executes it inside the checked-out repo.

## Generate DSH prompts

```bash
npm run omnibench:v2:generate -- benchmark/omnibench-v2/manifest.local.example.json
```

This writes one prompt per repo/arm/run under `benchmark/omnibench-v2/prompts/`.
Open each prompt in a DSH Desktop session with the Omni Router preset to
execute manually, or wire `agentCommand` to your DSH CLI/runner for automation.

## Run locally (automated)

```bash
# Plan + prompt generation only (default)
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/manifest.local.example.json

# Execute each run with the manifest's agentCommand
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/manifest.local.example.json --exec

# Override the agent command for every run
node benchmark/omnibench-v2/run.mjs benchmark/omnibench-v2/manifest.local.example.json --exec --agent-command "node agent.mjs"
```

The runner clones/checks out each repo, optionally runs setup/baseline/verify
commands, captures exit codes and output, and writes a timestamped JSON result
file to `benchmark/omnibench-v2/results/`.

## Runner stub

`node benchmark/omnibench-v2/runner-stub.mjs <manifest.json>` still validates
the manifest and prints the run plan for quick checks.

## Local / offline usage

If you don't have real GitHub repos or network access, you can use a local git
repo as the benchmark target. `manifest.local.example.json` points at the
existing `Omni group` fixture:

```bash
npm run omnibench:v2:prepare -- benchmark/omnibench-v2/manifest.local.example.json
npm run omnibench:v2:plan -- benchmark/omnibench-v2/manifest.local.example.json
npm run omnibench:v2:generate -- benchmark/omnibench-v2/manifest.local.example.json
```

`git clone` works with local paths, so no network is required. Replace `repo`
with any local git repository path and `commit` with a commit that exists in
that repo.