import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContextGraph,
  buildProjectBrain,
  buildTaskContext,
  detectConventions,
} from '../src/project-brain.mjs'

const entries = [
  { name: 'package.json', type: 'file' },
  { name: 'README.md', type: 'file' },
  { name: 'src', type: 'directory' },
  { name: 'auth.ts', type: 'file' },
  { name: 'auth.test.ts', type: 'file' },
  { name: 'order.ts', type: 'file' },
]

const files = {
  'package.json': JSON.stringify({
    name: 'demo',
    type: 'module',
    devDependencies: { typescript: '^5', eslint: '^9', prettier: '^3' },
  }),
  'auth.ts': 'export function login() {}\nexport class AuthService {}\nconst TOKEN_KEY = "token"',
  'auth.test.ts': 'import { login } from "./auth"\ntest("login works", () => {})',
  'order.ts': 'export function createOrder() {}\nconst ORDER_STATUS = "new"',
}

test('buildProjectBrain combines snapshot, symbols, conventions, and counts', () => {
  const brain = buildProjectBrain(entries, files)
  assert.equal(brain.snapshot.packageManager, null)
  assert.equal(brain.snapshot.testFramework, null)
  assert.ok(brain.symbols['auth.ts'].includes('login'))
  assert.ok(brain.symbols['auth.ts'].includes('AuthService'))
  assert.equal(brain.conventions.language, 'typescript')
  assert.equal(brain.conventions.moduleSystem, 'esm')
  assert.equal(brain.conventions.lint, 'eslint')
  assert.equal(brain.conventions.format, 'prettier')
  assert.equal(brain.fileCount, 5)
  assert.equal(brain.directoryCount, 1)
})

test('detectConventions detects python/rust/go basics', () => {
  const py = detectConventions([{ name: 'pyproject.toml', type: 'file' }], { 'pyproject.toml': '[tool.ruff]\n[tool.black]' })
  assert.equal(py.language, 'python')
  assert.equal(py.lint, 'ruff')
  assert.equal(py.format, 'black')

  const rust = detectConventions([{ name: 'Cargo.toml', type: 'file' }])
  assert.equal(rust.language, 'rust')

  const go = detectConventions([{ name: 'go.mod', type: 'file' }])
  assert.equal(go.language, 'go')
})

test('buildTaskContext includes relevant files, symbols, tests, deps, and conventions', () => {
  const context = buildTaskContext('修复登录超时', entries, files, { maxTotalChars: 4000 })
  assert.match(context, /auth\.ts/)
  assert.match(context, /auth\.test\.ts/)
  assert.match(context, /login|AuthService|TOKEN_KEY/)
  assert.match(context, /Related tests/)
  assert.match(context, /Conventions:.*lang=typescript/)
  assert.ok(context.length <= 4000)
})

test('buildContextGraph still maps relevant files to tests', () => {
  const graph = buildContextGraph(entries, '修复登录超时')
  assert.ok(graph.relevant.includes('auth.ts'))
  assert.ok(graph.tests.includes('auth.test.ts'))
})
