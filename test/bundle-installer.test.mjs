import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { copyPresetTo } from '../lib/installer.js'

test('copyPresetTo copies the bundled preset files into a target directory', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-router-install-'))
  const target = path.join(base, 'omni-router')
  try {
    const first = copyPresetTo(target)
    assert.equal(first, true)
    assert.ok(fs.existsSync(path.join(target, 'agent.cordis.yml')))
    assert.ok(fs.existsSync(path.join(target, 'preset.yml')))
    assert.ok(fs.existsSync(path.join(target, 'src', 'omni-router.mjs')))

    const second = copyPresetTo(target)
    assert.equal(second, false, 'second install should be skipped when target exists')
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})