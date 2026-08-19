# Skill Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Omni automatically suggest relevant existing DSH skills in the system prompt, avoiding redundant implementations.

**Architecture:** New `src/skill-suggest.mjs` with pure mapping/filter/text helpers. `omni-router.mjs` injects `'skills'`, queries `ctx.skills.list`, and adds an `omni-router:skills` prompt section.

**Tech Stack:** Node.js ESM, DSH `ctx.skills`, node:test.

---

### Task 1: Create `src/skill-suggest.mjs`

- [ ] Create module with `suggestSkillsForTask`, `filterAvailableSkills`, `buildSkillSuggestionText`.

### Task 2: Create `test/skill-suggest.test.mjs`

- [ ] Add tests for mapping, filtering, text generation.
- [ ] Run `node test/skill-suggest.test.mjs` → green.

### Task 3: Wire into `src/omni-router.mjs`

- [ ] Add `'skills'` to `inject`.
- [ ] Import helpers.
- [ ] Add `omni-router:skills` section in `system-prompt/assemble` (graceful when `ctx.skills` missing).

### Task 4: Update package/docs/version

- [ ] Add skill-suggest test to `npm test`.
- [ ] Bump version to `1.6.0`.
- [ ] Update CHANGELOG/README.

### Task 5: Verify and finish

- [ ] Run `npm test` → all green.
- [ ] Commit.
