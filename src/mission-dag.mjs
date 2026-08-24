/**
 * Mission DAG: a mutable task graph with dependencies and capability
 * constraints. This is the P2 upgrade from fixed Mission templates to a real
 * dynamic plan.
 */

import { buildPhaseTasks } from './mission-planner.mjs'
import { resolveCapabilityV2 } from './capability-brain.mjs'
import { classifyFailure } from './failure-taxonomy.mjs'

export function createTask({ id, goal, dependencies = [], allowedTools = [], writeScope = '', acceptance = [], verification = [], rollback = '', requiredCapabilities = [], preferredCapabilities = [], forbiddenCapabilities = [] } = {}) {
  return {
    id,
    goal,
    dependencies,
    allowedTools,
    writeScope,
    acceptance,
    verification,
    rollback,
    requiredCapabilities,
    preferredCapabilities,
    forbiddenCapabilities,
    logicalId: id,
    replaces: null,
    attempt: 1,
    status: 'pending',
    confidence: 0,
    evidence: [],
  }
}

export function createMissionDag(mission) {
  const phases = mission?.phases || []
  const tasks = []
  let seq = 0
  for (const phase of phases) {
    const phaseTasks = buildPhaseTasks(phase.id, mission?.taskType)
    for (const goal of phaseTasks) {
      seq += 1
      const id = `T${seq}`
      const dependencies = tasks.length ? [tasks[tasks.length - 1].id] : []
      tasks.push(createTask({
        id,
        goal,
        dependencies,
        acceptance: [`${goal} is complete`],
        verification: phase.id === 'validate' || phase.id === 'verify' ? ['run relevant checks'] : [],
        requiredCapabilities: phase.id === 'validate' || phase.id === 'verify' ? ['verification'] : [],
      }))
    }
  }
  return { mission, tasks }
}

export function addTask(dag, task) {
  return { ...dag, tasks: [...dag.tasks, task] }
}

export function getReadyTasks(dag) {
  const done = new Set(dag.tasks.filter((t) => t.status === 'done').map((t) => t.id))
  return dag.tasks.filter((t) => t.status === 'pending' && t.dependencies.every((d) => done.has(d)))
}

export function markTaskDone(dag, taskId, evidence = {}) {
  const target = dag.tasks.find((t) => t.id === taskId)
  if (!target) return dag
  return {
    ...dag,
    tasks: dag.tasks.map((t) => {
      if (t.id === taskId) {
        return { ...t, status: 'done', evidence: [...t.evidence, evidence] }
      }
      // When a retry attempt succeeds, rewire downstream dependencies from the
      // replaced attempt to this successful attempt and supersede the old one.
      if (target.replaces && t.dependencies.includes(target.replaces)) {
        return {
          ...t,
          dependencies: t.dependencies.map((d) => d === target.replaces ? target.id : d),
        }
      }
      if (target.replaces && t.id === target.replaces) {
        return { ...t, status: 'superseded' }
      }
      return t
    }),
  }
}

export function isMissionDagComplete(dag = {}) {
  const tasks = dag.tasks || []
  if (!tasks.length) return false
  return tasks.every((t) => ['done', 'superseded', 'skipped'].includes(t.status))
}

export function insertAfter(dag, afterId, task) {
  const index = dag.tasks.findIndex((t) => t.id === afterId)
  if (index === -1) return addTask(dag, task)
  const tasks = [...dag.tasks]
  tasks.splice(index + 1, 0, task)
  return { ...dag, tasks }
}

export function applyObservationToDag(dag, observation = {}, failedTaskId = null) {
  const type = observation.type || ''
  if (type === 'test_failure' || type === 'build_failure') {
    const taskId = failedTaskId || observation.taskId || null
    const failedTask = taskId ? dag.tasks.find((t) => t.id === taskId) : null
    const baseId = taskId || 'T'
    const attempt = (failedTask?.attempt || 0) + 1
    const repairId = `R-${Date.now().toString(36)}`
    const retryId = `${baseId}-a${attempt + 1}`

    const tasks = (dag.tasks || []).map((t) => t.id === taskId ? { ...t, status: 'failed', attempt, failure: observation } : t)
    const doneIds = tasks.filter((t) => t.status === 'done').map((t) => t.id)
    const failure = classifyFailure(observation)
    const repair = createTask({
      id: repairId,
      goal: `Diagnose and repair: ${failure.category} — ${failure.recovery}`,
      dependencies: doneIds,
      acceptance: ['verification passes after repair'],
      verification: ['run failing checks again'],
      requiredCapabilities: ['debugging'],
      forbiddenCapabilities: ['source.write'],
    })
    // Repair tasks should be allowed to write; fix forbidden.
    repair.forbiddenCapabilities = []

    const retry = failedTask
      ? {
          ...failedTask,
          id: retryId,
          logicalId: failedTask.logicalId || baseId,
          replaces: taskId,
          goal: failedTask.goal || 'Retry the failed task',
          dependencies: [repairId],
          status: 'pending',
          attempt,
          evidence: [],
          failure: undefined,
        }
      : {
          ...createTask({
            id: retryId,
            goal: 'Retry the failed task',
            dependencies: [repairId],
            requiredCapabilities: ['debugging'],
          }),
          logicalId: baseId,
          replaces: taskId,
          attempt,
        }

    return { ...dag, tasks: [...tasks, repair, retry] }
  }
  return dag
}

export function hasWriteOverlap(a = {}, b = {}) {
  const aScopes = Array.isArray(a.writeScope) ? a.writeScope : (a.resourceLocks || [])
  const bScopes = Array.isArray(b.writeScope) ? b.writeScope : (b.resourceLocks || [])
  return aScopes.some((s) => bScopes.includes(s))
}

export function selectReadyBatch(ready = [], maxParallel = 1) {
  const batch = []
  for (const task of ready) {
    if (batch.length >= maxParallel) break
    if (batch.some((sel) => hasWriteOverlap(sel, task))) continue
    batch.push(task)
  }
  return batch
}

export function scheduleParallel(dag, maxParallel = 2) {
  const batches = []
  let current = dag
  while (true) {
    const ready = getReadyTasks(current)
    if (ready.length === 0) break
    const batch = selectReadyBatch(ready, maxParallel)
    batches.push(batch.map((t) => t.id))
    for (const t of batch) current = markTaskDone(current, t.id)
  }
  return batches
}

export function bindCapabilitiesToDag(dag, capabilityBrain) {
  return {
    ...dag,
    tasks: dag.tasks.map((t) => {
      const missing = (t.requiredCapabilities || []).filter((req) => resolveCapabilityV2(capabilityBrain, req).length === 0)
      if (missing.length) {
        return { ...t, status: 'blocked', blockedReason: `missing capability: ${missing.join(', ')}` }
      }
      return {
        ...t,
        allowedTools: (t.requiredCapabilities || [])
          .flatMap((req) => resolveCapabilityV2(capabilityBrain, req).slice(0, 1))
          .map((c) => c.id),
      }
    }),
  }
}

export function formatMissionDag(dag = {}) {
  const lines = [`Mission DAG (${dag.tasks?.length || 0} tasks):`]
  for (const t of dag.tasks || []) {
    const deps = t.dependencies.length ? ` <- ${t.dependencies.join(',')}` : ''
    lines.push(`- ${t.id} [${t.status}] ${t.goal}${deps}`)
    if (t.requiredCapabilities.length) lines.push(`  requires: ${t.requiredCapabilities.join(', ')}`)
  }
  return lines.join('\n')
}