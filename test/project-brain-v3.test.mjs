import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatBrainV3,
  openProjectBrainV3,
  indexProjectBrainV3,
  indexProjectBrainV3WithAst,
  queryRelevantV3,
} from '../src/project-brain-v3.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const entries = [
  { name: 'auth.ts', type: 'file' },
  { name: 'auth.test.ts', type: 'file' },
]
const files = {
  'auth.ts': 'export function login() {}',
  'auth.test.ts': 'test("login works", () => {})',
}

test('openProjectBrainV3 creates db and indexes files', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pb3-'))
  try {
    const db = openProjectBrainV3(base)
    const stats = indexProjectBrainV3(db, entries, files)
    assert.equal(stats.indexedFiles, 2)
    assert.ok(stats.graphEdges >= 0)
    const result = queryRelevantV3(db, 'login', entries, files)
    assert.ok(result.candidates.some((c) => c.name === 'auth.ts'))
    assert.match(formatBrainV3(result), /Project Brain v3/)
    db.close()
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('indexProjectBrainV3WithAst indexes with tree-sitter when available', async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pb3ast-'))
  try {
    const db = openProjectBrainV3(base)
    const stats = await indexProjectBrainV3WithAst(db, entries, files)
    assert.equal(stats.indexedFiles, 2)
    assert.equal(stats.ast, true)
    const result = queryRelevantV3(db, 'login', entries, files)
    assert.ok(result.candidates.some((c) => c.name === 'auth.ts'))
    db.close()
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})
