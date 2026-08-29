/**
 * Capability Provisioner.
 *
 * Discovers candidate plugins/skills/MCPs for missing capabilities, evaluates
 * them, selects a minimal set, installs through DSH's existing mechanisms, and
 * verifies/rolls back the result. Omni does not become a marketplace: it
 * delegates discovery to installed marketplace/hub tools, community adapters,
 * or explicit commands.
 */

import fs from 'node:fs'
import path from 'node:path'
import { scorePluginCandidate } from './capability-quality.mjs'
import { solveMinimalSet } from './capability-solver.mjs'

export const TRUST_MODES = ['recommend', 'auto-trusted', 'manual']

export function canAutoInstall(candidate = {}, mode = 'auto-trusted', trustedSources = []) {
  if (mode === 'manual' || mode === 'recommend') return false
  const source = candidate.source || candidate.package || ''
  const trusted = candidate.verified === true || candidate.trustedSource === true || trustedSources.includes(source)
  const risk = candidate.risk || 'low'
  if (risk === 'high' || risk === 'critical') return false
  return trusted
}

export function createProvisionTransaction({
  package: pkg,
  version,
  source,
  reason,
  profile,
  beforeProfile,
  installCommand,
  rollbackCommand,
} = {}) {
  return {
    id: `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    package: pkg,
    version,
    source,
    reason,
    profile,
    beforeProfile,
    installCommand,
    rollbackCommand,
    installedAt: new Date().toISOString(),
    status: 'pending',
  }
}

export async function probeCapability(provider = {}, { tools = [], skills = [], probe } = {}) {
  const checks = []
  for (const tool of provider.expectedTools || []) {
    const ok = tools.includes(tool)
    checks.push({ type: 'tool', name: tool, ok })
  }
  for (const skill of provider.expectedSkills || []) {
    const ok = skills.includes(skill)
    checks.push({ type: 'skill', name: skill, ok })
  }
  if (typeof probe === 'function') {
    try {
      const ok = await probe(provider)
      checks.push({ type: 'probe', name: provider.id || provider.package || 'probe', ok: !!ok })
    } catch {
      checks.push({ type: 'probe', name: provider.id || provider.package || 'probe', ok: false })
    }
  }
  const ok = checks.length === 0 || checks.every((c) => c.ok)
  return { ok, checks }
}

export async function rollbackProvision(txn = {}, execute) {
  if (!txn?.rollbackCommand && typeof execute !== 'function') {
    return { ok: false, reason: 'no rollback executor or command', txn }
  }
  try {
    if (typeof execute === 'function') {
      const result = await execute({ type: 'rollback', txn })
      return { ok: result !== false, txn: { ...txn, status: result === false ? 'rollback_failed' : 'rolled_back' } }
    }
    // execute as command runner function (command, cwd?) — kept for adapters.
    const result = await execute(txn.rollbackCommand, txn)
    return { ok: result !== false, txn: { ...txn, status: result === false ? 'rollback_failed' : 'rolled_back' } }
  } catch (error) {
    return { ok: false, reason: error?.message || String(error), txn: { ...txn, status: 'rollback_failed' } }
  }
}

export async function discoverCandidates(missing = [], adapters = [], options = {}) {
  const seen = new Map()
  for (const adapter of adapters) {
    let candidates = []
    try {
      if (typeof adapter?.search === 'function') {
        candidates = await adapter.search(missing, options) || []
      } else if (typeof adapter === 'function') {
        candidates = await adapter(missing, options) || []
      }
    } catch {
      candidates = []
    }
    for (const candidate of candidates) {
      const key = candidate.id || candidate.package || candidate.name
      if (!key) continue
      if (!seen.has(key)) seen.set(key, { ...candidate, _adapter: adapter.id || adapter.name || 'unknown' })
    }
  }
  return [...seen.values()]
}

export function evaluateProvisionPlan(missing = [], candidates = [], brain = { capabilities: [] }, options = {}) {
  const maxPlugins = Number(options.maxPlugins ?? 2)
  const minScore = Number(options.minScore ?? 0.4)
  const scored = candidates.map((c) => scorePluginCandidate(c, missing, brain, options))
  const solution = solveMinimalSet(missing, candidates, { brain, maxPlugins, minScore })
  return {
    missing,
    candidates: scored.sort((a, b) => b.score - a.score),
    solution,
    selected: solution.scored,
    requiresApproval: solution.scored.filter((s) => !canAutoInstall(s.candidate, options.mode || 'auto-trusted', options.trustedSources || [])),
  }
}

export async function provisionCapabilities(plan = {}, {
  execute,
  profile,
  mode = 'auto-trusted',
  trustedSources = [],
  probeTools = [],
  probeSkills = [],
  probe,
} = {}) {
  const results = []
  for (const scored of plan.selected || []) {
    const candidate = scored.candidate
    const txn = createProvisionTransaction({
      package: candidate.package || candidate.id,
      version: candidate.version,
      source: candidate.source,
      reason: plan.missing?.join(', ') || '',
      profile,
      beforeProfile: plan.beforeProfile,
      installCommand: candidate.installCommand,
      rollbackCommand: candidate.rollbackCommand,
    })
    if (!canAutoInstall(candidate, mode, trustedSources)) {
      results.push({ candidate, status: 'needs_approval', txn })
      continue
    }
    try {
      if (typeof execute === 'function') {
        const installResult = await execute({ type: 'install', candidate, profile, txn })
        if (installResult === false) {
          results.push({ candidate, status: 'install_failed', txn: { ...txn, status: 'install_failed' } })
          continue
        }
      } else if (candidate.installCommand) {
        // No executor provided; command-based install is left to the caller.
        results.push({ candidate, status: 'install_command_ready', txn })
        continue
      } else {
        results.push({ candidate, status: 'no_executor', txn })
        continue
      }
      const probeResult = await probeCapability(candidate, { tools: probeTools, skills: probeSkills, probe })
      if (!probeResult.ok) {
        const rollback = await rollbackProvision({ ...txn, status: 'probe_failed' }, execute)
        results.push({ candidate, status: rollback.ok ? 'rolled_back' : 'rollback_failed', txn: rollback.txn, probe: probeResult })
        continue
      }
      results.push({ candidate, status: 'ready', txn: { ...txn, status: 'ready' }, probe: probeResult })
    } catch (error) {
      results.push({ candidate, status: 'error', error: error?.message || String(error), txn: { ...txn, status: 'error' } })
    }
  }
  return { results, summary: summarizeProvisionResults(results) }
}

export function summarizeProvisionResults(results = []) {
  const counts = {}
  for (const r of results) counts[r.status] = (counts[r.status] || 0) + 1
  return counts
}

export function formatProvisionResult(result = {}) {
  const lines = []
  for (const r of result.results || []) {
    lines.push(`- ${r.candidate?.id || r.candidate?.package}: ${r.status}${r.error ? ` (${r.error})` : ''}`)
    if (r.probe?.checks?.length) {
      for (const check of r.probe.checks) lines.push(`  ${check.ok ? '✓' : '✗'} ${check.type} ${check.name}`)
    }
  }
  return lines.join('\n')
}

// --- Capability change audit (P0.3) -----------------------------------------

function capabilityAuditPath(cwd) {
  return path.join(cwd, '.omni', 'capability-audit.json')
}

export function loadCapabilityAudit(cwd) {
  const file = capabilityAuditPath(cwd)
  if (!fs.existsSync(file)) return []
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return []
  }
}

export function appendCapabilityAudit(cwd, entry = {}) {
  const file = capabilityAuditPath(cwd)
  const audit = loadCapabilityAudit(cwd)
  audit.push({
    taskId: entry.taskId || '',
    capabilityGap: entry.capabilityGap || [],
    provider: entry.provider || '',
    package: entry.package || '',
    version: entry.version || '',
    source: entry.source || '',
    reason: entry.reason || '',
    approvedBy: entry.approvedBy || 'recommend',
    installedAt: entry.installedAt || new Date().toISOString(),
    probeResult: entry.probeResult || null,
  })
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(audit, null, 2), 'utf8')
  return file
}

// --- Discovery adapters -----------------------------------------------------

export function createMarketplaceAdapter({ search, id = 'marketplace' } = {}) {
  return {
    id,
    async search(missing, options) {
      if (typeof search !== 'function') return []
      return search(missing, options)
    },
  }
}

export function createHubAdapter({ search, id = 'hub' } = {}) {
  return createMarketplaceAdapter({ search, id })
}

export function createStaticRegistryAdapter(registry = [], id = 'registry') {
  return {
    id,
    async search(missing, options = {}) {
      const missingSet = new Set(missing)
      return registry
        .filter((candidate) => (candidate.provides || []).some((c) => missingSet.has(c)))
        .map((candidate) => ({ ...candidate, source: candidate.source || 'static-registry' }))
    },
  }
}