#!/usr/bin/env node
/**
 * OmniBench v2 matrix and KPI aggregation.
 *
 * Usage:
 *   node benchmark/omnibench-v2/matrix.mjs <results.json>
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export function summarizeBenchmark(results = []) {
  const byArm = { raw: [], omni: [] }
  for (const r of results) {
    if (byArm[r.arm]) byArm[r.arm].push(r)
  }
  const summarize = (list) => {
    const executed = list.filter((r) => r.success !== null)
    const passed = executed.filter((r) => r.success === true)
    const mediumHard = executed.filter((r) => ['medium', 'hard', 'long'].includes(r.difficulty))
    const mediumHardPassed = mediumHard.filter((r) => r.success === true)
    const falseCompletions = list.filter((r) => r.falseCompletion === true).length
    return {
      runs: list.length,
      executed: executed.length,
      successRate: executed.length ? passed.length / executed.length : null,
      mediumHardRate: mediumHard.length ? mediumHardPassed.length / mediumHard.length : null,
      falseCompletionCount: falseCompletions,
      falseCompletionRate: executed.length ? falseCompletions / executed.length : null,
      avgCost: list.length ? list.reduce((s, r) => s + (r.metrics?.cost || 0), 0) / list.length : 0,
      avgWallMs: list.length ? list.reduce((s, r) => s + (r.durationMs || 0), 0) / list.length : 0,
      telemetryCompleteRate: list.length ? list.filter((r) => r.telemetryComplete === true).length / list.length : 0,
      interventionCount: list.reduce((s, r) => s + (r.metrics?.interventions || 0), 0),
    }
  }
  return {
    raw: summarize(byArm.raw),
    omni: summarize(byArm.omni),
  }
}

export function compareArms(results = []) {
  const byPair = {}
  for (const r of results) {
    const key = `${r.id}:${r.run}`
    if (!byPair[key]) byPair[key] = {}
    byPair[key][r.arm] = r
  }
  const pairs = []
  for (const [key, pair] of Object.entries(byPair)) {
    const raw = pair.raw
    const omni = pair.omni
    if (!raw || !omni) continue
    if (raw.success === null || omni.success === null) continue
    const rawSuccess = raw.success === true
    const omniSuccess = omni.success === true
    pairs.push({
      id: raw.id,
      run: raw.run,
      difficulty: raw.difficulty || omni.difficulty || 'medium',
      rawSuccess,
      omniSuccess,
      uplift: (omniSuccess ? 1 : 0) - (rawSuccess ? 1 : 0),
      costRatio: raw.metrics?.cost ? (omni.metrics?.cost || 0) / raw.metrics.cost : null,
      wallRatio: raw.durationMs ? (omni.durationMs || 0) / raw.durationMs : null,
    })
  }
  return pairs
}

function main() {
  const resultsPath = process.argv[2] || path.join(here, 'results', 'latest.json')
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
  const summary = summarizeBenchmark(results)
  const pairs = compareArms(results)
  console.log(JSON.stringify({ summary, pairs }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}