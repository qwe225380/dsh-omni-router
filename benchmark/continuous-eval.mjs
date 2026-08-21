#!/usr/bin/env node
/**
 * OmniBench Continuous Evaluation.
 *
 * Scans benchmark/results/{raw,omni}/*.json, groups by date, prints a trend of
 * OES and success rate, and alerts when the latest Omni arm regresses vs the
 * previous date.
 *
 * Usage:
 *   node benchmark/continuous-eval.mjs
 *   node benchmark/continuous-eval.mjs --json
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

export function buildTrend(groups) {
  const dates = [...new Set([...groups.raw, ...groups.omni].map((r) => r.date))].sort()
  return dates.map((date) => ({
    date,
    raw: summarize(groups.raw.filter((r) => r.date === date)),
    omni: summarize(groups.omni.filter((r) => r.date === date)),
  }))
}

export function detectRegressions(trend, thresholds = {}) {
  const successDrop = thresholds.successDrop ?? 10
  const oesDrop = thresholds.oesDrop ?? 0.05
  const alerts = []
  for (let i = 1; i < trend.length; i++) {
    const prev = trend[i - 1].omni
    const curr = trend[i].omni
    if (!prev || !curr) continue
    if (prev.successRate - curr.successRate > successDrop) {
      alerts.push(`Omni success rate dropped ${prev.successRate}% -> ${curr.successRate}% (${trend[i].date})`)
    }
    if (prev.avgOes - curr.avgOes > oesDrop) {
      alerts.push(`Omni avgOES dropped ${prev.avgOes} -> ${curr.avgOes} (${trend[i].date})`)
    }
  }
  return alerts
}

function main() {
  const json = process.argv.includes('--json')
  const groups = loadAll()
  const total = groups.raw.length + groups.omni.length
  if (total === 0) {
    const message = 'No benchmark results found. Collect real runs with omni_benchmark_all (arm=raw and arm=omni) in a DSH session.'
    if (json) {
      console.log(JSON.stringify({ ok: false, message, resultsRoot }, null, 2))
    } else {
      console.log(message)
    }
    process.exit(1)
  }

  const trend = buildTrend(groups)
  const alerts = detectRegressions(trend)

  if (json) {
    console.log(JSON.stringify({
      ok: true,
      total,
      raw: summarize(groups.raw),
      omni: summarize(groups.omni),
      trend,
      alerts,
    }, null, 2))
    return
  }

  console.log('OmniBench Continuous Evaluation')
  console.log(`Total runs: ${total} (raw=${groups.raw.length}, omni=${groups.omni.length})`)
  console.log('')
  console.log('Raw summary:', summarize(groups.raw))
  console.log('Omni summary:', summarize(groups.omni))
  console.log('')
  console.log('Trend by date:')
  for (const row of trend) {
    const raw = row.raw ? `${row.raw.successRate}%/${row.raw.avgOes}` : 'n/a'
    const omni = row.omni ? `${row.omni.successRate}%/${row.omni.avgOes}` : 'n/a'
    console.log(`- ${row.date}: raw=${raw} omni=${omni}`)
  }
  if (alerts.length) {
    console.log('')
    console.log('REGRESSION DETECTED:')
    for (const alert of alerts) console.log(`- ${alert}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
