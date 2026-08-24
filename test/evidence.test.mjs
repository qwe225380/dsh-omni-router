import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addCommandEvidence,
  addFileEvidence,
  addFindingEvidence,
  addTestEvidence,
  createEvidence,
  evidencePass,
  extractHarnessEvidence,
  maxEvidenceTrust,
  summarizeEvidence,
} from '../src/evidence.mjs'

test('createEvidence returns empty structured evidence', () => {
  assert.deepEqual(createEvidence(), { commands: [], files: [], tests: [], findings: [] })
})

test('add* functions append structured records', () => {
  let e = createEvidence()
  e = addCommandEvidence(e, { command: 'npm test', exitCode: 0 })
  e = addFileEvidence(e, { file: 'src/a.ts', lines: [1, 2], beforeHash: 'a', afterHash: 'b', diffHash: 'c' })
  e = addTestEvidence(e, { command: 'npm test', exitCode: 0, total: 10, passed: 10, failed: 0 })
  e = addFindingEvidence(e, { finding: 'scope creep', severity: 'medium', file: 'src/a.ts', line: 3 })
  assert.equal(e.commands.length, 1)
  assert.equal(e.files.length, 1)
  assert.equal(e.tests.length, 1)
  assert.equal(e.findings.length, 1)
})

test('evidencePass requires real evidence and rejects failures', () => {
  assert.equal(evidencePass(createEvidence()), false)
  const good = addTestEvidence(createEvidence(), { command: 'npm test', exitCode: 0, total: 5, passed: 5, failed: 0 })
  assert.equal(evidencePass(good), true)
  const bad = addTestEvidence(createEvidence(), { command: 'npm test', exitCode: 1, total: 5, passed: 4, failed: 1 })
  assert.equal(evidencePass(bad), false)
  const critical = addFindingEvidence(createEvidence(), { finding: 'vuln', severity: 'high', file: 'a', line: 1 })
  assert.equal(evidencePass(critical), false)
})

test('summarizeEvidence renders sections', () => {
  let e = addCommandEvidence(createEvidence(), { command: 'npm test', exitCode: 0 })
  e = addTestEvidence(e, { command: 'npm test', exitCode: 0, total: 3, passed: 3, failed: 0 })
  const text = summarizeEvidence(e)
  assert.match(text, /Commands/)
  assert.match(text, /Tests/)
})

test('extractHarnessEvidence normalizes structured result evidence', () => {
  const evidence = extractHarnessEvidence({
    commands: [{ command: 'npm test', exitCode: 0, output: 'ok' }],
    tests: [{ command: 'npm test', exitCode: 0, total: 3, passed: 3, failed: 0 }],
    files: [{ file: 'src/a.ts', lines: [1], beforeHash: 'a', afterHash: 'b', diffHash: 'c' }],
    findings: [{ finding: 'nit', severity: 'low', file: 'src/a.ts', line: 2 }],
  })
  assert.equal(evidence.commands.length, 1)
  assert.equal(evidence.tests.length, 1)
  assert.equal(evidence.files.length, 1)
  assert.equal(evidence.findings.length, 1)
  assert.equal(evidencePass(evidence), true)
  assert.equal(evidence.source, 'tool')
  assert.equal(evidence.trustLevel, 'T3')
})

test('extractHarnessEvidence reads toolCalls as command evidence', () => {
  const evidence = extractHarnessEvidence({
    toolCalls: [
      { name: 'npm test', exitCode: 0, output: 'all pass' },
      { name: 'node run.js', exitCode: 1, output: 'boom' },
    ],
  })
  assert.equal(evidence.commands.length, 2)
  assert.equal(evidence.commands[0].exitCode, 0)
  assert.equal(evidence.commands[1].exitCode, 1)
  assert.equal(evidencePass(evidence), false)
})

test('extractHarnessEvidence parses embedded EVIDENCE_JSON block and downgrades trust', () => {
  const output = 'I ran the checks.\nEVIDENCE_JSON\n{"tests":[{"command":"npm test","exitCode":0,"total":2,"passed":2,"failed":0}]}'
  const evidence = extractHarnessEvidence({ output })
  assert.equal(evidence.tests.length, 1)
  assert.equal(evidencePass(evidence), true)
  assert.equal(evidence.source, 'model')
  assert.equal(evidence.trustLevel, 'T1')
  assert.equal(evidence.tests[0].trustLevel, 'T1')
})

test('per-record trust: plain toolCalls without exitCode never auto-upgrade to T3', () => {
  const evidence = extractHarnessEvidence({
    toolCalls: [{ name: 'npm test', output: 'looks fine' }],
  })
  assert.equal(evidence.commands.length, 0)
  assert.equal(evidence.trustLevel, 'T0')
  assert.equal(maxEvidenceTrust(evidence), 0)
})

test('per-record trust: deterministic command records are T3', () => {
  const evidence = extractHarnessEvidence({
    commands: [{ command: 'npm test', exitCode: 0 }],
  })
  assert.equal(evidence.commands[0].trustLevel, 'T3')
  assert.equal(evidence.commands[0].source, 'tool')
})