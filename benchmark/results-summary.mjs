#!/usr/bin/env node
/**
 * OmniBench results summary CLI.
 *
 * Prints collected raw/omni counts, success rates, avg OES, and missing task
 * pairs from benchmark/results. Usage:
 *   node benchmark/results-summary.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  collectResults,
  formatResultSummary,
  missingTaskIds,
  summarizeResults,
} from '../src/benchmark-results.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const resultsRoot = path.join(here, 'results')
const tasksPath = path.join(here, 'real-tasks.json')

const groups = collectResults(resultsRoot)
const summary = summarizeResults(groups)
const tasks = fs.existsSync(tasksPath) ? JSON.parse(fs.readFileSync(tasksPath, 'utf8')) : []
const missing = missingTaskIds(resultsRoot, tasks)

console.log(formatResultSummary(summary))
console.log('')
if (missing.length) {
  console.log(`Missing pairs (${missing.length}):`)
  for (const m of missing) {
    console.log(`- ${m.id}: raw=${m.raw ? 'yes' : 'no'} omni=${m.omni ? 'yes' : 'no'}`)
  }
} else {
  console.log('All known real tasks have both raw and omni results.')
}