/**
 * Smoke preflight (identity verification before any run is counted).
 *
 *   node preflight.mjs --arm raw    → PASS iff the composition does NOT
 *                                     contain omni-router (standard/default)
 *   node preflight.mjs --arm omni   → PASS iff the composition DOES contain
 *                                     omni-router (row, defaultId or tool)
 *
 * Uses the official non-booting inspection: `dsh --profile headless --dump-config`.
 * If the identity cannot be proven, the check FAILS CLOSED and the smoke run
 * must not start.
 */

import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const armIdx = process.argv.indexOf('--arm')
const arm = armIdx !== -1 ? process.argv[armIdx + 1] : ''
if (arm !== 'raw' && arm !== 'omni') {
  console.error('Usage: node preflight.mjs --arm raw|omni')
  process.exit(2)
}

const home = path.join(here, 'homes', arm)
const env = { ...process.env, DSH_HOME: home }
const args = ['--profile', 'headless', '--dump-config']
const dsh = spawnSync('dsh', args, { encoding: 'utf8', env })
const out = `${dsh.stdout || ''}\n${dsh.stderr || ''}`
const hasDsh = dsh.error?.code !== 'ENOENT'

if (!hasDsh) {
  console.error(`PREFLIGHT ${arm.toUpperCase()}: FAIL — dsh not found on PATH (expected: dsh --profile headless --dump-config)`)
  process.exit(1)
}

const hasOmni = /omni-router|omni_status|omni_doctor|omni_explain/i.test(out)
const exitOk = dsh.status === 0

if (arm === 'raw') {
  if (hasOmni) {
    console.error('PREFLIGHT RAW: FAIL — raw composition contains omni-router; raw arm must stay on the standard/default preset.')
    process.exit(1)
  }
  console.log(`PREFLIGHT RAW: PASS — no omni-router in composition (dump exit=${dsh.status})`)
  process.exit(0)
}

if (!exitOk) {
  console.error(`PREFLIGHT OMNI: FAIL — --dump-config exited ${dsh.status}:\n${out.slice(0, 1200)}`)
  process.exit(1)
}
if (!hasOmni) {
  console.error('PREFLIGHT OMNI: FAIL — omni-router is NOT in the composition.\nRun bootstrap-omni.cmd and check the patch overlay (omni.patch.yml).\nDump head:\n' + out.slice(0, 1200))
  process.exit(1)
}
console.log('PREFLIGHT OMNI: PASS — omni-router present in the headless composition')
process.exit(0)