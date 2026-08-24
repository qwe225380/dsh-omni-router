import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  buildGitGraph,
  indexProjectGraph,
  indexSource,
  openProjectBrain,
  queryRelevant,
  readGitGraph,
} from '../src/project-brain-v2.mjs'

function memoryDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE files (path TEXT PRIMARY KEY, content_hash TEXT, indexed_at TEXT);
    CREATE TABLE symbols (file TEXT, name TEXT, kind TEXT, PRIMARY KEY (file, name));
    CREATE TABLE edges (from_file TEXT, to_file TEXT, kind TEXT, PRIMARY KEY (from_file, to_file, kind));
    CREATE TABLE git_state (id INTEGER PRIMARY KEY CHECK (id = 1), branch TEXT, head TEXT, changed TEXT, staged TEXT, updated_at TEXT);
  `)
  return db
}

test('openProjectBrain creates tables and can close', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pb2-'))
  try {
    const db = openProjectBrain(base)
    db.exec('SELECT 1')
    db.close()
    assert.ok(fs.existsSync(path.join(base, '.omni', 'project-brain.db')))
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('indexSource stores symbols and edges', () => {
  const db = memoryDb()
  indexSource(db, 'src/auth.ts', 'import { user } from "./user"\nexport function login() {}')
  const symbols = db.prepare('SELECT * FROM symbols').all()
  assert.ok(symbols.some((s) => s.name === 'login'))
  const edges = db.prepare('SELECT * FROM edges').all()
  assert.ok(edges.some((e) => e.to_file === 'src/user'))
})

test('indexProjectGraph adds call and extends edges across files', () => {
  const db = memoryDb()
  const files = {
    'src/auth.ts': 'export function login() {}',
    'src/controller.ts': 'import { login } from "./auth"\nlogin()',
  }
  indexSource(db, 'src/auth.ts', files['src/auth.ts'])
  indexSource(db, 'src/controller.ts', files['src/controller.ts'])
  const stats = indexProjectGraph(db, files)
  assert.ok(stats.edgeCount >= 1)
  const callEdge = db.prepare("SELECT * FROM edges WHERE from_file='src/controller' AND kind='call'").all()
  assert.ok(callEdge.some((e) => e.to_file === 'src/auth'))
})

test('queryRelevant finds symbols by task text', () => {
  const db = memoryDb()
  indexSource(db, 'src/auth.ts', 'export function login() {}')
  const rows = queryRelevant(db, 'login')
  assert.ok(rows.some((r) => r.name === 'login'))
})

test('buildGitGraph and readGitGraph round-trip git state', () => {
  const db = memoryDb()
  buildGitGraph(db, { branch: 'main', head: 'abc', changed: ['src/a.ts'], staged: [] })
  const state = readGitGraph(db)
  assert.equal(state.branch, 'main')
  assert.equal(state.head, 'abc')
  assert.deepEqual(JSON.parse(state.changed), ['src/a.ts'])
})