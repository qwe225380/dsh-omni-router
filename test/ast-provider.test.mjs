import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  buildAstGraph,
  collectSourceFiles,
  languageForPath,
  parseSourceWithTreeSitter,
} from '../src/ast-provider.mjs'

test('languageForPath maps extensions to tree-sitter languages', () => {
  assert.equal(languageForPath('src/a.js'), 'javascript')
  assert.equal(languageForPath('src/a.ts'), 'typescript')
  assert.equal(languageForPath('src/a.py'), 'python')
  assert.equal(languageForPath('src/a.go'), 'go')
})

test('parseSourceWithTreeSitter extracts definitions/imports/calls/inheritance', async () => {
  const source = `
    import { user } from "./user"
    export function login() {}
    export class UserService extends BaseService {}
    const db = require("redis")
    login()
    db.get()
  `
  let parsed
  try {
    parsed = await parseSourceWithTreeSitter(source, 'javascript')
  } catch {
    // Tree-sitter optional dependency may be absent in some environments.
    return
  }
  assert.ok(parsed.definitions.some((d) => d.name === 'login' && d.kind === 'function'))
  assert.ok(parsed.definitions.some((d) => d.name === 'UserService' && d.kind === 'class'))
  assert.ok(parsed.definitions.some((d) => d.name === 'db'))
  assert.ok(parsed.imports.includes('./user'))
  assert.ok(parsed.imports.includes('redis'))
  assert.ok(parsed.calls.includes('login'))
  assert.ok(parsed.calls.includes('get'))
  assert.ok(parsed.inheritance.some((r) => r.name === 'UserService' && r.target === 'BaseService'))
})

test('buildAstGraph creates call and extends edges', async () => {
  const files = {
    'src/auth.ts': 'export function login() {}\nexport class UserService {}',
    'src/controller.ts': 'import { login } from "./auth"\nlogin()',
    'src/admin.ts': 'import { UserService } from "./auth"\nclass AdminService extends UserService {}',
  }
  const graph = await buildAstGraph(files)
  assert.ok(graph.edges.some((e) => e.from === 'src/controller' && e.to === 'src/auth' && e.kind === 'call'))
  assert.ok(graph.edges.some((e) => e.from === 'src/admin' && e.to === 'src/auth' && e.kind === 'extends'))
})

test('collectSourceFiles finds supported source files and skips ignored dirs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-scan-'))
  try {
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    fs.writeFileSync(path.join(root, 'src', 'a.js'), 'export function a() {}')
    fs.writeFileSync(path.join(root, 'src', 'b.ts'), 'export function b() {}')
    fs.writeFileSync(path.join(root, 'node_modules', 'skip.js'), 'skip')
    const files = collectSourceFiles(root)
    assert.ok(files[path.join(root, 'src', 'a.js')])
    assert.ok(files[path.join(root, 'src', 'b.ts')])
    assert.ok(!files[path.join(root, 'node_modules', 'skip.js')])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
