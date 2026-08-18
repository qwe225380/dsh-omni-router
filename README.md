# Omni Router (experimental)

> GitHub: https://github.com/qwe225380/dsh-omni-router

A minimal DeepSeek Harness agent preset that auto-routes tasks by complexity:

- **Simple / concrete task** → full tool catalog, direct execution.
- **Complex / ambiguous task** → built-in plan mode, structured plan, user approval before execution.

## Install

Copy this directory to `$DSH_HOME/.agent-presets/omni-router`, then restart DSH and select **Omni Router (experimental)** in a new session.

PowerShell:

```powershell
$target = Join-Path $env:USERPROFILE '.dsh\.agent-presets\omni-router'
if (Test-Path -LiteralPath $target) { throw "Preset already exists: $target" }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
Copy-Item -Recurse -LiteralPath '.\omni-router' -Destination $target
```

## Behavior

1. The first real user message is classified as `plan` or `direct`.
2. Coding tasks are further classified as `bugfix` / `feature` / `refactor` / `test` / `review` / `other`.
3. `plan` tasks enter DSH's built-in plan mode.
4. In plan mode the model receives:
   - A code-oriented plan template (goal, scope, involved files, steps, interface/data changes, test plan, risks, compatibility, rollback, acceptance criteria)
   - An auto-collected project context summary (root structure + key files like README/package.json)
5. The user approves via `exit_plan_mode`; execution starts only after approval.

## Manual overrides

- Say **“直接做”** / **“直接执行”** to force direct execution.
- Say **“先出方案”** / **“先设计方案”** to force plan-first.
- Or call the model tools:
  - `omni_status` — show current classification and gate state.
  - `omni_plan` — enter plan-first mode.
  - `omni_direct` — leave plan-first mode.

## Compatibility

- Uses only DSH's public extension seams (`session/event`, `system-prompt/assemble`, `ctx.planMode`, `ctx.tools.register`).
- Does **not** require dsh-trio, dsh-doublecheck, or superpowers-dsh. If those are installed in the profile, their capabilities are available; if not, the preset still works.
- Does not modify other presets.

## Extensibility

Configuration lives in `agent.cordis.yml` under the `omni-router` row:

```yaml
- id: omni-router
  name: ./omni-router.mjs
  config:
    requireConfirmation: true
    # planFirstKeywords: [自定义, 关键词]
    # directKeywords: [直接跑, 马上改]
```

## Test

```sh
node omni-router.test.mjs
```
