#!/usr/bin/env node
/**
 * Router benchmark.
 *
 * Runs the current heuristic router over benchmark/tasks.json and reports
 * per-dimension accuracy plus the critical false-direct / false-plan rates.
 *
 * Usage:
 *   node benchmark/run.mjs
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

const results = tasks.map((item) => {
  const predicted = {
    complexity: classifyComplexity(item.task),
    taskType: classifyTaskType(item.task),
    thinkingMode: classifyThinkingMode(item.task),
  }
  return { task: item.task, expected: item.expected, predicted }
})

function accuracy(key) {
  const correct = results.filter((r) => r.predicted[key] === r.expected[key]).length
  return correct / results.length
}

const planExpected = results.filter((r) => r.expected.complexity === 'plan')
const directExpected = results.filter((r) => r.expected.complexity === 'direct')
const falseDirect = planExpected.filter((r) => r.predicted.complexity === 'direct').length
const falsePlan = directExpected.filter((r) => r.predicted.complexity === 'plan').length

console.log('Router Benchmark')
console.log('================')
console.log(`tasks: ${results.length}`)
console.log('')
console.log('Accuracy')
console.log(`  complexity   : ${(accuracy('complexity') * 100).toFixed(1)}%`)
console.log(`  taskType     : ${(accuracy('taskType') * 100).toFixed(1)}%`)
console.log(`  thinkingMode : ${(accuracy('thinkingMode') * 100).toFixed(1)}%`)
console.log('')
console.log('Risk rates')
console.log(`  false-direct rate (expected plan, routed direct): ${(falseDirect / Math.max(1, planExpected.length) * 100).toFixed(1)}%`)
console.log(`  false-plan rate   (expected direct, routed plan): ${(falsePlan / Math.max(1, directExpected.length) * 100).toFixed(1)}%`)
console.log('')
console.log('Misclassifications')
for (const r of results) {
  const bad = []
  if (r.predicted.complexity !== r.expected.complexity) bad.push(`complexity ${r.expected.complexity}->${r.predicted.complexity}`)
  if (r.predicted.taskType !== r.expected.taskType) bad.push(`taskType ${r.expected.taskType}->${r.predicted.taskType}`)
  if (r.predicted.thinkingMode !== r.expected.thinkingMode) bad.push(`thinkingMode ${r.expected.thinkingMode}->${r.predicted.thinkingMode}`)
  if (bad.length) console.log(`  - ${r.task}\n      ${bad.join(', ')}`)
}
