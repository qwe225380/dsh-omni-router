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

function routerStandardDir() {
  return path.join(os.homedir(), '.dsh', '.agent-presets', 'router-standard')
}

function combinedDir() {
  return path.join(os.homedir(), '.dsh', '.agent-presets', 'omni-router-standard')
}

function versionOf(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return pkg.version || null
  } catch {
    return null
  }
}

const COPY_SKIP = new Set(['.git', 'node_modules', 'repos', 'runs', 'prompts', 'results', 'homes'])

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true })
  for (const entry of fs.readdirSync(srcDir)) {
    if (COPY_SKIP.has(entry)) continue
    const srcFile = path.join(srcDir, entry)
    const dstFile = path.join(dstDir, entry)
    const stat = fs.statSync(srcFile)
    if (stat.isDirectory()) copyDir(srcFile, dstFile)
    else if (stat.isFile()) fs.copyFileSync(srcFile, dstFile)
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
    'README.en.md',
    'README.zh-CN.md',
    'package.json',
  ]
  for (const name of files) {
    const src = path.join(root, name)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, name))
  }

  const dirs = ['src', 'test', 'docs', 'benchmark']
  for (const dir of dirs) {
    const srcDir = path.join(root, dir)
    const dstDir = path.join(target, dir)
    if (!fs.existsSync(srcDir)) continue
    copyDir(srcDir, dstDir)
  }

  fs.writeFileSync(path.join(target, 'version.json'), JSON.stringify({
    version: sourceVersion,
    upgradedFrom: sourceVersion === targetVersion ? null : targetVersion,
    installedAt: new Date().toISOString(),
  }, null, 2), 'utf8')

  return true
}

export function ensureCombinedPreset() {
  const router = routerStandardDir()
  const routerAgent = path.join(router, 'agent.cordis.yml')
  if (!fs.existsSync(routerAgent)) {
    return { created: false, reason: 'router-standard not installed' }
  }

  const target = combinedDir()
  const agentPath = path.join(target, 'agent.cordis.yml')
  if (fs.existsSync(agentPath) && fs.readFileSync(agentPath, 'utf8').includes('router-bootstrap')) {
    return { created: false, reason: 'combined preset already exists' }
  }

  const root = packageRoot()
  fs.mkdirSync(target, { recursive: true })

  for (const name of ['agent.cordis.yml', 'preset.yml', 'package.json', 'README.md', 'README.en.md', 'README.zh-CN.md', 'LICENSE']) {
    const src = path.join(root, name)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, name))
  }
  for (const dir of ['src', 'test', 'docs', 'benchmark']) {
    const srcDir = path.join(root, dir)
    if (fs.existsSync(srcDir)) copyDir(srcDir, path.join(target, dir))
  }
  for (const file of ['router-bootstrap-v1.mjs', 'router-bootstrap.mjs', 'router-core.mjs']) {
    const src = path.join(router, file)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, file))
  }

  // Insert Router Standard bootstrap row into the combined agent composition.
  const agent = fs.readFileSync(agentPath, 'utf8')
  if (!agent.includes('router-bootstrap')) {
    const marker = "- id: agent-instructions\n  name: '@deepseek-ai/dsh-agent-instructions'\n  config:\n    maxBytes: 65536\n"
    const insertion = `${marker}# Router Standard: task-aware reasoning-mode routing.\n- id: router-bootstrap\n  name: ./router-bootstrap-v1.mjs\n  config:\n    routerMode: standard\n`
    fs.writeFileSync(agentPath, agent.replace(marker, insertion))
  }

  fs.writeFileSync(path.join(target, 'preset.yml'), [
    'name: Omni Router + Router Standard',
    'description: Complementary combo — Router Standard handles persona/attention/reasoning; Omni handles task contract, context, evidence, recovery, and completion proof.',
    '',
  ].join('\n'))

  return { created: true, target }
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
      const combined = ensureCombinedPreset()
      if (combined.created) {
        ctx.logger?.info?.(`[dsh-omni-router] Combined preset created at ${combined.target}`)
      } else if (combined.reason === 'router-standard not installed') {
        ctx.logger?.info?.('[dsh-omni-router] Router Standard not installed; Omni Router + Router Standard will be created automatically when it is installed.')
      }
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-omni-router] Failed to install preset: ${error?.message || error}`)
    }
  })
}