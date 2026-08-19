import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ROUTER_STANDARD_TOOLS,
  isRouterStandardAvailable,
  routerStandardNotice,
} from '../src/compat.mjs'

test('isRouterStandardAvailable detects dev_router tools from an array', () => {
  assert.equal(isRouterStandardAvailable(['read', 'dev_router_status']), true)
  assert.equal(isRouterStandardAvailable(['read', 'dev_router_mode']), true)
  assert.equal(isRouterStandardAvailable(['read', 'write']), false)
})

test('isRouterStandardAvailable works with a tools.get accessor', () => {
  const tools = {
    get(name) {
      return name === 'dev_router_mode' ? { name } : undefined
    },
  }
  assert.equal(isRouterStandardAvailable(tools, 'agent'), true)
  assert.equal(isRouterStandardAvailable({ get: () => undefined }, 'agent'), false)
})

test('ROUTER_STANDARD_TOOLS lists the expected tool names', () => {
  assert.deepEqual(ROUTER_STANDARD_TOOLS, ['dev_router_status', 'dev_router_mode'])
})

test('routerStandardNotice explains delegation', () => {
  assert.match(routerStandardNotice(), /router-standard detected/)
  assert.match(routerStandardNotice(), /dev_router/)
})
