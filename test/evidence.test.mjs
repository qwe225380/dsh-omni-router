import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addCommandEvidence,
  addFileEvidence,
  addFindingEvidence,
  addTestEvidence,
  createEvidence,
  evidencePass,
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
