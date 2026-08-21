/**
 * OmniBench Continuous Evaluation.
 *
 * Scans benchmark/results/{raw,omni}/*.json, groups by date, and prints a
 * trend of OES and success rate over time.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { scoreRun } from '../src/benchmark-runner.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const resultsRoot = path.join(here, 'results')

function loadAll() {
  const groups = { raw: [], omni: [] }
  for (const arm of ['raw', 'omni']) {
    const dir = path.join(resultsRoot, arm)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
        const scored = scoreRun(raw)
        const date = (raw.at || raw.durationMs ? new Date(raw.durationMs ? Date.now() : Date.parse(raw.at)).toISOString().slice(0, 10) : 'unknown')
        groups[arm].push({ ...scored, date })
      } catch { /* skip malformed */ }
    }
  }
  return groups
}

function summarize(list) {
  if (!list.length) return null
  const success = list.filter((r) => r.success).length / list.length
  const oes = list.reduce((s, r) => s + r.oes.score, 0) / list.length
  return { count: list.length, successRate: Math.round(success * 1000) / 10, avgOes: Math.round(oes * 1000) / 1000 }
}

function main() {
  const groups = loadAll()
  const total = groups.raw.length + groups.omni.length
  if (total === 0) {
    console.log('No benchmark results found.')
    console.log('Collect real runs with omni_benchmark_all (arm=raw and arm=omni) in a DSH session,')
    console.log(`then place JSON files under ${path.join(resultsRoot, 'raw')} and ${path.join(resultsRoot, 'omni')}.`)
    process.exit(1)
  }

  console.log('OmniBench Continuous Evaluation')
  console.log(`Total runs: ${total} (raw=${groups.raw.length}, omni=${groups.omni.length})`)
  console.log('')
  console.log('Raw summary:', summarize(groups.raw))
  console.log('Omni summary:', summarize(groups.omni))
  console.log('')

  const dates = [...new Set([...groups.raw, ...groups.omni].map((r) => r.date))].sort()
  console.log('Trend by date:')
  for (const date of dates) {
    const raw = summarize(groups.raw.filter((r) => r.date === date))
    const omni = summarize(groups.omni.filter((r) => r.date === date))
    console.log(`- ${date}: raw=${raw ? `${raw.successRate}%/${raw.avgOes}` : 'n/a'} omni=${omni ? `${omni.successRate}%/${omni.avgOes}` : 'n/a'}`)
  }
}

main()
