import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OMNI_EVENT_TYPES,
  createOmniEvent,
  normalizeHostEvent,
} from '../src/omni-event.mjs'

test('createOmniEvent builds host-independent event', () => {
  const event = createOmniEvent({ type: 'test.completed', host: 'dsh', sessionId: 's1', taskId: 't1', workspaceFingerprint: 'fp', payload: { passed: 10 } })
  assert.equal(event.type, 'test.completed')
  assert.equal(event.host, 'dsh')
  assert.equal(event.workspaceFingerprint, 'fp')
  assert.ok(event.timestamp)
})

test('normalizeHostEvent maps DSH tool events', () => {
  const event = normalizeHostEvent({ type: 'tool.started', name: 'edit', data: { file: 'a.ts' } }, 'dsh', { sessionId: 's', taskId: 't' })
  assert.equal(event.type, 'tool.started')
  assert.equal(event.sessionId, 's')
  assert.equal(event.payload.file, 'a.ts')
})

test('normalizeHostEvent maps generic start/end to model events', () => {
  const started = normalizeHostEvent({ type: 'start' }, 'codex')
  const ended = normalizeHostEvent({ type: 'finished' }, 'codex')
  assert.equal(started.type, 'model.started')
  assert.equal(ended.type, 'model.completed')
})

test('OMNI_EVENT_TYPES is stable', () => {
  assert.ok(OMNI_EVENT_TYPES.includes('file.changed'))
  assert.ok(OMNI_EVENT_TYPES.includes('approval.completed'))
})