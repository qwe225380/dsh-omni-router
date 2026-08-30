import test from 'node:test'
import assert from 'node:assert/strict'

import { createDshHostAdapter } from '../src/host/dsh-adapter.mjs'
import { isEvidenceStale, omniEventToEvidenceRecord } from '../src/evidence-trust.mjs'

test('createDshHostAdapter implements OmniHost contract', () => {
  const ctx = {
    get: (key) => ({ tools: ['read', 'edit'], fs: {}, workflow: true })[key],
  }
  const host = createDshHostAdapter(ctx)
  const caps = host.describeHost()
  assert.equal(caps.workflow, true)
  assert.equal(caps.subagents, false)
  assert.equal(host.getWorkspaceState().cwd, null)
})

test('dsh adapter lists capabilities from tools', async () => {
  const ctx = { tools: [{ name: 'read' }, { name: 'edit' }] }
  const host = createDshHostAdapter(ctx)
  const capabilities = await host.listCapabilities()
  assert.ok(capabilities.some((c) => c.provider === 'dsh-tool-read' && c.capabilities.includes('repository.read')))
  assert.ok(capabilities.some((c) => c.provider === 'dsh-tool-edit'))
})

test('dsh adapter compiles Mission IR to steps', () => {
  const host = createDshHostAdapter({})
  const plan = host.compileMission({ objective: 'x', tasks: [{ id: 'T1', role: 'builder', objective: 'do', dependencies: [] }] })
  assert.equal(plan.steps[0].id, 'T1')
  assert.equal(plan.degraded, false)
})

test('freshness integration: file.changed advances revision and all events carry it', () => {
  const handlers = {}
  const ctx = {
    get: () => undefined,
    on(type, cb) {
      handlers[type] = cb
      return () => { delete handlers[type] }
    },
  }
  const host = createDshHostAdapter(ctx)
  const received = []
  host.subscribeEvents((event) => received.push(event))

  handlers['file.changed']({ sessionId: 's1', payload: { file: 'a.ts' } })
  handlers['test.completed']({ sessionId: 's1', payload: { exitCode: 0 } })

  assert.equal(host.getWorkspaceRevision('s1'), 1)
  const testEvent = received.find((e) => e.type === 'test.completed')
  assert.equal(testEvent.workspaceRevision, 1)
  const record = omniEventToEvidenceRecord(testEvent)
  assert.equal(record.workspaceRevision, 1)

  handlers['file.changed']({ sessionId: 's1', payload: { file: 'b.ts' } })
  assert.equal(host.getWorkspaceRevision('s1'), 2)
  assert.equal(isEvidenceStale(record, '', 2), true)
})