/**
 * Recovery Telemetry.
 *
 * Records what Omni actually did after failures (retry / repair / expand
 * context / change hypothesis / escalate / stop) and aggregates the funnel, so
 * "Recovery" stops being a claim and becomes measured data.
 */

import fs from 'node:fs'
import path from 'node:path'

export const RECOVERY_ACTIONS = ['retry', 'repair', 'expand_context', 'change_hypothesis', 'escalate', 'stop']

export function recoveryTelemetryPath(cwd) {
  return path.join(cwd, '.omni', 'recovery-telemetry.json')
}

export function loadRecoveryTelemetry(cwd) {
  const file = recoveryTelemetryPath(cwd)
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
}

export function appendRecoveryTelemetry(cwd, entry = {}) {
  const file = recoveryTelemetryPath(cwd)
  const records = loadRecoveryTelemetry(cwd)
  records.push({
    taskId: entry.taskId || '',
    failureCount: entry.failureCount || 0,
    recoveryCount: entry.recoveryCount || 0,
    actions: entry.actions || [],
    outcome: entry.outcome || null,
    at: entry.at || new Date().toISOString(),
  })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8')
  return file
}

export function recordMissionRecovery(cwd, { taskId = '', actions = [], outcome } = {}) {
  const list = Array.isArray(actions) ? actions : []
  const failures = list.filter((a) => {
    const t = String(a?.type || a?.observation?.type || a?.observation?.kind || '')
    return t.startsWith('failure') || t.includes('fail')
  })
  const recoveryActions = list
    .filter((a) => RECOVERY_ACTIONS.includes(a?.action || a?.type))
    .map((a) => ({ action: a.action || a.type, attempt: a.attempt || null }))
  if (!failures.length && !recoveryActions.length) return null
  return appendRecoveryTelemetry(cwd, {
    taskId,
    failureCount: failures.length,
    recoveryCount: recoveryActions.length,
    actions: recoveryActions,
    outcome,
  })
}

export function aggregateRecoveryTelemetry(records = []) {
  const byAction = {}
  let recovered = 0
  let total = 0
  let totalAttempts = 0
  for (const entry of records) {
    total += 1
    totalAttempts += entry.recoveryCount || 0
    if (entry.outcome === 'success' || entry.outcome === 'recovered') recovered += 1
    for (const action of entry.actions || []) {
      byAction[action.action] = (byAction[action.action] || 0) + 1
    }
  }
  return {
    tasksWithRecovery: total,
    recoveryAttempts: totalAttempts,
    avgAttemptsPerTask: total ? Math.round((totalAttempts / total) * 100) / 100 : 0,
    recoverySuccessRate: total ? Math.round((recovered / total) * 1000) / 1000 : null,
    byAction,
    funnel: {
      retry: byAction.retry || 0,
      repair: byAction.repair || 0,
      expandContext: byAction.expand_context || 0,
      changeHypothesis: byAction.change_hypothesis || 0,
      escalate: byAction.escalate || 0,
      stop: byAction.stop || 0,
    },
  }
}

export function formatRecoveryTelemetry(aggregate = {}) {
  return [
    `Recovery telemetry: ${aggregate.tasksWithRecovery} tasks, ${aggregate.recoveryAttempts} attempts, success=${aggregate.recoverySuccessRate}`,
    `Funnel: retry=${aggregate.funnel?.retry} repair=${aggregate.funnel?.repair} expand=${aggregate.funnel?.expandContext} hypothesis=${aggregate.funnel?.changeHypothesis} escalate=${aggregate.funnel?.escalate} stop=${aggregate.funnel?.stop}`,
  ].join('\n')
}