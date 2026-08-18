#!/usr/bin/env node
/**
 * One-command installer for the Omni Router DSH agent preset.
 *
 * Usage:
 *   node scripts/install-preset.mjs [--force]
 *
 * Copies this repository's preset files into:
 *   ~/.dsh/.agent-presets/omni-router
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const target = path.join(os.homedir(), '.dsh', '.agent-presets', 'omni-router')

const files = [
  'agent.cordis.yml',
  'preset.yml',
  'LICENSE',
  'README.md',
  'README.zh-CN.md',
  'package.json',
]

const dirs = [
  ['src', 'src'],
  ['test', 'test'],
  ['docs', 'docs'],
]

const force = process.argv.includes('--force')

if (fs.existsSync(target) && !force) {
  console.error(`Preset already exists: ${target}`)
  console.error('Re-run with --force to overwrite.')
  process.exit(1)
}

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.mkdirSync(target, { recursive: true })

for (const name of files) {
  const src = path.join(repoRoot, name)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(target, name))
  }
}

for (const [from, to] of dirs) {
  const srcDir = path.join(repoRoot, from)
  const dstDir = path.join(target, to)
  if (!fs.existsSync(srcDir)) continue
  fs.mkdirSync(dstDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir)) {
    const srcFile = path.join(srcDir, entry)
    const stat = fs.statSync(srcFile)
    if (stat.isFile()) {
      fs.copyFileSync(srcFile, path.join(dstDir, entry))
    }
  }
}

console.log(`Installed Omni Router preset to:\n  ${target}`)
console.log('Restart DSH, then select "Omni Router (experimental)" in a new session.')
