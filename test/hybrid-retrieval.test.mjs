import test from 'node:test'
import assert from 'node:assert/strict'

import { formatRetrievalResults, retrieveContext } from '../src/hybrid-retrieval.mjs'

const entries = [
  { name: 'src', type: 'directory' },
  { name: 'auth.ts', type: 'file' },
  { name: 'auth.test.ts', type: 'file' },
  { name: 'user.ts', type: 'file' },
]
const files = {
  'auth.ts': 'export function login() {}',
  'auth.test.ts': 'test("login works", () => {})',
  'user.ts': 'export function getUser() {}',
}

test('retrieveContext ranks lexical and symbol matches', () => {
  const result = retrieveContext('login', entries, files)
  assert.ok(result.candidates.some((c) => c.name === 'auth.ts'))
  assert.ok(result.candidates.some((c) => c.name === 'auth.test.ts'))
})

test('formatRetrievalResults renders candidates with scores', () => {
  const result = retrieveContext('login', entries, files)
  const text = formatRetrievalResults(result)
  assert.match(text, /Hybrid retrieval/)
  assert.match(text, /auth.ts/)
})
