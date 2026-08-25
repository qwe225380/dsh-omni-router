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
import { compareArms, summarizeBenchmark } from './matrix.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))

export function evaluateReleaseGates(results = [], options = {}) {
  const summary = summarizeBenchmark(results)
  const pairs = compareArms(results)

  const mediumHardPairs = pairs.filter((p) => ['medium', 'hard', 'long'].includes(p.difficulty))
  const mediumHardUplift = mediumHardPairs.length
    ? mediumHardPairs.reduce((s, p) => s + p.uplift, 0) / mediumHardPairs.length
    : null
  const falseCompletion = summary.omni.falseCompletionRate
  const telemetryCompleteRate = summary.omni.telemetryCompleteRate

  const costValues = pairs.map((p) => p.costRatio).filter((v) => v !== null && v !== undefined)
  const costRatio = costValues.length ? costValues.reduce((s, v) => s + v, 0) / costValues.length : null

  const allTasks = new Set(results.map((r) => `${r.repo || r.id}:${r.task || r.id}`))
  const byTask = {}
  for (const taskKey of allTasks) byTask[taskKey] = []
  for (const pair of pairs) {
    const taskKey = `${pair.repo}:${pair.task}`
    if (byTask[taskKey]) byTask[taskKey].push(pair)
  }
  const perTaskCounts = Object.values(byTask).map((list) => list.length)
  const minPairedPerTask = perTaskCounts.length ? Math.min(...perTaskCounts) : 0
  const repos = new Set(results.map((r) => r.repo)).size
  const tasks = allTasks.size

  const gates = [
    {
      name: 'Medium/Hard uplift >= 10pp',
      value: mediumHardUplift,
      target: 0.1,
      pass: mediumHardUplift !== null && mediumHardUplift >= 0.1,
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

function main() {
  const resultsPath = process.argv[2] || path.join(here, 'results', 'latest.json')
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
  const report = evaluateReleaseGates(results, { verbose: true })
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