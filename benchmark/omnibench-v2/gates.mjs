#!/usr/bin/env node
/**
 * OmniBench 3.0 release gates.
 *
 * Evaluates benchmark results against the 3.0 KPI thresholds from 优化10.md.
 * Usage:
 *   node benchmark/omnibench-v2/gates.mjs <results.json>
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compareArms, comparePair, summarizeBenchmark } from './matrix.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

export function evaluateReleaseGates(results = [], options = {}) {
  const baselineArm = options.baselineArm || 'raw'
  const candidateArm = options.candidateArm || 'omni'
  const pairs = baselineArm === 'raw' && candidateArm === 'omni' ? compareArms(results) : comparePair(results, baselineArm, candidateArm)

  // Comparison cohort = baselineArm ∩ candidateArm on the SAME repo/task/run.
  // Every gate below counts ONLY this cohort, never other arms in results.json.
  const cohortKeys = new Set(pairs.map((p) => `${p.repo}:${p.task}:${p.run}`))
  const cohortResults = results.filter((r) => cohortKeys.has(`${r.repo || r.id}:${r.task || r.id}:${r.run}`))
  const summary = summarizeBenchmark(cohortResults)
  const candidateSummary = summary.byArm[candidateArm] || summarizeBenchmark([]).omni

  const mediumHardPairs = pairs.filter((p) => ['medium', 'hard', 'long'].includes(p.difficulty))
  const mediumHardUplift = mediumHardPairs.length
    ? mediumHardPairs.reduce((s, p) => s + p.uplift, 0) / mediumHardPairs.length
    : null
  const falseCompletion = candidateSummary.falseCompletionRate
  const telemetryCompleteRate = candidateSummary.telemetryCompleteRate

  const costValues = pairs.map((p) => p.costRatio).filter((v) => v !== null && v !== undefined)
  const costRatio = costValues.length ? costValues.reduce((s, v) => s + v, 0) / costValues.length : null

  const byTask = {}
  for (const pair of pairs) {
    const taskKey = `${pair.repo}:${pair.task}`
    byTask[taskKey] = byTask[taskKey] || []
    byTask[taskKey].push(pair)
  }
  const perTaskCounts = Object.values(byTask).map((list) => list.length)
  const minPairedPerTask = perTaskCounts.length ? Math.min(...perTaskCounts) : 0
  const repos = new Set(pairs.map((p) => p.repo)).size
  const tasks = Object.keys(byTask).length

  const avg = (values) => {
    const list = values.filter((v) => v !== null && v !== undefined)
    return list.length ? list.reduce((s, v) => s + v, 0) / list.length : null
  }
  const noopPrecision = avg(cohortResults.map((r) => r.metrics?.noopPrecision))
  const recoverySuccessRate = avg(cohortResults.map((r) => r.metrics?.recoverySuccessRate))
  const simplePairs = pairs.filter((p) => ['easy', 'simple'].includes(p.difficulty))
  const simpleRegression = simplePairs.length ? avg(simplePairs.map((p) => p.uplift)) : null
  const interventionReduction = avg(pairs.map((p) => p.interventionReduction))

  const gates = [
    {
      name: 'Medium/Hard uplift >= 10pp',
      value: mediumHardUplift,
      target: 0.1,
      pass: mediumHardUplift !== null && mediumHardUplift >= 0.1,
    },
    {
      name: 'Simple-task regression <= 2pp',
      value: simpleRegression,
      target: -0.02,
      pass: simpleRegression !== null && simpleRegression >= -0.02,
    },
    {
      name: 'False completion < 3%',
      value: falseCompletion,
      target: 0.03,
      pass: falseCompletion !== null && falseCompletion < 0.03,
    },
    {
      name: 'Telemetry complete 100%',
      value: telemetryCompleteRate,
      target: 1,
      pass: telemetryCompleteRate >= 1,
    },
    {
      name: 'Cost ratio <= 2.5x',
      value: costRatio,
      target: 2.5,
      pass: costRatio !== null && costRatio <= 2.5,
    },
    {
      name: 'NOOP precision >= 90%',
      value: noopPrecision,
      target: 0.9,
      pass: noopPrecision !== null && noopPrecision >= 0.9,
    },
    {
      name: 'Recovery success >= 75%',
      value: recoverySuccessRate,
      target: 0.75,
      pass: recoverySuccessRate !== null && recoverySuccessRate >= 0.75,
    },
    {
      name: 'Human intervention reduction >= 30%',
      value: interventionReduction,
      target: 0.3,
      pass: interventionReduction !== null && interventionReduction >= 0.3,
    },
    {
      name: 'Every task has >= 3 paired runs',
      value: minPairedPerTask,
      target: 3,
      pass: minPairedPerTask >= 3,
    },
    {
      name: 'Repositories >= 50',
      value: repos,
      target: 50,
      pass: repos >= 50,
    },
    {
      name: 'Tasks >= 100',
      value: tasks,
      target: 100,
      pass: tasks >= 100,
    },
  ]
  if (options.verbose) {
    gates.push({ name: 'Raw success', value: summary.raw.successRate, target: null, pass: null })
  }
  return {
    gates,
    summary,
    pairs: pairs.length,
    ready: gates.every((g) => g.pass === true),
  }
}

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 ? process.argv[idx + 1] : null
}

function main() {
  const resultsPath = process.argv[2] || path.join(here, 'results', 'latest.json')
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
  const options = {
    verbose: true,
    baselineArm: arg('baseline') || 'raw',
    candidateArm: arg('candidate') || 'omni',
  }
  const report = evaluateReleaseGates(results, options)
  for (const gate of report.gates) {
    if (gate.pass === null) {
      console.log(`- ${gate.name}: ${gate.value}`)
    } else {
      console.log(`- ${gate.pass ? 'PASS' : 'FAIL'} ${gate.name}: ${gate.value} (target ${gate.target})`)
    }
  }
  console.log(`\nReady: ${report.ready}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}