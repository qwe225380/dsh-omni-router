import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  createMemoryEngine,
  distillSkill,
  loadMemoryEngine,
  saveMemoryEngine,
} from '../src/memory-engine.mjs'

test('createMemoryEngine includes v3 fields', () => {
  const engine = createMemoryEngine()
  assert.ok(Array.isArray(engine.learnedSkills))
  assert.ok(Array.isArray(engine.executionPolicies))
  assert.ok(Array.isArray(engine.crossSessionStrategies))
})

test('memory engine persists and reloads via one API', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mem-engine-'))
  try {
    let engine = createMemoryEngine()
    engine = distillSkill(engine, [{ text: 'ok' }, { text: 'ok' }, { text: 'ok' }], { name: 's', minSuccesses: 3 }).memory
    saveMemoryEngine(cwd, engine)
    const loaded = loadMemoryEngine(cwd)
    assert.ok(loaded.learnedSkills.some((s) => s.name === 's'))
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})