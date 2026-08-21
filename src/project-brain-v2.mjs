/**
 * Project Brain v2: SQLite-backed symbol/index + git graph.
 *
 * Uses node:sqlite to persist a lightweight repository brain under
 * .omni/project-brain.db. The "AST" is a light static parse: symbols and
 * import edges. Git state is stored from an externally provided snapshot.
 */

import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { extractSymbolsFromText } from './project-brain.mjs'
import { buildEdgesFromIndexed, buildProjectGraph, extractDefinitions, extractImports, resolveModulePath } from './dependency-graph.mjs'

export function openProjectBrain(cwd) {
  const dir = path.join(cwd, '.omni')
  fs.mkdirSync(dir, { recursive: true })
  const db = new DatabaseSync(path.join(dir, 'project-brain.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      content_hash TEXT,
      indexed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS symbols (
      file TEXT,
      name TEXT,
      kind TEXT,
      PRIMARY KEY (file, name)
    );
    CREATE TABLE IF NOT EXISTS edges (
      from_file TEXT,
      to_file TEXT,
      kind TEXT,
      PRIMARY KEY (from_file, to_file, kind)
    );
    CREATE TABLE IF NOT EXISTS git_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      branch TEXT,
      head TEXT,
      changed TEXT,
      staged TEXT,
      updated_at TEXT
    );
  `)
  return db
}

export function closeProjectBrain(db) {
  try { db.close() } catch { /* best-effort */ }
}

function contentHash(content) {
  let hash = 0
  const text = String(content || '')
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }
  return String(hash)
}

export function indexSource(db, filePath, content) {
  const text = String(content || '')
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO files (path, content_hash, indexed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET content_hash=excluded.content_hash, indexed_at=excluded.indexed_at
  `).run(filePath, contentHash(text), now)

  db.prepare('DELETE FROM symbols WHERE file = ?').run(filePath)
  db.prepare('DELETE FROM edges WHERE from_file = ? OR to_file = ?').run(filePath, filePath)

  const defs = extractDefinitions(text)
  for (const def of defs) {
    db.prepare('INSERT OR IGNORE INTO symbols (file, name, kind) VALUES (?, ?, ?)').run(filePath, def.name, def.kind)
  }
  // Keep the old broad symbol scan as a fallback for unusual syntax.
  for (const name of extractSymbolsFromText(text)) {
    db.prepare('INSERT OR IGNORE INTO symbols (file, name, kind) VALUES (?, ?, ?)').run(filePath, name, 'symbol')
  }

  for (const target of extractImports(text)) {
    if (!target) continue
    const resolved = resolveImport(filePath, target)
    db.prepare('INSERT OR IGNORE INTO edges (from_file, to_file, kind) VALUES (?, ?, ?)').run(filePath, resolved, 'import')
  }
}

function resolveImport(fromFile, target) {
  if (!target.startsWith('.')) return target
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile.replace(/\\/g, '/')), target))
  return base.replace(/\.(m?js|ts|jsx|tsx)$/i, '')
}

/**
 * Write an already-parsed indexed entry (definitions/imports/calls/
 * inheritance) into the SQLite brain for one file.
 */
export function indexSourceFromIndexed(db, filePath, info = {}) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO files (path, content_hash, indexed_at)
    VALUES (?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET content_hash=excluded.content_hash, indexed_at=excluded.indexed_at
  `).run(filePath, String(info.contentHash || ''), now)

  db.prepare('DELETE FROM symbols WHERE file = ?').run(filePath)
  db.prepare('DELETE FROM edges WHERE from_file = ? OR to_file = ?').run(filePath, filePath)

  for (const def of info.definitions || []) {
    db.prepare('INSERT OR IGNORE INTO symbols (file, name, kind) VALUES (?, ?, ?)').run(filePath, def.name, def.kind)
  }
  for (const target of info.imports || []) {
    if (!target) continue
    const resolved = resolveImport(filePath, target)
    db.prepare('INSERT OR IGNORE INTO edges (from_file, to_file, kind) VALUES (?, ?, ?)').run(filePath, resolved, 'import')
  }
}

/**
 * Write cross-file edges from an already-indexed files map into SQLite.
 */
export function indexProjectGraphFromIndexed(db, indexed = {}) {
  const edges = buildEdgesFromIndexed(indexed)
  let edgeCount = 0
  const insert = db.prepare('INSERT OR IGNORE INTO edges (from_file, to_file, kind) VALUES (?, ?, ?)')
  for (const edge of edges) {
    insert.run(edge.from, edge.to, edge.kind)
    edgeCount++
  }
  return { edgeCount, fileCount: Object.keys(indexed || {}).length }
}

/**
 * Index whole-repository graph edges (calls, extends, implements) in addition
 * to the per-file import edges written by indexSource.
 */
export function indexProjectGraph(db, files = {}) {
  const graph = buildProjectGraph(files)
  let edgeCount = 0
  const insert = db.prepare('INSERT OR IGNORE INTO edges (from_file, to_file, kind) VALUES (?, ?, ?)')
  for (const edge of graph.edges) {
    insert.run(edge.from, edge.to, edge.kind)
    edgeCount++
  }
  return { edgeCount, fileCount: Object.keys(files || {}).length }
}

export function buildGitGraph(db, gitInfo = {}) {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO git_state (id, branch, head, changed, staged, updated_at)
    VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET branch=excluded.branch, head=excluded.head, changed=excluded.changed, staged=excluded.staged, updated_at=excluded.updated_at
  `).run(
    String(gitInfo.branch || ''),
    String(gitInfo.head || ''),
    JSON.stringify(gitInfo.changed || []),
    JSON.stringify(gitInfo.staged || []),
    now,
  )
}

export function queryRelevant(db, taskText) {
  const text = String(taskText || '')
  const terms = text.split(/\s+/).filter((t) => t.length >= 2).slice(0, 8)
  const rows = []
  if (terms.length === 0) return rows
  for (const term of terms) {
    const like = `%${term}%`
    rows.push(...db.prepare('SELECT file, name, kind FROM symbols WHERE name LIKE ?').all(like))
    rows.push(...db.prepare('SELECT path AS file, path AS name, \'file\' AS kind FROM files WHERE path LIKE ?').all(like))
  }
  const seen = new Set()
  return rows.filter((r) => {
    const key = `${r.file}:${r.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 50)
}

export function readGitGraph(db) {
  return db.prepare('SELECT branch, head, changed, staged, updated_at FROM git_state WHERE id = 1').get() || null
}
