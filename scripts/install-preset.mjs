#!/usr/bin/env node
/**
 * One-command installer for the Omni Router DSH agent preset.
 *
 * Usage:
 *   node scripts/install-preset.mjs [--force]
 *
 * Copies this repository's preset files into:
 *   <DSH_HOME>/.agent-presets/omni-router
 *
 * DSH_HOME wins when set (the desktop build relocates its home); it falls back
 * to ~/.dsh for a plain CLI install.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePresetRoot } from '../lib/installer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const target = path.join(resolvePresetRoot(), 'omni-router')

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
if (!process.env.DSH_HOME) {
  console.log('')
  console.log('Note: DSH_HOME was not set, so this is the legacy ~/.dsh home.')
  console.log('The desktop app scans this directory on startup and registers the preset')
  console.log('automatically. A standalone `dsh` CLI does not: declare the preset as an')
  console.log("@deepseek-ai/dsh-agent-preset row in the profile patch instead (see docs/COMPATIBILITY.md).")
}