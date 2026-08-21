import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProjectGraph,
  extractCalls,
  extractDefinitions,
  extractImports,
  extractInheritance,
  resolveModulePath,
} from '../src/dependency-graph.mjs'

test('extractDefinitions captures exported and local symbols', () => {
  const defs = extractDefinitions(`
    export function login() {}
    export async function refresh() {}
    export class UserService {}
    export const LIMIT = 10
    function helper() {}
    class Internal {}
  `)
  const names = defs.map((d) => d.name)
  assert.ok(names.includes('login'))
  assert.ok(names.includes('refresh'))
  assert.ok(names.includes('UserService'))
  assert.ok(names.includes('LIMIT'))
  assert.ok(names.includes('helper'))
  assert.ok(names.includes('Internal'))
  assert.equal(defs.find((d) => d.name === 'login').exported, true)
  assert.equal(defs.find((d) => d.name === 'helper').exported, false)
})

test('extractImports finds ESM and CJS imports', () => {
  const imports = extractImports(`
    import { user } from './user'
    import './polyfill'
    const db = require('redis')
  `)
  assert.ok(imports.includes('./user'))
  assert.ok(imports.includes('./polyfill'))
  assert.ok(imports.includes('redis'))
})

test('extractCalls filters control keywords and returns callee names', () => {
  const calls = extractCalls(`
    if (x) return
    login(user)
    authService.refresh(token)
    for (let i = 0; i < n; i++) {}
  `)
  assert.ok(calls.includes('login'))
  assert.ok(calls.includes('refresh'))
  assert.ok(!calls.includes('if'))
  assert.ok(!calls.includes('for'))
})

test('extractInheritance finds extends and implements', () => {
  const rels = extractInheritance(`
    class AdminService extends BaseService implements Cacheable, Auditable {}
    interface Repo extends BaseRepo {}
  `)
  assert.ok(rels.some((r) => r.name === 'AdminService' && r.kind === 'extends' && r.target === 'BaseService'))
  assert.ok(rels.some((r) => r.name === 'AdminService' && r.kind === 'implements' && r.target === 'Cacheable'))
  assert.ok(rels.some((r) => r.name === 'Repo' && r.kind === 'extends' && r.target === 'BaseRepo'))
})

test('resolveModulePath normalizes relative specifiers', () => {
  assert.equal(resolveModulePath('src/auth.ts', './user'), 'src/user')
  assert.equal(resolveModulePath('src/auth.ts', '../lib/helper'), 'lib/helper')
  assert.equal(resolveModulePath('src/auth.ts', 'lodash'), 'lodash')
})

test('buildProjectGraph creates call and extends edges from exported symbols', () => {
  const files = {
    'src/auth.ts': 'export function login() {}\nexport class UserService {}',
    'src/controller.ts': 'import { login } from "./auth"\nlogin()',
    'src/admin.ts': 'import { UserService } from "./auth"\nclass AdminService extends UserService {}',
  }
  const graph = buildProjectGraph(files)
  assert.ok(graph.edges.some((e) => e.from === 'src/controller' && e.to === 'src/auth' && e.kind === 'call'))
  assert.ok(graph.edges.some((e) => e.from === 'src/admin' && e.to === 'src/auth' && e.kind === 'extends'))
  assert.ok(graph.edges.some((e) => e.from === 'src/controller' && e.to === 'src/auth' && e.kind === 'import'))
})
