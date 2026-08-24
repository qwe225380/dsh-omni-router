/**
 * Mission IR.
 *
 * Mission DAG is treated as an intelligence representation (IR), not a
 * runtime. Omni compiles it to a host execution plan through the OmniHost
 * adapter; DSH/Codex/Claude own execution.
 */

export function toMissionIR(dag = {}) {
  const tasks = (dag.tasks || []).map((t) => ({
    id: t.id,
    role: t.role || inferRole(t),
    objective: t.goal || '',
    dependencies: t.dependencies || [],
    readScope: t.readScope || [],
    writeScope: t.writeScope || t.resourceLocks || [],
    acceptance: t.acceptance || [],
    evidenceRequirements: t.verification || [],
    requiredCapabilities: t.requiredCapabilities || [],
    risk: t.risk || 'low',
  }))
  return {
    objective: dag.mission?.task || '',
    tasks,
  }
}

export function compileMissionToHost(ir = {}, host = {}) {
  if (typeof host.compileMission === 'function') {
    const plan = host.compileMission(ir)
    return { ...plan, degraded: false }
  }
  return { plan: ir, degraded: true, reason: 'host has no compileMission adapter' }
}

function inferRole(task = {}) {
  const text = `${task.goal || ''} ${task.id || ''}`
  if (/verify|verification|test suite|regression/i.test(text)) return 'verifier'
  if (/review/i.test(text)) return 'reviewer'
  if (/repair|diagnose/i.test(text)) return 'repair'
  if (/scout|inspect|map/i.test(text)) return 'scout'
  return 'builder'
}