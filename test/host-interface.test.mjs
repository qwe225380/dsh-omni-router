import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createHostAdapter,
  describeHostCapabilities,
  formatHostNegotiation,
  negotiateHost,
} from '../src/host-interface.mjs'

test('createHostAdapter validates describeHost', () => {
  const valid = createHostAdapter({ describeHost: async () => ({}) })
  assert.equal(valid.valid, true)
  const invalid = createHostAdapter({})
  assert.equal(invalid.valid, false)
  assert.ok(invalid.missing.includes('describeHost'))
})

test('describeHostCapabilities defaults to false', () => {
  const caps = describeHostCapabilities({ workflow: true })
  assert.equal(caps.workflow, true)
  assert.equal(caps.skills, false)
})

test('negotiateHost reports supported and degraded features', () => {
  const result = negotiateHost({ workflow: true, approvals: true, skills: false, plugins: false })
  assert.ok(result.supported.includes('workflow'))
  assert.ok(result.degraded.includes('skills'))
  assert.equal(result.mode, 'degraded')
  assert.match(formatHostNegotiation(result), /Host mode: degraded/)
})