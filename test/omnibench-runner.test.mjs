import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildPrompt,
  readManifests,
  runCommand,
  validateManifests,
  writeResults,
} from '../benchmark/omnibench-v2/run.mjs'

test('buildPrompt includes task and BENCHMARK marker', () => {
  const manifest = { task: 'Fix pagination', acceptance: ['all tests pass'] }
  const raw = buildPrompt(manifest, 'raw')
  assert.match(raw, /Fix pagination/)
  assert.match(raw, /BENCHMARK: PASS/)
  const omni = buildPrompt(manifest, 'omni')
  assert.match(omni, /Omni control plane/)
})

test('validateManifests returns errors for invalid manifest', () => {
  const errors = validateManifests([{ id: 'x' }])
  assert.ok(errors.length >= 3)
  assert.equal(validateManifests([{
    id: 'x',
    repo: 'r',
    commit: 'c',
    task: 't',
    acceptance: ['a'],
    runs: 3,
  }]).length, 0)
})

test('readManifests supports single object and array', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnibench-read-'))
  try {
    const file = path.join(dir, 'manifest.json')
    fs.writeFileSync(file, JSON.stringify({ id: 'one', repo: 'r', commit: 'c', task: 't', acceptance: ['a'], runs: 3 }))
    assert.equal(readManifests(file).length, 1)
    fs.writeFileSync(file, JSON.stringify([{ id: 'one', repo: 'r', commit: 'c', task: 't', acceptance: ['a'], runs: 3 }]))
    assert.equal(readManifests(file).length, 1)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('runCommand captures exit code and output', () => {
  const ok = runCommand('node -e "console.log(1)"', process.cwd())
  assert.equal(ok.exitCode, 0)
  assert.match(ok.output, /1/)
  const bad = runCommand('node -e "process.exit(3)"', process.cwd())
  assert.equal(bad.exitCode, 3)
})

test('writeResults writes JSON result file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnibench-write-'))
  try {
    const file = writeResults([{ id: 'x', success: true }], dir)
    assert.ok(fs.existsSync(file))
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(parsed[0].success, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})