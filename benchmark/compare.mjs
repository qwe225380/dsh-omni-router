/**
 * Compare real agent-run results: raw vs omni.
 *
 * Reads benchmark/results/raw/*.json and benchmark/results/omni/*.json,
 * computes OES per run, and prints a comparison.
 *
 * Collect data with the `omni_benchmark` tool inside a DSH session, or drop
 * JSON files into the result directories manually.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { compareArms, formatComparison } from '../src/benchmark-runner.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const resultsRoot = path.join(here, 'results')

function loadResults(arm) {
  const dir = path.join(resultsRoot, arm)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
}

const raw = loadResults('raw')
const omni = loadResults('omni')

if (raw.length === 0 || omni.length === 0) {
  console.log('No complete result set found.')
  console.log(`raw=${raw.length} omni=${omni.length}`)
  console.log('Collect real runs using the omni_benchmark tool in a DSH session,')
  console.log(`then place JSON files under ${path.join(resultsRoot, 'raw')} and ${path.join(resultsRoot, 'omni')}.`)
  process.exit(1)
}

console.log(formatComparison(compareArms(raw, omni)))
