import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContextCapsule,
  expandContextCapsule,
} from '../src/context-capsule.mjs'

const entries = [
  { name: 'src/auth/session.ts', type: 'file' },
  { name: 'src/middleware/auth.ts', type: 'file' },
  { name: 'tests/session-concurrency.test.ts', type: 'file' },
  { name: 'README.md', type: 'file' },
]
const files = {
  'src/auth/session.ts': 'export function refreshSession() { /* refresh logic */ }',
  'src/middleware/auth.ts': 'import { refreshSession } from "../auth/session"',
  'tests/session-concurrency.test.ts': 'test("one refresh per session", () => {})',
  'README.md': '# Project readme',
}
const graph = {
  'src/middleware/auth.ts': [{ to: 'src/auth/session.ts', kind: 'import' }],
}

test('buildContextCapsule includes only relevant files and tests', () => {
  const capsule = buildContextCapsule('Fix session refresh race condition', {
    entries,
    files,
    graph,
    needs: ['callers of refreshSession', 'tests related to concurrent refresh'],
    invariants: ['one refresh request per session'],
    failures: ['expected 1 refresh, got 3'],
    maxFiles: 3,
  })
  assert.match(capsule, /src\/auth\/session\.ts/)
  assert.match(capsule, /session-concurrency\.test\.ts/)
  assert.match(capsule, /one refresh request per session/)
  assert.match(capsule, /expected 1 refresh, got 3/)
  assert.doesNotMatch(capsule, /README\.md/)
})

test('buildContextCapsule truncates to maxTotalChars', () => {
  const capsule = buildContextCapsule('x', { entries, files, graph, maxTotalChars: 100 })
  assert.ok(capsule.length <= 100 + 64)
  assert.match(capsule, /truncated/)
})

test('expandContextCapsule appends requested context', () => {
  const base = buildContextCapsule('fix login', { entries, files, graph })
  const expanded = expandContextCapsule(base, ['tests related to concurrent refresh'], { entries, files, graph })
  assert.match(expanded, /additional context requested/)
  assert.match(expanded, /session-concurrency/)
})