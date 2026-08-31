/**
 * Smoke preflight (identity verification before any run is counted).
 *
 *   node preflight.mjs --arm raw    → dump the EXACT raw composition
 *                                     (no patch) and prove it has NO Omni Core row
 *   node preflight.mjs --arm omni   → dump the EXACT omni composition
 *                                     (--patch omni.patch.yml) and prove it HAS
 *                                     the omni-router Core row
 *
 * Uses the official non-booting inspection: `dsh --profile headless --dump-config`
 * (same launcher resolution as the run wrappers: global dsh, else npx).
 * Any non-zero dump exit FAILS CLOSED. If identity cannot be proven, the
 * smoke run must not start.
 */

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function detectOmniCoreRow(out = '') {
  const normalized = String(out).replace(/\\/g, '/')
  const hasCoreId = /^\s*-?\s*id\s*:\s*["']?omni-router["']?\s*$/mi.test(normalized)
  const hasCorePath = /src\/omni-router\.mjs/i.test(normalized)
  return hasCoreId && hasCorePath
}

function resolveLauncher() {
  const probe = spawnSync('dsh', ['--version'], { encoding: 'utf8', stdio: 'ignore' })
  if (probe.error?.code !== 'ENOENT') return { bin: 'dsh', pre: [] }
  return { bin: 'npx', pre: ['--yes', '@deepseek-ai/dsh'] }
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const armIdx = process.argv.indexOf('--arm')
  const arm = armIdx !== -1 ? process.argv[armIdx + 1] : ''
  if (arm !== 'raw' && arm !== 'omni') {
    console.error('Usage: node preflight.mjs --arm raw|omni')
    process.exit(2)
  }

  const launcher = resolveLauncher()
  const home = path.join(here, 'homes', arm)
  const env = { ...process.env, DSH_HOME: home }

  // preflight omni must inspect the SAME composition the omni arm actually runs:
  // with the omni.patch.yml overlay. raw inspects the untouched headless.
  const args = arm === 'omni'
    ? [...launcher.pre, '--profile', 'headless', '--patch', path.join(here, 'omni.patch.yml'), '--dump-config']
    : [...launcher.pre, '--profile', 'headless', '--dump-config']

  const dump = spawnSync(launcher.bin, args, { encoding: 'utf8', env })
  const out = `${dump.stdout || ''}\n${dump.stderr || ''}`

  if (dump.status !== 0) {
    console.error(`PREFLIGHT ${arm.toUpperCase()}: FAIL CLOSED — --dump-config exited ${dump.status} (${launcher.bin}):\n${out.slice(0, 1500)}`)
    process.exit(1)
  }

  // Strict Omni Core row detection: the dump must name the row `omni-router`
  // (exact YAML `id: omni-router`) AND point it at the actual Core file
  // `src/omni-router.mjs` (accepting `\` separators too). Strings like the
  // installer bundle name are not enough.
  const hasCoreRow = detectOmniCoreRow(out)

  if (arm === 'raw') {
    if (hasCoreRow) {
      console.error('PREFLIGHT RAW: FAIL — the raw composition contains the omni-router Core row; raw arm must stay on the standard/default composition.')
      process.exit(1)
    }
    console.log('PREFLIGHT RAW: PASS — exact raw composition has no omni-router Core row')
    process.exit(0)
  }

  if (!hasCoreRow) {
    console.error('PREFLIGHT OMNI: FAIL — the patched composition does not contain the omni-router Core row (id: omni-router → src/omni-router.mjs).\nCheck bootstrap-omni.cmd and omni.patch.yml. Dump head:\n' + out.slice(0, 1500))
    process.exit(1)
  }
  console.log('PREFLIGHT OMNI: PASS — exact patched composition contains the omni-router Core row')
  process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}