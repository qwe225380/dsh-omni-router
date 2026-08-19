#!/usr/bin/env node
/**
 * Benchmark analysis: prints a complexity confusion matrix and the most common
 * misclassified keywords, to guide further Router tuning.
 *
 * Usage:
 *   node benchmark/analyze.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classifyComplexity,
  classifyTaskType,
  classifyThinkingMode,
} from '../src/omni-router.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tasks = JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks.json'), 'utf8'))

const matrix = {
  plan: { plan: 0, direct: 0, balanced: 0 },
  direct: { plan: 0, direct: 0, balanced: 0 },
  balanced: { plan: 0, direct: 0, balanced: 0 },
}

for (const t of tasks) {
  const predicted = classifyComplexity(t.task)
  const expected = t.expected.complexity
  matrix[expected][predicted] = (matrix[expected][predicted] || 0) + 1
}

console.log('Complexity confusion matrix (expected -> predicted)')
console.log('           plan  direct  balanced')
for (const expected of ['plan', 'direct', 'balanced']) {
  const row = matrix[expected]
  console.log(`${expected.padEnd(10)} ${String(row.plan).padStart(4)} ${String(row.direct).padStart(7)} ${String(row.balanced).padStart(9)}`)
}

console.log('')
console.log('Most common misclassified tasks')
const mis = tasks
  .map((t) => ({ ...t, predicted: classifyComplexity(t.task) }))
  .filter((t) => t.predicted !== t.expected.complexity)
  .sort((a, b) => a.task.localeCompare(b.task))
for (const t of mis.slice(0, 20)) {
  console.log(`  [${t.expected.complexity}->${t.predicted}] ${t.task}`)
}
