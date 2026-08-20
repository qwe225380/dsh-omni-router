import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  createMemory,
  formatMemory,
  loadMemoryFile,
  recordDecision,
  recordFailure,
  recordProject,
  recordTrajectory,
  saveMemoryFile,
  summarizeMemory,
} from '../src/memory.mjs'

test('createMemory returns empty structured memory', () => {
  const memory = createMemory()
  assert.deepEqual(memory, { project: [], decisions: [], failures: [], trajectory: [] })
})

test('record* appends entries with timestamps', () => {
  let memory = createMemory()
  memory = recordProject(memory, 'repo uses npm + vitest')
  memory = recordDecision(memory, 'use in-process LRU for cache')
  memory = recordFailure(memory, 'tests failed because env var missing')
  memory = recordTrajectory(memory, 'implemented auth service')
  assert.equal(memory.project.length, 1)
  assert.equal(memory.decisions.length, 1)
  assert.equal(memory.failures.length, 1)
  assert.equal(memory.trajectory.length, 1)
  assert.ok(memory.project[0].at)
})

test('record* ignores empty entries', () => {
  let memory = createMemory()
  memory = recordDecision(memory, '')
  assert.equal(memory.decisions.length, 0)
})

test('summarizeMemory renders recent memory sections', () => {
  let memory = createMemory()
  memory = recordProject(memory, 'repo uses npm')
  memory = recordDecision(memory, 'use LRU')
  const summary = summarizeMemory(memory)
  assert.match(summary, /Project memory/)
  assert.match(summary, /repo uses npm/)
  assert.match(summary, /Decision memory/)
  assert.match(summary, /use LRU/)
})

test('formatMemory renders all sections or empty placeholder', () => {
  assert.match(formatMemory(createMemory()), /empty memory/)
  const memory = recordFailure(createMemory(), 'flaky test')
  const text = formatMemory(memory)
  assert.match(text, /## Failures/)
  assert.match(text, /flaky test/)
})

test('saveMemoryFile and loadMemoryFile persist memory to .omni/memory.json', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-memory-'))
  try {
    let memory = createMemory()
    memory = recordDecision(memory, 'use LRU')
    const saved = saveMemoryFile(base, memory)
    assert.ok(saved.endsWith(path.join('.omni', 'memory.json')))
    assert.ok(fs.existsSync(saved))

    const loaded = loadMemoryFile(base)
    assert.equal(loaded.decisions.length, 1)
    assert.equal(loaded.decisions[0].text, 'use LRU')
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('loadMemoryFile returns empty memory when missing', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-memory-missing-'))
  try {
    assert.deepEqual(loadMemoryFile(base), createMemory())
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})
