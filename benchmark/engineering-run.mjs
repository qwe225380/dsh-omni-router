/**
 * Omni Engineering Benchmark runner (v1).
 *
 * Reads benchmark/engineering-tasks.json, computes OES per task, and prints a
 * summary. Replace the dataset with real agent-run metrics over time.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { summarizeBenchmark } from '../src/engineering-benchmark.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const dataPath = path.join(here, 'engineering-tasks.json')
const results = JSON.parse(fs.readFileSync(dataPath, 'utf8'))

console.log(summarizeBenchmark(results))
