/**
 * OmniBench results helpers.
 *
 * Reading, summarizing, and importing real agent-run benchmark results from
 * benchmark/results/{raw,omni}/*.json. Used by omni_benchmark_status and
 * omni_benchmark_import so users can paste/import runs collected outside the
 * current DSH session.
 */

import fs from 'node:fs'
import path from 'node:path'

import { normalizeRun, scoreRun } from './benchmark-runner.mjs'

export function collectResults(resultsRoot) {
  const groups = { raw: [], omni: [] }
  if (!resultsRoot || !fs.existsSync(resultsRoot)) return groups
  for (const arm of ['raw', 'omni']) {
    const dir = path.join(resultsRoot, arm)
    if (!fs.existsSync(dir)) continue
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
        groups[arm].push(scoreRun(raw))
      } catch {
        // skip malformed result files
      }
    }
  }
  return groups
}

export function summarizeResults(groups = {}) {
  const summarize = (list = []) => {
    if (!list.length) return { count: 0, successRate: 0, avgOes: 0, avgCost: 0, avgToolCalls: 0 }
    return {
      count: list.length,
      successRate: list.filter((r) => r.success).length / list.length,
      avgOes: list.reduce((s, r) => s + r.oes.score, 0) / list.length,
      avgCost: list.reduce((s, r) => s + r.cost, 0) / list.length,
      avgToolCalls: list.reduce((s, r) => s + r.toolCalls, 0) / list.length,
    }
  }
  return {
    raw: summarize(groups.raw),
    omni: summarize(groups.omni),
  }
}

export function formatResultSummary(summary = {}) {
  const fmt = (s) => `n=${s.count} success=${Math.round((s.successRate || 0) * 100)}% avgOES=${Math.round((s.avgOes || 0) * 1000) / 1000} avgCost=${Math.round((s.avgCost || 0) * 1000) / 1000} avgTools=${Math.round((s.avgToolCalls || 0) * 10) / 10}`
  return [
    'OmniBench results',
    `raw:  ${fmt(summary.raw || {})}`,
    `omni: ${fmt(summary.omni || {})}`,
  ].join('\n')
}

export function missingTaskIds(resultsRoot, tasks = []) {
  const groups = collectResults(resultsRoot)
  const have = (arm) => new Set(groups[arm].map((r) => String(r.id)))
  const rawHave = have('raw')
  const omniHave = have('omni')
  const missing = []
  for (const t of tasks || []) {
    const id = String(t.id || '')
    if (!id) continue
    const row = {
      id,
      raw: rawHave.has(id),
      omni: omniHave.has(id),
    }
    if (!row.raw || !row.omni) missing.push(row)
  }
  return missing
}

export function importBenchmarkRecord(resultsRoot, record = {}) {
  if (!record || !record.id || !['raw', 'omni'].includes(record.arm)) {
    throw new Error('record requires a valid id and arm (raw|omni)')
  }
  const run = normalizeRun(record)
  const dir = path.join(resultsRoot, run.arm)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${run.id}.json`)
  fs.writeFileSync(file, JSON.stringify(record, null, 2), 'utf8')
  return file
}
