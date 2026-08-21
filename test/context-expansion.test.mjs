import test from 'node:test'
import assert from 'node:assert/strict'

import {
  CONTEXT_LEVELS,
  buildProgressiveContext,
  shouldExpand,
} from '../src/context-expansion.mjs'

const entries = [
  { name: 'src', type: 'directory' },
  { name: 'auth.ts', type: 'file' },
  { name: 'auth.test.ts', type: 'file' },
]
const files = {
  'auth.ts': 'export function login() {}',
  'auth.test.ts': 'test("login works", () => {})',
}

test('CONTEXT_LEVELS defines progressive levels', () => {
  assert.equal(CONTEXT_LEVELS.length, 5)
  assert.equal(CONTEXT_LEVELS[0].id, 'repo_map')
})

test('buildProgressiveContext level 0 only shows repo map', () => {
  const text = buildProgressiveContext('fix login', entries, files, { level: 0 })
  assert.match(text, /Repository map/)
  assert.doesNotMatch(text, /Symbols:/)
})

test('buildProgressiveContext higher levels include symbols and implementations', () => {
  const text = buildProgressiveContext('fix login', entries, files, { level: 2 })
  assert.match(text, /Symbols:/)
  assert.match(text, /Implementations:/)
  assert.match(text, /login/)
})

test('buildProgressiveContext renders indexed graph edges at callers level', () => {
  const graph = {
    'controller.ts': [{ to: 'auth', kind: 'call' }],
  }
  const text = buildProgressiveContext('fix login', entries, files, { level: 3, graph })
  assert.match(text, /Callers \/ callees:/)
  assert.match(text, /controller\.ts -> auth \(call\)/)
})

test('shouldExpand triggers above threshold', () => {
  assert.equal(shouldExpand(0.6), true)
  assert.equal(shouldExpand(0.4), false)
})
