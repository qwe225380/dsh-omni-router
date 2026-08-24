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
  const executedPairs = pairs.filter((p) => p.rawSuccess !== null && p.omniSuccess !== null)
  const avgUplift = executedPairs.length
    ? executedPairs.reduce((s, p) => s + p.uplift, 0) / executedPairs.length
    : null
  const omniRate = summary.omni.successRate
  const rawRate = summary.raw.successRate
  const mediumHardUplift = omniRate !== null && rawRate !== null ? omniRate - rawRate : null
  const falseCompletion = omniRate !== null ? 1 - omniRate : null // proxy until hidden verifier records false-completion explicitly
  const telemetryCompleteRate = summary.omni.telemetryCompleteRate
  const costRatio = pairs
    .map((p) => p.costRatio)
    .filter((v) => v !== null && v !== undefined)
    .reduce((s, v) => s + v, 0) / Math.max(1, pairs.filter((p) => p.costRatio !== null && p.costRatio !== undefined).length)

  const gates = [
    {
      name: 'Medium/Hard uplift >= 10pp',
      value: mediumHardUplift,
      target: 0.1,
      pass: mediumHardUplift !== null && mediumHardUplift >= 0.1,
    },
    {
      name: 'False completion < 3% (proxy)',
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
      pass: costRatio !== 0 && costRatio <= 2.5,
    },
    {
      name: 'Paired runs >= 3',
      value: executedPairs.length,
      target: 3,
      pass: executedPairs.length >= 3,
    },
  ]
  if (options.verbose) gates.push({ name: 'Raw success', value: rawRate, target: null, pass: null })
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