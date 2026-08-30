/**
 * One-time smoke bootstrap:
 *   1. (re)create the fixture-pagination git repo with the bug commit
 *   2. rewrite smoke.json with the real commit sha
 *   3. create the isolated DSH_HOME dirs for raw/omni arms
 *
 * Run once before the first `run.mjs --exec` on a machine, because the
 * committed fixture ships WITHOUT .git (embedded repos are not portable).
 */

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = path.join(here, 'fixture-pagination')
const smokeJson = path.join(here, 'smoke.json')

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

// 1. init fixture git (idempotent)
if (!fs.existsSync(path.join(fixture, '.git'))) {
  git(['init', '-b', 'main'], fixture)
}
const dirty = git(['status', '--porcelain'], fixture).trim() !== ''
let sha = null
try {
  sha = git(['rev-parse', 'HEAD'], fixture)
} catch { /* no commits yet */ }
if (!sha || dirty) {
  git(['add', '-A'], fixture)
  git(['-c', 'user.name=smoke', '-c', 'user.email=smoke@local', 'commit', '-m', 'bug: pagination last page off-by-one'], fixture)
  sha = git(['rev-parse', 'HEAD'], fixture)
}

// 2. rewrite smoke.json commit
const manifest = JSON.parse(fs.readFileSync(smokeJson, 'utf8'))
manifest[0].commit = sha
fs.writeFileSync(smokeJson, JSON.stringify(manifest, null, 2) + '\n')

// 3. isolated DSH_HOMEs
for (const arm of ['raw', 'omni']) {
  fs.mkdirSync(path.join(here, 'homes', arm), { recursive: true })
}

console.log(`fixture ready @ ${sha}`)
console.log(`smoke.json updated (${manifest[0].id})`)
console.log('Next: bootstrap-omni.cmd (install Omni into homes/omni), then run.mjs --exec')