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
  'README.en.md',
  'README.zh-CN.md',
  'package.json',
]

const dirs = [
  ['src', 'src'],
  ['test', 'test'],
  ['docs', 'docs'],
  ['benchmark', 'benchmark'],
]

const COPY_SKIP = new Set(['.git', 'node_modules', 'repos', 'runs', 'prompts', 'results', 'homes'])

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir)) {
    if (COPY_SKIP.has(entry)) continue
    const srcFile = path.join(srcDir, entry)
    const dstFile = path.join(dstDir, entry)
    const stat = fs.statSync(srcFile)
    if (stat.isDirectory()) {
      copyDir(srcFile, dstFile)
    } else if (stat.isFile()) {
      fs.copyFileSync(srcFile, dstFile)
    }
  }
}

const force = process.argv.includes('--force')

function versionOf(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return pkg.version || null
  } catch {
    return null
  }
}

const sourceVersion = versionOf(repoRoot) || 'unknown'
const targetVersion = versionOf(target)
const upgrade = targetVersion !== sourceVersion

if (fs.existsSync(target) && !force && !upgrade) {
  console.log(`Omni Router preset is up to date (${sourceVersion}): ${target}`)
  console.log('Use --force to reinstall the same version.')
  process.exit(0)
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
  copyDir(srcDir, dstDir)
}

fs.writeFileSync(path.join(target, 'version.json'), JSON.stringify({
  version: sourceVersion,
  upgradedFrom: upgrade ? targetVersion : null,
  installedAt: new Date().toISOString(),
}, null, 2), 'utf8')

console.log(`Installed Omni Router preset ${sourceVersion} to:\n  ${target}`)
console.log('Restart DSH, then select "Omni Router (experimental)" in a new session.')