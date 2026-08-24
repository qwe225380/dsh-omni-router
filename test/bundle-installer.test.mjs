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
    assert.ok(fs.existsSync(path.join(target, 'src', 'host', 'dsh-adapter.mjs')))
    assert.ok(fs.existsSync(path.join(target, 'benchmark', 'omnibench-v2', 'matrix.mjs')))
    assert.ok(fs.existsSync(path.join(target, 'package.json')))
    assert.ok(fs.existsSync(path.join(target, 'version.json')))

    const second = copyPresetTo(target)
    assert.equal(second, false, 'same-version install should be skipped')

    // Simulate a package upgrade: older version in target must trigger refresh.
    const pkgPath = path.join(target, 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    pkg.version = '0.0.1-old'
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    const upgraded = copyPresetTo(target)
    assert.equal(upgraded, true, 'version change should refresh the preset')
    assert.notEqual(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version, '0.0.1-old')
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})