// dsh-omni-router installer plugin.
//
// When this bundle is loaded through `dsh plugin add`, the installer copies the
// bundled agent-preset files into ~/.dsh/.agent-presets/omni-router so the
// "Omni Router (experimental)" mode appears after restart.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-omni-router-installer'

const PRESET_ID = 'omni-router'

function packageRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..')
}

function targetDir() {
  return path.join(os.homedir(), '.dsh', '.agent-presets', PRESET_ID)
}

function versionOf(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return pkg.version || null
  } catch {
    return null
  }
}

export function copyPresetTo(target, options = {}) {
  const root = packageRoot()
  const sourceVersion = versionOf(root) || 'unknown'
  const targetVersion = versionOf(target)
  const force = options.force === true

  if (fs.existsSync(target) && !force && sourceVersion === targetVersion) {
    return false
  }

  fs.mkdirSync(target, { recursive: true })

  const files = [
    'agent.cordis.yml',
    'preset.yml',
    'LICENSE',
    'README.md',
    'README.zh-CN.md',
    'package.json',
  ]
  for (const name of files) {
    const src = path.join(root, name)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, name))
  }

  const dirs = ['src', 'test', 'docs']
  for (const dir of dirs) {
    const srcDir = path.join(root, dir)
    const dstDir = path.join(target, dir)
    if (!fs.existsSync(srcDir)) continue
    fs.mkdirSync(dstDir, { recursive: true })
    for (const entry of fs.readdirSync(srcDir)) {
      const srcFile = path.join(srcDir, entry)
      if (!fs.statSync(srcFile).isFile()) continue
      fs.copyFileSync(srcFile, path.join(dstDir, entry))
    }
  }

  fs.writeFileSync(path.join(target, 'version.json'), JSON.stringify({
    version: sourceVersion,
    upgradedFrom: sourceVersion === targetVersion ? null : targetVersion,
    installedAt: new Date().toISOString(),
  }, null, 2), 'utf8')

  return true
}

export function apply(ctx) {
  ctx.on('ready', () => {
    try {
      const installed = copyPresetTo(targetDir())
      if (installed) {
        ctx.logger?.info?.(`[dsh-omni-router] Preset installed to ${targetDir()}`)
      } else {
        ctx.logger?.info?.('[dsh-omni-router] Omni Router preset already exists; skipping install.')
      }
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-omni-router] Failed to install preset: ${error?.message || error}`)
    }
  })
}