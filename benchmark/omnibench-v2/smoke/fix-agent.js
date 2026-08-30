/**
 * Sandbox-only fake agent for chain verification (no DSH runtime needed).
 * Simulates a headless agent that fixes the pagination bug in the current
 * run workspace and emits TELEMETRY_JSON + BENCHMARK: PASS.
 *
 * NOT part of the official benchmark — use run-raw.cmd / run-omni.cmd for
 * real headless runs.
 */

import fs from 'node:fs'
import path from 'node:path'

const file = path.join(process.cwd(), 'src', 'pagination.js')
if (!fs.existsSync(file)) {
  console.error('fix-agent infra: missing src/pagination.js')
  process.exit(2)
}

let source = fs.readFileSync(file, 'utf8')
const fixed = source.includes('items.length - 1') ? source.replaceAll('items.length - 1', 'items.length') : source
fs.writeFileSync(file, fixed)

console.log('BENCHMARK: PASS')
console.log('TELEMETRY_JSON')
console.log(JSON.stringify({
  inputTokens: 120,
  outputTokens: 30,
  toolCalls: 1,
  humanInterventions: 0,
  noopPrecision: 1,
  recoveryAttempts: 0,
  recoverySuccesses: 0,
}))