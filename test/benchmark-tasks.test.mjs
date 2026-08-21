import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tasksPath = path.join(here, '..', 'benchmark', 'tasks.json')
const realTasksPath = path.join(here, '..', 'benchmark', 'real-tasks.json')

test('router benchmark corpus has 500+ tasks', () => {
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'))
  assert.ok(tasks.length >= 500, `expected >= 500 tasks, got ${tasks.length}`)
})

test('every router benchmark task has valid expected labels', () => {
  const tasks = JSON.parse(fs.readFileSync(tasksPath, 'utf8'))
  const complexities = new Set(['plan', 'direct', 'balanced'])
  const taskTypes = new Set(['bugfix', 'feature', 'refactor', 'test', 'review', 'other'])
  const modes = new Set(['spec', 'react', 'balanced'])
  for (const item of tasks) {
    assert.ok(typeof item.task === 'string' && item.task.length > 0, `missing task: ${JSON.stringify(item)}`)
    assert.ok(complexities.has(item.expected?.complexity), `bad complexity in ${item.task}`)
    assert.ok(taskTypes.has(item.expected?.taskType), `bad taskType in ${item.task}`)
    assert.ok(modes.has(item.expected?.thinkingMode), `bad thinkingMode in ${item.task}`)
  }
})

test('real OmniBench tasks have ids, levels, and criteria', () => {
  const tasks = JSON.parse(fs.readFileSync(realTasksPath, 'utf8'))
  assert.ok(tasks.length >= 10, `expected at least 10 real tasks, got ${tasks.length}`)
  for (const item of tasks) {
    assert.ok(item.id, `missing id in ${JSON.stringify(item)}`)
    assert.ok(item.level, `missing level in ${item.id}`)
    assert.ok(Array.isArray(item.criteria) && item.criteria.length > 0, `missing criteria in ${item.id}`)
  }
})
