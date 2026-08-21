import test from 'node:test'
import assert from 'node:assert/strict'

import { classifyFailure } from '../src/failure-taxonomy.mjs'

test('classifyFailure recognizes test failures', () => {
  const result = classifyFailure({ type: 'test_failure', reason: 'tests failed' })
  assert.equal(result.category, 'test_failure')
  assert.match(result.recovery, /reproduce/)
})

test('classifyFailure recognizes build/dependency/scope/permission', () => {
  assert.equal(classifyFailure({ type: 'build_failure' }).category, 'build_failure')
  assert.equal(classifyFailure({ type: 'missing_dependency' }).category, 'dependency_issue')
  assert.equal(classifyFailure({ type: 'scope_change' }).category, 'scope_change')
  assert.equal(classifyFailure({ type: 'permission_auth', detail: 'denied' }).category, 'permission_auth')
})

test('classifyFailure falls back to unknown', () => {
  assert.equal(classifyFailure({ type: 'something_else' }).category, 'unknown')
})
