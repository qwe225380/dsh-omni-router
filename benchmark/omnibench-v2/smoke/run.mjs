/**
 * Smoke orchestrator (the only command you need after bootstrap):
 *
 *   node benchmark/omnibench-v2/smoke/run.mjs
 *
 *   1. preflight raw  (composition must NOT contain omni-router)
 *   2. preflight omni (composition MUST contain omni-router)
 *   3. execute 6 headless runs (raw/omni × 3) into smoke/results
 *   4. print the newest results file path
 *   5. print the raw vs omni matrix
 *
 * Fails closed: any preflight failure stops the run before any result is
 * produced or counted.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))          // .../smoke
const benchmarkRoot = path.dirname(here)                            // .../omnibench-v2
const resultsDir = path.join(here, 'results')
const smokeJson = path.join(here, 'smoke.json')

function run(node, args, label) {
  console.log(`\n=== ${label} ===`)
  const res = spawnSync(process.execPath, [node, ...args], { cwd: benchmarkRoot, stdio: 'inherit', env: { ...process.env, OMNIBENCH_RESULTS: resultsDir } })
  if (res.status !== 0) {
    console.error(`\nSTOP: ${label} failed (exit ${res.status}).`)
    process.exit(res.status ?? 1)
  }
  return res
}

const manifest = JSON.parse(fs.readFileSync(smokeJson, 'utf8'))
if (!manifest[0]?.commit || manifest[0].commit === '__FIXTURE_COMMIT__') {
  console.error('STOP: run bootstrap first (node benchmark/omnibench-v2/smoke/bootstrap.mjs)')
  process.exit(1)
}

// 1 + 2: preflight both arms (fails closed)
run(path.join(here, 'preflight.mjs'), ['--arm', 'raw'], 'preflight raw')
run(path.join(here, 'preflight.mjs'), ['--arm', 'omni'], 'preflight omni')

// 3: execute the 6 runs
run(path.join(benchmarkRoot, 'run.mjs'), [smokeJson, '--exec', ...process.argv.slice(2)], 'execute 6 headless runs')

// 4: newest results path
const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json')).sort()
const latest = files.length ? path.join(resultsDir, files[files.length - 1]) : null
if (!latest) {
  console.error('STOP: no results file produced.')
  process.exit(1)
}
console.log(`\n=== RESULTS ===\n${latest}`)

// 5: matrix
run(path.join(benchmarkRoot, 'matrix.mjs'), [latest], 'raw vs omni matrix')