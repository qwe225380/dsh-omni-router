import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildDynamicContext,
  nextContextLevel,
  shouldExpandContext,
} from '../src/dynamic-context.mjs'

const entries = [
  { name: 'auth.ts', type: 'file' },
  { name: 'auth.test.ts', type: 'file' },
]
const files = {
  'auth.ts': 'export function login() {}',
  'auth.test.ts': 'test("login works", () => {})',
}

test('shouldExpandContext triggers above threshold', () => {
  assert.equal(shouldExpandContext(0.7), true)
  assert.equal(shouldExpandContext(0.3), false)
})

test('nextContextLevel clamps at max', () => {
  assert.equal(nextContextLevel(0), 1)
  assert.equal(nextContextLevel(10), 4)
})

test('buildDynamicContext expands when uncertainty is high', () => {
  const result = buildDynamicContext('fix login', entries, files, {
    level: 1,
    uncertainty: 0.8,
    threshold: 0.5,
  })
  assert.equal(result.expanded, true)
  assert.equal(result.level, 2)
  assert.match(result.context, /Implementations:/)
})
