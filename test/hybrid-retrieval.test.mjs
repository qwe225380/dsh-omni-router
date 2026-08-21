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

test('retrieveContext expands through real indexed graph edges', () => {
  const graphEntries = [
    { name: 'auth.ts', type: 'file' },
    { name: 'controller.ts', type: 'file' },
  ]
  const graphFiles = {
    'auth.ts': 'export function login() {}',
    'controller.ts': 'import { login } from "./auth"\nlogin()',
  }
  const graph = {
    'controller.ts': [{ to: 'auth', kind: 'call' }, { to: 'auth', kind: 'import' }],
  }
  const result = retrieveContext('login', graphEntries, graphFiles, { graph })
  assert.ok(result.candidates.some((c) => c.name === 'controller.ts'))
  const controller = result.candidates.find((c) => c.name === 'controller.ts')
  assert.ok(controller.reasons.includes('call') || controller.reasons.includes('import'))
})

test('formatRetrievalResults renders candidates with scores', () => {
  const result = retrieveContext('login', entries, files)
  const text = formatRetrievalResults(result)
  assert.match(text, /Hybrid retrieval/)
  assert.match(text, /auth.ts/)
})
