/**
 * Agent Runtime: Observe → Think → Act → Replan loop.
 *
 * Drives a Mission Planner mission through phases with a bounded loop. The
 * actual action execution is provided by the caller (e.g. subagents or tools).
 *
 * v2: real replan — failures switch phase via decideReplan.nextPhase, and the
 * loop enforces global budgets (maxGlobalSteps, maxReplans,
 * maxSameActionRetries, maxTokens, maxCost).
 */

import { buildPhaseTasks, decideReplan } from './mission-planner.mjs'
import { applyObservationToDag, getReadyTasks, markTaskDone } from './mission-dag.mjs'

export function createRuntimeState(mission, options = {}) {
  const phases = mission?.phases || []
  return {
    mission,
    phaseIndex: 0,
    phase: phases[0]?.id || null,
    phaseStep: 0,
    globalStep: 0,
    replanCount: 0,
    repairCount: 0,
    sameActionCount: 0,
    tokenUsage: 0,
    cost: 0,
    status: 'active',
    observations: [],
    actions: [],
    budgets: {
      maxGlobalSteps: Number(options.maxGlobalSteps) || 50,
      maxReplans: Number(options.maxReplans) || 5,
      maxSameActionRetries: Number(options.maxSameActionRetries) || 3,
      maxRepairs: Number(options.maxRepairs) || 5,
      maxTokens: Number(options.maxTokens) || 200000,
      maxCost: Number(options.maxCost) || 2,
    },
  }
}

export function nextRuntimeAction(state) {
  const phase = state.phase
  const tasks = buildPhaseTasks(phase, state.mission?.taskType)
  const task = tasks[Math.min(state.phaseStep, tasks.length - 1)] || 'Continue current phase'
  return { phase, task, index: state.phaseStep }
}

export function applyObservation(state, observation = {}) {
  const replan = decideReplan({ phase: state.phase }, observation)

  if (replan.replan) {
    const sameAction = replan.nextPhase === state.phase
    const nextReplanCount = state.replanCount + 1
    const nextSameActionCount = sameAction ? state.sameActionCount + 1 : 0

    if (nextReplanCount > state.budgets.maxReplans) {
      return { ...state, status: 'blocked', observations: [...state.observations, { type: 'max_replans' }] }
    }
    if (nextSameActionCount > state.budgets.maxSameActionRetries) {
      return { ...state, status: 'blocked', observations: [...state.observations, { type: 'max_same_action_retries' }] }
    }

    return {
      ...state,
      replanCount: nextReplanCount,
      sameActionCount: nextSameActionCount,
      phase: replan.nextPhase || state.phase,
      phaseStep: 0,
      observations: [...state.observations, { type: observation.type || 'unknown', reason: replan.reason, nextPhase: replan.nextPhase }],
    }
  }

  const phases = state.mission?.phases || []
  const tasks = buildPhaseTasks(state.phase, state.mission?.taskType)
  const nextStep = state.phaseStep + 1
  if (nextStep < tasks.length) {
    return { ...state, phaseStep: nextStep, sameActionCount: 0, observations: [...state.observations, { type: observation.type || 'step_done' }] }
  }

  const nextPhaseIndex = state.phaseIndex + 1
  if (nextPhaseIndex >= phases.length) {
    return { ...state, status: 'completed', observations: [...state.observations, { type: 'mission_complete' }] }
  }

  return {
    ...state,
    phaseIndex: nextPhaseIndex,
    phase: phases[nextPhaseIndex].id,
    phaseStep: 0,
    sameActionCount: 0,
    observations: [...state.observations, { type: 'phase_complete', phase: state.phase }],
  }
}

export async function runMissionLoop(state, { act, observe, maxSteps } = {}) {
  let current = state
  const budget = current.budgets || {}
  const maxGlobalSteps = maxSteps ?? budget.maxGlobalSteps ?? 50

  while (current.status === 'active') {
    if (current.globalStep >= maxGlobalSteps) {
      current = { ...current, status: 'max_steps' }
      break
    }
    if (current.tokenUsage >= budget.maxTokens) {
      current = { ...current, status: 'max_tokens' }
      break
    }
    if (current.cost >= budget.maxCost) {
      current = { ...current, status: 'max_cost' }
      break
    }

    const action = nextRuntimeAction(current)
    const result = await act(action, current)
    const observation = await observe(result, current)
    current = applyObservation(current, observation)
    current = {
      ...current,
      globalStep: current.globalStep + 1,
      actions: [...current.actions, { action, observation }],
      tokenUsage: current.tokenUsage + (result.tokenUsage || 0),
      cost: current.cost + (result.cost || 0),
    }
  }
  return current
}

/**
 * DAG-driven runtime: execute ready tasks from a Mission DAG, optionally in
 * parallel, and mutate the DAG on failures.
 */
export async function runDagLoop(dag, { act, observe, maxSteps = 50, maxParallel = 1 } = {}) {
  let current = dag
  let step = 0
  const actions = []

  while (step < maxSteps) {
    const ready = getReadyTasks(current)
    if (ready.length === 0) break
    const batch = ready.slice(0, maxParallel)
    const results = await Promise.all(batch.map(async (task) => {
      const action = { taskId: task.id, task, phase: task.id }
      const result = await act(action, current)
      const observation = await observe(result, current)
      return { task, result, observation }
    }))

    for (const { task, observation } of results) {
      if (observation?.type === 'test_failure' || observation?.type === 'build_failure') {
        current = applyObservationToDag(current, observation)
      } else {
        current = markTaskDone(current, task.id, observation)
      }
      actions.push({ taskId: task.id, observation })
    }
    step += 1
  }

  const done = current.tasks.every((t) => t.status === 'done')
  return {
    dag: current,
    status: done ? 'completed' : step >= maxSteps ? 'max_steps' : 'blocked',
    actions,
  }
}
