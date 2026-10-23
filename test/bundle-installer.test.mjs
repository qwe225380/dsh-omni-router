import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { copyPresetTo, ensureCombinedPreset, resolveDshHome, resolvePresetRoot } from '../lib/installer.js'

const repoRoot = path.resolve(import.meta.dirname, '..')

test('resolvePresetRoot prefers DSH_HOME over the legacy ~/.dsh home', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-home-'))
  try {
    assert.equal(resolveDshHome({ DSH_HOME: base }), path.resolve(base))
    assert.equal(resolvePresetRoot({ DSH_HOME: base }), path.join(path.resolve(base), '.agent-presets'))
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('resolvePresetRoot falls back to ~/.dsh when DSH_HOME is absent or blank', () => {
  const legacy = path.join(os.homedir(), '.dsh', '.agent-presets')
  assert.equal(resolvePresetRoot({}), legacy)
  assert.equal(resolvePresetRoot({ DSH_HOME: '   ' }), legacy)
})

test('the bundled preset uses the current persona field name', () => {
  const composition = fs.readFileSync(path.join(repoRoot, 'agent.cordis.yml'), 'utf8')
  const lines = composition.split(/\r?\n/u)
  const start = lines.findIndex((line) => /^- id: persona$/u.test(line))
  assert.notEqual(start, -1, 'agent.cordis.yml must keep a persona row')
  const block = []
  for (const line of lines.slice(start + 1)) {
    if (/^- id: /u.test(line)) break
    block.push(line)
  }
  const text = block.join('\n')
  assert.match(text, /^\s+prefix:/mu, 'persona rows take `prefix`, not `text`')
  assert.doesNotMatch(text, /^\s+text:/mu, '`text` was renamed to `prefix` in the 0.1.7 series')
})

test('the bundled preset no longer declares the retired workflow-worker-thread row', () => {
  const composition = fs.readFileSync(path.join(repoRoot, 'agent.cordis.yml'), 'utf8')
  assert.doesNotMatch(composition, /name:\s*'@deepseek-ai\/dsh-workflow-worker-thread'/u, 'that package stopped at 0.1.5-rc.3 and the host flags the row as a startup problem')
  assert.match(composition, /@deepseek-ai\/dsh-workflow-ptc/u, '0.2.x ships dsh-workflow-ptc instead')
})

test('combined preset points at the bootstrap file router-standard actually ships', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-home-'))
  const router = path.join(home, '.agent-presets', 'router-standard')
  try {
    fs.mkdirSync(router, { recursive: true })
    fs.writeFileSync(path.join(router, 'agent.cordis.yml'), "- id: noop\n  name: ./noop.mjs\n")
    fs.writeFileSync(path.join(router, 'preset.yml'), 'name: Router Standard\n')
    fs.writeFileSync(path.join(router, 'router-bootstrap-v34.mjs'), 'export function apply() {}\n')
    fs.writeFileSync(path.join(router, 'router-core.mjs'), 'export function apply() {}\n')

    const result = ensureCombinedPreset({ env: { DSH_HOME: home } })
    assert.equal(result.created, true)

    const target = path.join(home, '.agent-presets', 'omni-router-standard')
    const composition = fs.readFileSync(path.join(target, 'agent.cordis.yml'), 'utf8')
    const expected = pathToFileURL(path.join(target, 'router-bootstrap-v34.mjs')).href
    assert.ok(composition.includes(`name: ${expected}`), `the row must resolve to ${expected}, not a profile-relative path`)
    assert.doesNotMatch(composition, /name: \.\/router-bootstrap/u, 'the desktop inlines the composition, so a ./ row resolves against profiles/web')
    assert.doesNotMatch(composition, /router-bootstrap-v1\.mjs/u)
    assert.ok(fs.existsSync(path.join(target, 'router-bootstrap-v34.mjs')), 'the referenced file must be copied too')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
  }
})

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
    assert.ok(fs.existsSync(path.join(target, 'benchmark', 'real-tasks.json')), 'the benchmark tools read real-tasks.json from the package root')
    assert.equal(fs.existsSync(path.join(target, 'benchmark', 'omnibench-v2')), false, 'repository-only benchmark assets must not ship')
    assert.equal(fs.existsSync(path.join(target, 'test')), false, 'the test suite is not part of an installed preset')
    assert.equal(fs.existsSync(path.join(target, 'docs')), false, 'repository docs are not part of an installed preset')
    assert.ok(fs.existsSync(path.join(target, 'package.json')))
    assert.ok(fs.existsSync(path.join(target, 'version.json')))

    // The desktop inlines this composition into the profile patch, so a `./`
    // row would resolve against profiles/web/ and the plugin would never start.
    // A file:// URL is required: the loader feeds non-relative specifiers to
    // import(), which rejects a bare `C:/...` as the `c:` scheme on Windows.
    const installed = fs.readFileSync(path.join(target, 'agent.cordis.yml'), 'utf8')
    const expected = pathToFileURL(path.join(target, 'src', 'omni-router.mjs')).href
    assert.ok(installed.includes(`name: ${expected}`), `the local row must be a file URL, got: ${expected}`)
    assert.doesNotMatch(installed, /name: \.\/src\//u, 'a relative local row cannot load from the profile patch')

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