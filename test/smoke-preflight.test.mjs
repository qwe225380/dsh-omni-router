import test from 'node:test'
import assert from 'node:assert/strict'

import { detectOmniCoreRow } from '../benchmark/omnibench-v2/smoke/preflight.mjs'

test('detectOmniCoreRow matches the omni-router Core row in YAML dump', () => {
  const dump = [
    '# bundle: dsh-headless',
    '- id: persona',
    '  name: "@deepseek-ai/dsh-persona"',
    '- id: omni-router',
    '  name: "D:/repo/src/omni-router.mjs"',
    '  config:',
    '    requireConfirmation: true',
  ].join('\n')
  assert.equal(detectOmniCoreRow(dump), true)
})

test('detectOmniCoreRow rejects installer-package-only dumps', () => {
  const dump = [
    '- id: dsh-omni-router-installer',
    '  name: "@deepseek-ai/dsh-omni-router"',
    '- id: dsh-omni-router',
    '  name: "./lib/installer.js"',
  ].join('\n')
  assert.equal(detectOmniCoreRow(dump), false)
})

test('detectOmniCoreRow accepts backslash paths on Windows dumps', () => {
  const dump = '- id: omni-router\n  name: "D:\\repo\\src\\omni-router.mjs"\n'
  assert.equal(detectOmniCoreRow(dump), true)
})