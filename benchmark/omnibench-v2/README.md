# OmniBench v2 (scaffold)

Goal: move from 10 small fixture tasks to a reproducible multi-repo benchmark.

## Requirements (from 优化5.md)

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
  "timeoutMs": 7200000,
  "runs": 5
}
```

See `manifest.example.json`.

## Runner stub

`node benchmark/omnibench-v2/runner-stub.mjs <manifest.json>` validates the
manifest and prints a run plan. Actual execution will be driven by DSH
subagents in a future integration.

## Local / offline usage

If you don't have real GitHub repos or network access, you can use a local git
repo as the benchmark target. `manifest.local.example.json` points at the
existing `Omni group` fixture:

```bash
npm run omnibench:v2:prepare -- benchmark/omnibench-v2/manifest.local.example.json
npm run omnibench:v2:plan -- benchmark/omnibench-v2/manifest.local.example.json
```

`git clone` works with local paths, so no network is required. Replace `repo`
with any local git repository path and `commit` with a commit that exists in
that repo.
