import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  collectResults,
  formatResultSummary,
  importBenchmarkRecord,
  missingTaskIds,
  summarizeResults,
} from '../src/benchmark-results.mjs'

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'omnibench-'))
}

test('collectResults and summarizeResults count raw/omni runs', () => {
  const root = makeRoot()
  try {
    fs.mkdirSync(path.join(root, 'raw'), { recursive: true })
    fs.mkdirSync(path.join(root, 'omni'), { recursive: true })
    fs.writeFileSync(path.join(root, 'raw', 'real-001.json'), JSON.stringify({ id: 'real-001', arm: 'raw', task: 't1', success: true }))
    fs.writeFileSync(path.join(root, 'omni', 'real-001.json'), JSON.stringify({ id: 'real-001', arm: 'omni', task: 't1', success: true }))
    fs.writeFileSync(path.join(root, 'omni', 'real-002.json'), JSON.stringify({ id: 'real-002', arm: 'omni', task: 't2', success: false }))

    const groups = collectResults(root)
    assert.equal(groups.raw.length, 1)
    assert.equal(groups.omni.length, 2)
    const summary = summarizeResults(groups)
    assert.equal(summary.raw.count, 1)
    assert.equal(summary.omni.successRate, 0.5)
    assert.match(formatResultSummary(summary), /OmniBench results/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('importBenchmarkRecord writes a normalized JSON file', () => {
  const root = makeRoot()
  try {
    const file = importBenchmarkRecord(root, { id: 'real-003', arm: 'omni', task: 't3', success: true })
    assert.ok(fs.existsSync(file))
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(saved.id, 'real-003')
    assert.equal(saved.arm, 'omni')
    assert.equal(saved.success, true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('importBenchmarkRecord rejects invalid arm or missing id', () => {
  const root = makeRoot()
  try {
    assert.throws(() => importBenchmarkRecord(root, { id: 'x', arm: 'bad', task: 't' }), /valid id and arm/)
    assert.throws(() => importBenchmarkRecord(root, { arm: 'raw', task: 't' }), /valid id and arm/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('missingTaskIds reports tasks without both arms', () => {
  const root = makeRoot()
  try {
    fs.mkdirSync(path.join(root, 'raw'), { recursive: true })
    fs.writeFileSync(path.join(root, 'raw', 'real-001.json'), JSON.stringify({ id: 'real-001', arm: 'raw', task: 't1', success: true }))
    const tasks = [
      { id: 'real-001' },
      { id: 'real-002' },
    ]
    const missing = missingTaskIds(root, tasks)
    assert.equal(missing.length, 2)
    assert.deepEqual(missing.map((m) => m.id), ['real-001', 'real-002'])
    assert.equal(missing[0].raw, true)
    assert.equal(missing[0].omni, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})