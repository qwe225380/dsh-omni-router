/**
 * Recovery Telemetry.
 *
 * Records what Omni actually did after failures (retry / repair / expand
 * context / change hypothesis / escalate / stop) and aggregates the funnel, so
 * "Recovery" stops being a claim and becomes measured data.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const RECOVERY_ACTIONS = ['retry', 'repair', 'expand_context', 'change_hypothesis', 'escalate', 'stop']

export function failureFingerprint({ category = '', file = '', message = '' } = {}) {
  const seed = `${category}|${file}|${String(message || '').slice(0, 200)}`
  return createHash('sha1').update(seed).digest('hex').slice(0, 12)
}

function recoveryTelemetryPath(cwd) {
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

function appendRecoveryTelemetry(cwd, entry = {}) {
  const file = recoveryTelemetryPath(cwd)
  const records = loadRecoveryTelemetry(cwd)
  records.push({
    taskId: entry.taskId || '',
    failureCount: entry.failureCount || 0,
    recoveryCount: entry.recoveryCount || 0,
    actions: entry.actions || [],
    failures: entry.failures || [],
    transitions: entry.transitions || [],
    cost: entry.cost ?? null,
    outcome: entry.outcome || null,
    at: entry.at || new Date().toISOString(),
  })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(records, null, 2), 'utf8')
  return file
}

export function recordMissionRecovery(cwd, { taskId = '', actions = [], outcome, cost } = {}) {
  const list = Array.isArray(actions) ? actions : []
  const failures = list
    .filter((a) => {
      const t = String(a?.type || a?.observation?.type || a?.observation?.kind || '')
      return t.startsWith('failure') || t.includes('fail')
    })
    .map((a, idx) => {
      const observation = a.observation || {}
      const category = String(observation.category || a.category || a.reason || a.type || 'failure').slice(0, 80)
      return {
        category,
        fingerprint: failureFingerprint({
          category,
          file: observation.file || a.file || '',
          message: String(observation.detail || observation.message || a.detail || ''),
        }),
        attempt: a.attempt ?? idx + 1,
      }
    })
  const recoveryActions = list
    .filter((a) => RECOVERY_ACTIONS.includes(a?.action || a?.type))
    .map((a) => ({ action: a.action || a.type, attempt: a.attempt || null }))
  if (!failures.length && !recoveryActions.length) return null
  // failure → chosen recovery → outcome transitions.
  // Nearest binding: the first recovery action whose attempt >= failure.attempt
  // (actions without attempt fall back to the first action).
  const transitions = failures.map((failure) => {
    const action = recoveryActions.find((a) => a.attempt === null || a.attempt === undefined || Number(a.attempt) >= Number(failure.attempt))
      || recoveryActions[0]
    return {
      category: failure.category,
      fingerprint: failure.fingerprint,
      action: action?.action || 'none',
      attempt: action?.attempt ?? failure.attempt,
      outcome,
    }
  })
  return appendRecoveryTelemetry(cwd, {
    taskId,
    failureCount: failures.length,
    recoveryCount: recoveryActions.length,
    actions: recoveryActions,
    failures,
    transitions,
    cost,
    outcome,
  })
}

export function aggregateRecoveryTelemetry(records = []) {
  const byAction = {}
  const byCategoryAction = {}
  const fingerprints = new Map()
  let recovered = 0
  let total = 0
  let totalAttempts = 0
  for (const entry of records) {
    total += 1
    totalAttempts += entry.recoveryCount || 0
    const ok = entry.outcome === 'success' || entry.outcome === 'recovered'
    if (ok) recovered += 1
    for (const action of entry.actions || []) {
      byAction[action.action] = (byAction[action.action] || 0) + 1
    }
    for (const failure of entry.failures || []) {
      fingerprints.set(failure.fingerprint, (fingerprints.get(failure.fingerprint) || 0) + 1)
      const transition = (entry.transitions || []).find((t) => t.fingerprint === failure.fingerprint)
      const action = transition?.action || (entry.actions || []).map((a) => a.action).join('+') || 'none'
      const key = `${failure.category}:${action}`
      const slot = byCategoryAction[key] || { count: 0, success: 0 }
      slot.count += 1
      if (ok) slot.success += 1
      byCategoryAction[key] = slot
    }
  }
  const repeated = [...fingerprints.values()].filter((n) => n > 1).length
  return {
    tasksWithRecovery: total,
    recoveryAttempts: totalAttempts,
    avgAttemptsPerTask: total ? Math.round((totalAttempts / total) * 100) / 100 : 0,
    recoverySuccessRate: total ? Math.round((recovered / total) * 1000) / 1000 : null,
    byAction,
    byCategoryAction,
    repeatedFingerprintCount: repeated,
    repeatedFingerprintRate: fingerprints.size ? Math.round((repeated / fingerprints.size) * 1000) / 1000 : 0,
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