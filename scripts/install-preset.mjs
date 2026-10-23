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
 *
 * The copy itself lives in lib/installer.js — the same routine the bundle
 * plugin runs on `dsh plugin add`. Keeping one implementation is what stops the
 * two entry points from drifting apart on what a preset directory contains.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { copyPresetTo, resolvePresetRoot } from '../lib/installer.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const target = path.join(resolvePresetRoot(), 'omni-router')

const force = process.argv.includes('--force')
const sourceVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
).version

const installed = copyPresetTo(target, { force })

if (!installed) {
  console.log(`Omni Router preset is up to date (${sourceVersion}): ${target}`)
  console.log('Use --force to reinstall the same version.')
  process.exit(0)
}

console.log(`Installed Omni Router preset ${sourceVersion} to:\n  ${target}`)
console.log('Restart DSH, then select "Omni Router (experimental)" in a new session.')

if (!process.env.DSH_HOME) {
  console.log('')
  console.log('Note: DSH_HOME was not set, so this is the legacy ~/.dsh home.')
  console.log('The desktop app scans this directory on startup and registers the preset')
  console.log('automatically. A standalone `dsh` CLI does not: declare the preset as an')
  console.log("@deepseek-ai/dsh-agent-preset row in the profile patch instead (see docs/COMPATIBILITY.md).")
}
