/**
 * Real agent-run benchmark runner helpers.
 *
 * Normalizes raw run metrics, compares raw-Flash vs Omni arms, and formats an
 * OES comparison report. Actual data is collected by running tasks in DSH
 * (e.g. through the omni_benchmark tool) and storing JSON files under
 * benchmark/results/{raw,omni}/.
 */

import { computeOes } from './engineering-benchmark.mjs'

export function normalizeRun(raw = {}) {
  return {
    id: String(raw.id || 'unknown'),
    arm: String(raw.arm || 'unknown'),
    task: String(raw.task || ''),
    level: String(raw.level || 'L1 Single-file'),
    success: Boolean(raw.success),
    firstPass: Number(raw.firstPass ?? (raw.success ? 1 : 0)),
    finalPass: Number(raw.finalPass ?? (raw.success ? 1 : 0)),
    regressionRate: Number(raw.regressionRate ?? 0),
    humanInterventions: Number(raw.humanInterventions ?? 0),
    toolCalls: Number(raw.toolCalls ?? 0),
    repairCount: Number(raw.repairCount ?? 0),
    failureRecoveryRate: Number(raw.failureRecoveryRate ?? 0),
    falseCompletionRate: Number(raw.falseCompletionRate ?? 0),
    tokens: Number(raw.tokens ?? 0),
    cost: Number(raw.cost ?? 0),
    durationMs: Number(raw.durationMs ?? 0),
  }
}

export function scoreRun(raw = {}) {
  const run = normalizeRun(raw)
  return {
    ...run,
    oes: computeOes(run),
  }
}

export function compareArms(rawRuns = [], omniRuns = []) {
  const raw = rawRuns.map(scoreRun)
  const omni = omniRuns.map(scoreRun)
  const byId = (list) => new Map(list.map((r) => [r.id, r]))

  const ids = [...new Set([...raw.map((r) => r.id), ...omni.map((r) => r.id)])]
  const rows = ids.map((id) => {
    const a = byId(raw).get(id)
    const b = byId(omni).get(id)
    return {
      id,
      task: (b?.task || a?.task || id),
      raw: a || null,
      omni: b || null,
    }
  })

  const avg = (list, key) => {
    const vals = list.map((r) => r[key]).filter((v) => Number.isFinite(v))
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0
  }
  const avgOes = (list) => list.length ? list.reduce((s, r) => s + r.oes.score, 0) / list.length : 0

  const summary = {
    raw: {
      count: raw.length,
      successRate: raw.length ? raw.filter((r) => r.success).length / raw.length : 0,
      avgOes: avgOes(raw),
      avgCost: avg(raw, 'cost'),
      avgToolCalls: avg(raw, 'toolCalls'),
    },
    omni: {
      count: omni.length,
      successRate: omni.length ? omni.filter((r) => r.success).length / omni.length : 0,
      avgOes: avgOes(omni),
      avgCost: avg(omni, 'cost'),
      avgToolCalls: avg(omni, 'toolCalls'),
    },
    rows,
  }
  return summary
}

export function formatComparison(comparison) {
  const lines = ['Omni vs raw Flash — OES comparison', '']
  const { raw, omni } = comparison
  lines.push(`raw Flash:  n=${raw.count}  success=${Math.round(raw.successRate * 100)}%  avgOES=${Math.round(raw.avgOes * 1000) / 1000}  avgCost=${Math.round(raw.avgCost * 1000) / 1000}  avgTools=${Math.round(raw.avgToolCalls * 10) / 10}`)
  lines.push(`Omni:       n=${omni.count}  success=${Math.round(omni.successRate * 100)}%  avgOES=${Math.round(omni.avgOes * 1000) / 1000}  avgCost=${Math.round(omni.avgCost * 1000) / 1000}  avgTools=${Math.round(omni.avgToolCalls * 10) / 10}`)
  lines.push('')
  for (const row of comparison.rows) {
    const a = row.raw ? `${row.raw.success ? 'PASS' : 'FAIL'} oes=${row.raw.oes.score}` : 'missing'
    const b = row.omni ? `${row.omni.success ? 'PASS' : 'FAIL'} oes=${row.omni.oes.score}` : 'missing'
    lines.push(`- ${row.id}: raw[${a}] omni[${b}]`)
  }
  return lines.join('\n')
}
