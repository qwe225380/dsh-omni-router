// dsh-omni-router installer plugin.
//
// When this bundle is loaded through `dsh plugin add`, the installer copies the
// bundled agent-preset files into <DSH_HOME>/.agent-presets/omni-router so the
// "Omni Router (experimental)" mode appears after restart.
//
// DSH_HOME is the authoritative preset root. The desktop build relocates its
// home (on Windows: AppData/Roaming/dsh-desktop/harness) while a plain CLI
// install keeps the historical ~/.dsh, so the environment has to win over a
// path guess: installing into a directory the running host never scans leaves
// the preset installed-but-invisible, with nothing in the logs to show for it.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const name = 'dsh-omni-router-installer'

const PRESET_ID = 'omni-router'
const ROUTER_STANDARD_ID = 'router-standard'
const COMBINED_PRESET_ID = 'omni-router-standard'

function packageRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '..')
}

/** Resolve the Harness home: DSH_HOME wins, ~/.dsh stays the legacy default. */
export function resolveDshHome(env = process.env) {
  const fromEnv = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return fromEnv.length > 0 ? path.resolve(fromEnv) : path.join(os.homedir(), '.dsh')
}

/** Root directory every agent preset is installed under. */
export function resolvePresetRoot(env = process.env) {
  return path.join(resolveDshHome(env), '.agent-presets')
}

function targetDir(env = process.env) {
  return path.join(resolvePresetRoot(env), PRESET_ID)
}

function routerStandardDir(env = process.env) {
  return path.join(resolvePresetRoot(env), ROUTER_STANDARD_ID)
}

function combinedDir(env = process.env) {
  return path.join(resolvePresetRoot(env), COMBINED_PRESET_ID)
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

const LOCAL_ROW = /^(\s*name:\s*'?)(\.\/[^'\s]+)('?\s*)$/u

/**
 * Resolve `./file.mjs` rows in an installed composition to `file://` URLs.
 *
 * The desktop turns `.agent-presets/<id>/agent.cordis.yml` into a profile patch
 * row by inlining the composition verbatim, so a relative entry resolves against
 * `profiles/web/` — not against the preset directory — and the plugin reports
 * "never started" with ERR_MODULE_NOT_FOUND.
 *
 * The replacement has to be a `file://` URL rather than a bare absolute path:
 * the cordis loader hands a non-relative specifier straight to `import()`, and
 * on Windows `import('C:/...')` is parsed as the (unsupported) `c:` scheme.
 * URLs work on every platform and stay valid wherever the row lands.
 */
export function absolutizeLocalRows(target) {
  const compositionPath = path.join(target, 'agent.cordis.yml')
  if (!fs.existsSync(compositionPath)) return false
  const text = fs.readFileSync(compositionPath, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  let changed = false
  const next = text.split(eol).map((line) => {
    const match = LOCAL_ROW.exec(line)
    if (!match) return line
    const [, head, ref, tail] = match
    const [file] = ref.split('?')
    const absolute = path.join(target, file)
    if (!fs.existsSync(absolute)) return line
    changed = true
    return `${head}${pathToFileURL(absolute).href}${tail}`
  }).join(eol)
  if (changed) fs.writeFileSync(compositionPath, next)
  return changed
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

  // Upgrade path: earlier installers copied repository-only trees into the
  // preset directory. Drop them here so an existing install converges on the
  // slim layout instead of carrying them forever.
  for (const stale of ['test', 'docs']) {
    fs.rmSync(path.join(target, stale), { recursive: true, force: true })
  }
  const staleBenchmark = path.join(target, 'benchmark')
  if (fs.existsSync(staleBenchmark)) {
    for (const entry of fs.readdirSync(staleBenchmark)) {
      if (entry === 'real-tasks.json') continue
      fs.rmSync(path.join(staleBenchmark, entry), { recursive: true, force: true })
    }
  }

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

  // Only `src` ships: the composition points at ./src/omni-router.mjs and that
  // is the whole runtime payload. test/, docs/ and the rest of benchmark/ belong
  // to the repository — an installed preset that carries them pays for it in
  // disk and in startup scans without using any of it.
  const dirs = ['src']
  for (const dir of dirs) {
    const srcDir = path.join(root, dir)
    const dstDir = path.join(target, dir)
    if (!fs.existsSync(srcDir)) continue
    copyDir(srcDir, dstDir)
  }

  // The benchmark tools resolve real-tasks.json against this package root, so
  // that one file stays. Nothing else under benchmark/ is read at runtime.
  const bundledTasks = path.join(root, 'benchmark', 'real-tasks.json')
  if (fs.existsSync(bundledTasks)) {
    const dst = path.join(target, 'benchmark', 'real-tasks.json')
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(bundledTasks, dst)
  }

  fs.writeFileSync(path.join(target, 'version.json'), JSON.stringify({
    version: sourceVersion,
    upgradedFrom: sourceVersion === targetVersion ? null : targetVersion,
    installedAt: new Date().toISOString(),
  }, null, 2), 'utf8')

  absolutizeLocalRows(target)

  return true
}

const ROUTER_BOOTSTRAP = /^router-bootstrap(?:-v(\d+))?\.mjs$/u

/**
 * Pick the bootstrap entry Router Standard actually ships. The file gained
 * version suffixes (router-bootstrap-v34.mjs), so a hardcoded name produced a
 * combined preset pointing at a file that is not there — a mount failure with
 * no obvious cause.
 */
function routerBootstrapEntry(routerDir) {
  let entries
  try {
    entries = fs.readdirSync(routerDir)
  } catch {
    return null
  }
  const ranked = entries
    .filter((entry) => ROUTER_BOOTSTRAP.test(entry))
    .map((entry) => ({ entry, version: Number(ROUTER_BOOTSTRAP.exec(entry)[1] ?? 1) }))
    .sort((a, b) => b.version - a.version)
  return ranked[0]?.entry ?? null
}

export function ensureCombinedPreset(options = {}) {
  const env = options.env ?? process.env
  const router = routerStandardDir(env)
  const routerAgent = path.join(router, 'agent.cordis.yml')
  if (!fs.existsSync(routerAgent)) {
    return { created: false, reason: 'router-standard not installed' }
  }

  const target = combinedDir(env)
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
  for (const dir of ['src']) {
    const srcDir = path.join(root, dir)
    if (fs.existsSync(srcDir)) copyDir(srcDir, path.join(target, dir))
  }
  const bundledTasks = path.join(root, 'benchmark', 'real-tasks.json')
  if (fs.existsSync(bundledTasks)) {
    const dst = path.join(target, 'benchmark', 'real-tasks.json')
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(bundledTasks, dst)
  }
  const bootstrap = routerBootstrapEntry(router)
  for (const file of [bootstrap, 'router-core.mjs']) {
    if (!file) continue
    const src = path.join(router, file)
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, file))
  }

  // Insert Router Standard bootstrap row into the combined agent composition.
  // Anchoring on the agent-instructions bytes broke on CRLF checkouts (the
  // marker uses \n), so insert ahead of the first plugin row instead and keep
  // whatever line ending the file already uses.
  const agent = fs.readFileSync(agentPath, 'utf8')
  if (!agent.includes('router-bootstrap')) {
    const eol = agent.includes('\r\n') ? '\r\n' : '\n'
    const lines = agent.split(eol)
    const firstRow = lines.findIndex((line) => /^- id: /u.test(line))
    if (firstRow === -1) throw new Error('combined preset composition has no plugin rows')
    lines.splice(firstRow, 0,
      '# Router Standard: task-aware reasoning-mode routing.',
      '- id: router-bootstrap',
      `  name: ./${bootstrap ?? 'router-bootstrap.mjs'}`,
      '  config:',
      '    routerMode: standard',
      '',
    )
    fs.writeFileSync(agentPath, lines.join(eol))
  }

  fs.writeFileSync(path.join(target, 'preset.yml'), [
    'name: Omni Router + Router Standard',
    'description: Complementary combo — Router Standard handles persona/attention/reasoning; Omni handles task contract, context, evidence, recovery, and completion proof.',
    '',
  ].join('\n'))

  absolutizeLocalRows(target)

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