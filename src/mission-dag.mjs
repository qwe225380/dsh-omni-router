/**
 * Mission DAG: a mutable task graph with dependencies and capability
 * constraints. This is the P2 upgrade from fixed Mission templates to a real
 * dynamic plan.
 */

import { buildPhaseTasks } from './mission-planner.mjs'
import { resolveCapability } from './capability-brain.mjs'

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
  return {
    ...dag,
    tasks: dag.tasks.map((t) => t.id === taskId ? { ...t, status: 'done', evidence: [...t.evidence, evidence] } : t),
  }
}

export function insertAfter(dag, afterId, task) {
  const index = dag.tasks.findIndex((t) => t.id === afterId)
  if (index === -1) return addTask(dag, task)
  const tasks = [...dag.tasks]
  tasks.splice(index + 1, 0, task)
  return { ...dag, tasks }
}

export function applyObservationToDag(dag, observation = {}) {
  const type = observation.type || ''
  if (type === 'test_failure' || type === 'build_failure') {
    const repair = createTask({
      id: `R-${Date.now().toString(36)}`,
      goal: 'Diagnose and repair the failing verification',
      dependencies: dag.tasks.filter((t) => t.status === 'done').map((t) => t.id),
      acceptance: ['verification passes after repair'],
      verification: ['run failing checks again'],
      requiredCapabilities: ['debugging'],
      forbiddenCapabilities: ['source.write'] ,
    })
    // Repair tasks should be allowed to write; fix forbidden.
    repair.forbiddenCapabilities = []
    return addTask(dag, repair)
  }
  return dag
}

export function scheduleParallel(dag, maxParallel = 2) {
  const batches = []
  let current = dag
  while (true) {
    const ready = getReadyTasks(current)
    if (ready.length === 0) break
    const batch = ready.slice(0, maxParallel)
    batches.push(batch.map((t) => t.id))
    for (const t of batch) current = markTaskDone(current, t.id)
  }
  return batches
}

export function bindCapabilitiesToDag(dag, capabilityBrain) {
  return {
    ...dag,
    tasks: dag.tasks.map((t) => ({
      ...t,
      allowedTools: (t.requiredCapabilities || [])
        .flatMap((req) => resolveCapability(capabilityBrain, req).slice(0, 1))
        .map((c) => c.id),
    })),
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
