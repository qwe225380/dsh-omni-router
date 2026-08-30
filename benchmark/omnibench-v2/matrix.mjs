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
  const byArm = {}
  for (const r of results) {
    if (!r.arm) continue
    byArm[r.arm] = byArm[r.arm] || []
    byArm[r.arm].push(r)
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
  const arms = {}
  for (const arm of Object.keys(byArm)) {
    arms[arm] = summarize(byArm[arm])
  }
  return {
    raw: arms.raw || summarize([]),
    omni: arms.omni || summarize([]),
    byArm: arms,
  }
}

export function compareArms(results = []) {
  const byPair = {}
  for (const r of results) {
    const key = `${r.repo || r.id}:${r.task || r.id}:${r.run}`
    if (!byPair[key]) byPair[key] = {}
    byPair[key][r.arm] = r
  }
  const pairs = []
  for (const [key, pair] of Object.entries(byPair)) {
    const raw = pair.raw
    const omni = pair.omni
    if (!raw || !omni) continue
    if (raw.success === null || omni.success === null) continue
    if (raw.taskValid === false || omni.taskValid === false) continue
    const rawSuccess = raw.success === true
    const omniSuccess = omni.success === true
    pairs.push({
      id: raw.id,
      repo: raw.repo || raw.id,
      task: raw.task || raw.id,
      run: raw.run,
      difficulty: raw.difficulty || omni.difficulty || 'medium',
      rawSuccess,
      omniSuccess,
      uplift: (omniSuccess ? 1 : 0) - (rawSuccess ? 1 : 0),
      costRatio: raw.metrics?.cost ? (omni.metrics?.cost || 0) / raw.metrics.cost : null,
      wallRatio: raw.durationMs ? (omni.durationMs || 0) / raw.durationMs : null,
      interventionReduction: raw.metrics?.humanInterventions > 0 && omni.metrics?.humanInterventions !== undefined
        ? 1 - (omni.metrics.humanInterventions / raw.metrics.humanInterventions)
        : null,
    })
  }
  return pairs
}

export function comparePair(results = [], baselineArm = 'raw', candidateArm = 'omni') {
  const byPair = {}
  for (const r of results) {
    const key = `${r.repo || r.id}:${r.task || r.id}:${r.run}`
    if (!byPair[key]) byPair[key] = {}
    byPair[key][r.arm] = r
  }
  const pairs = []
  for (const [key, pair] of Object.entries(byPair)) {
    const baseline = pair[baselineArm]
    const candidate = pair[candidateArm]
    if (!baseline || !candidate) continue
    if (baseline.success === null || candidate.success === null) continue
    if (baseline.taskValid === false || candidate.taskValid === false) continue
    const baselineSuccess = baseline.success === true
    const candidateSuccess = candidate.success === true
    pairs.push({
      id: baseline.id,
      repo: baseline.repo || baseline.id,
      task: baseline.task || baseline.id,
      run: baseline.run,
      difficulty: baseline.difficulty || candidate.difficulty || 'medium',
      baselineSuccess,
      candidateSuccess,
      uplift: (candidateSuccess ? 1 : 0) - (baselineSuccess ? 1 : 0),
      costRatio: baseline.metrics?.cost ? (candidate.metrics?.cost || 0) / baseline.metrics.cost : null,
      wallRatio: baseline.durationMs ? (candidate.durationMs || 0) / baseline.durationMs : null,
      interventionReduction: baseline.metrics?.humanInterventions > 0 && candidate.metrics?.humanInterventions !== undefined
        ? 1 - (candidate.metrics.humanInterventions / baseline.metrics.humanInterventions)
        : null,
    })
  }
  return pairs
}

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 ? process.argv[idx + 1] : null
}

function main() {
  const resultsPath = process.argv[2] || path.join(here, 'results', 'latest.json')
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
  const summary = summarizeBenchmark(results)
  const baseline = arg('baseline')
  const candidate = arg('candidate')
  const pairs = baseline && candidate ? comparePair(results, baseline, candidate) : compareArms(results)
  console.log(JSON.stringify({ summary, pairs, comparison: { baseline: baseline || 'raw', candidate: candidate || 'omni' } }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}