import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildPrompt,
  classifyValidity,
  classifyVerify,
  extractMetrics,
  parseTelemetry,
  readManifests,
  runCommand,
  validateManifests,
  writeResults,
} from '../benchmark/omnibench-v2/run.mjs'

test('buildPrompt is identical for every arm (no prompt leakage)', () => {
  const manifest = { task: 'Fix pagination', acceptance: ['all tests pass'] }
  const raw = buildPrompt(manifest, 'raw')
  assert.match(raw, /Fix pagination/)
  assert.match(raw, /BENCHMARK: PASS/)
  const omni = buildPrompt(manifest, 'omni')
  const stack = buildPrompt(manifest, 'stack')
  const stackOmni = buildPrompt(manifest, 'stack_omni')
  const frontier = buildPrompt(manifest, 'frontier')
  assert.equal(omni, raw)
  assert.equal(stack, raw)
  assert.equal(stackOmni, raw)
  assert.equal(frontier, raw)
  assert.doesNotMatch(raw, /Omni control plane/)
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
    baselineCommand: 'node v.js',
    verifyCommand: 'node v.js',
  }]).length, 0)
  const missingVerifiers = validateManifests([{
    id: 'x',
    repo: 'r',
    commit: 'c',
    task: 't',
    acceptance: ['a'],
    runs: 3,
  }])
  assert.ok(missingVerifiers.some((e) => e.includes('baselineCommand')))
  assert.ok(missingVerifiers.some((e) => e.includes('verifyCommand')))
})

test('validateManifests rejects duplicate ids', () => {
  const errors = validateManifests([
    { id: 'dup', repo: 'r1', commit: 'c', task: 't', acceptance: ['a'], runs: 3, baselineCommand: 'node v.js', verifyCommand: 'node v.js' },
    { id: 'dup', repo: 'r2', commit: 'c', task: 't', acceptance: ['a'], runs: 3, baselineCommand: 'node v.js', verifyCommand: 'node v.js' },
  ])
  assert.ok(errors.some((e) => e.includes('duplicate manifest id')))
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

test('classifyValidity implements the exit-code contract', () => {
  assert.equal(classifyValidity({ exitCode: 0 }).taskValid, false)     // bug absent
  assert.equal(classifyValidity({ exitCode: 1 }).taskValid, true)      // bug present
  assert.equal(classifyValidity({ exitCode: 2 }).taskValid, null)      // infra error
  assert.equal(classifyValidity({ exitCode: 1, timedOut: true }).taskValid, null) // timeout
  assert.equal(classifyValidity(null).taskValid, null)                 // missing
})

test('classifyVerify maps 0/1/2+ to pass/fail/infra', () => {
  assert.equal(classifyVerify({ exitCode: 0 }), true)
  assert.equal(classifyVerify({ exitCode: 1 }), false)
  assert.equal(classifyVerify({ exitCode: 2 }), null)
  assert.equal(classifyVerify({ exitCode: 0, timedOut: true }), null)
  assert.equal(classifyVerify(null), null)
})

test('parseTelemetry extracts TELEMETRY_JSON block', () => {
  const output = 'done\nTELEMETRY_JSON\n{"inputTokens":10,"outputTokens":2,"toolCalls":3}'
  const telemetry = parseTelemetry(output)
  assert.equal(telemetry.inputTokens, 10)
  assert.equal(parseTelemetry('no telemetry'), null)
})

test('extractMetrics marks incomplete telemetry as incomplete', () => {
  const empty = extractMetrics('nothing here')
  assert.equal(empty.telemetryComplete, false)
  assert.equal(empty.metrics.inputTokens, 0)
  const full = extractMetrics('TELEMETRY_JSON\n{"inputTokens":10,"outputTokens":2,"cachedTokens":1,"toolCalls":3,"agentTurns":2,"subagents":1,"cost":0.01,"contextTokens":500,"interventions":2}')
  assert.equal(full.telemetryComplete, true)
  assert.equal(full.metrics.toolCalls, 3)
  assert.equal(full.metrics.interventions, 2)
})