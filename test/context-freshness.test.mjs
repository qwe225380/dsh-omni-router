import test from 'node:test'
import assert from 'node:assert/strict'

import {
  attachFingerprint,
  fingerprintFiles,
  fingerprintText,
  fingerprintWorkspace,
  isContextStale,
} from '../src/context-freshness.mjs'

test('fingerprintText is deterministic', () => {
  assert.equal(fingerprintText('abc'), fingerprintText('abc'))
  assert.notEqual(fingerprintText('abc'), fingerprintText('abd'))
})

test('fingerprintFiles changes when content changes', () => {
  const a = fingerprintFiles({ 'a.ts': 'x' })
  const b = fingerprintFiles({ 'a.ts': 'y' })
  assert.notEqual(a, b)
})

test('fingerprintWorkspace combines commit and files', () => {
  const fp = fingerprintWorkspace({ commit: 'abc', files: { 'a.ts': 'x' } })
  assert.ok(fp.length > 0)
})

test('attachFingerprint and isContextStale', () => {
  const context = attachFingerprint({ files: [] }, 'fp1')
  assert.equal(context.workspaceFingerprint, 'fp1')
  assert.equal(isContextStale(context, 'fp1'), false)
  assert.equal(isContextStale(context, 'fp2'), true)
})