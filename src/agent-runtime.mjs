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
import { applyObservationToDag, getReadyTasks, isMissionDagComplete, markTaskDone, selectReadyBatch } from './mission-dag.mjs'
import { nextStrategy, shouldShiftStrategy } from './strategy-shift.mjs'

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
    toolCalls: 0,
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
      maxToolCalls: Number(options.maxToolCalls) || 0,
      maxWallClockMs: Number(options.maxWallClockMs) || 0,
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
    const isRepair = replan.nextPhase === 'repair' || /repair/i.test(observation.type || '')
    const nextRepairCount = isRepair ? state.repairCount + 1 : state.repairCount

    if (nextReplanCount > state.budgets.maxReplans) {
      return { ...state, status: 'blocked', observations: [...state.observations, { type: 'max_replans' }] }
    }
    if (nextSameActionCount > state.budgets.maxSameActionRetries) {
      return { ...state, status: 'blocked', observations: [...state.observations, { type: 'max_same_action_retries' }] }
    }
    if (nextRepairCount > state.budgets.maxRepairs) {
      return { ...state, status: 'blocked', observations: [...state.observations, { type: 'max_repairs' }] }
    }

    return {
      ...state,
      replanCount: nextReplanCount,
      sameActionCount: nextSameActionCount,
      repairCount: nextRepairCount,
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
  const startTime = Date.now()

  while (current.status === 'active') {
    if (budget.maxWallClockMs > 0 && Date.now() - startTime >= budget.maxWallClockMs) {
      current = { ...current, status: 'max_wall_clock' }
      break
    }
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
    if (budget.maxToolCalls > 0 && current.toolCalls >= budget.maxToolCalls) {
      current = { ...current, status: 'max_tool_calls' }
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
      toolCalls: current.toolCalls + (result.toolCalls || 0),
    }
  }
  return current
}

/**
 * DAG-driven runtime: execute ready tasks from a Mission DAG, optionally in
 * parallel, and mutate the DAG on failures. Consumes a unified execution
 * budget so the production path has the same stop conditions as the legacy
 * mission loop.
 */
export async function runDagLoop(dag, {
  act,
  observe,
  maxSteps = 50,
  maxParallel = 1,
  maxWallClockMs = 0,
  maxTokens = 0,
  maxCost = 0,
  maxToolCalls = 0,
  maxReplans = 0,
  maxRepairs = 0,
  maxSameActionRetries = 0,
  budget = {},
  onProgress = null,
} = {}) {
  const b = {
    maxSteps: maxSteps ?? budget.steps ?? 50,
    maxParallel: maxParallel ?? budget.concurrency ?? 1,
    maxWallClockMs: maxWallClockMs ?? budget.wallClockMs ?? 0,
    maxTokens: maxTokens ?? budget.tokens ?? 0,
    maxCost: maxCost ?? budget.cost ?? 0,
    maxToolCalls: maxToolCalls ?? budget.toolCalls ?? 0,
    maxReplans: maxReplans ?? budget.replans ?? 0,
    maxRepairs: maxRepairs ?? budget.repairs ?? 0,
    maxSameActionRetries: maxSameActionRetries ?? budget.sameActionRetries ?? 0,
  }
  let current = dag
  let step = 0
  let replanCount = 0
  let repairCount = 0
  let sameActionCount = 0
  let tokenUsage = 0
  let cost = 0
  let toolCalls = 0
  const actions = []
  const failureHistory = new Map()
  const startTime = Date.now()

  const statusFromBudget = () => {
    if (b.maxWallClockMs > 0 && Date.now() - startTime >= b.maxWallClockMs) return 'max_wall_clock'
    if (step >= b.maxSteps) return 'max_steps'
    if (b.maxTokens > 0 && tokenUsage >= b.maxTokens) return 'max_tokens'
    if (b.maxCost > 0 && cost >= b.maxCost) return 'max_cost'
    if (b.maxToolCalls > 0 && toolCalls >= b.maxToolCalls) return 'max_tool_calls'
    if (b.maxReplans > 0 && replanCount >= b.maxReplans) return 'max_replans'
    if (b.maxRepairs > 0 && repairCount >= b.maxRepairs) return 'max_repairs'
    if (b.maxSameActionRetries > 0 && sameActionCount >= b.maxSameActionRetries) return 'max_same_action_retries'
    return null
  }

  while (step < b.maxSteps) {
    const budgetStatus = statusFromBudget()
    if (budgetStatus) return { dag: current, status: budgetStatus, actions }

    const ready = getReadyTasks(current)
    if (ready.length === 0) break
    const batch = selectReadyBatch(ready, b.maxParallel)
    const results = await Promise.all(batch.map(async (task) => {
      const action = { taskId: task.id, task, phase: task.id }
      const result = await act(action, current)
      const observation = await observe(result, current, action)
      return { task, result, observation }
    }))

    for (const { task, result, observation } of results) {
      tokenUsage += Number(result?.tokenUsage || 0)
      cost += Number(result?.cost || 0)
      toolCalls += Number(result?.toolCalls || 0)
      const isFailure = observation?.type === 'test_failure' || observation?.type === 'build_failure' || observation?.type === 'strategy_shift'
      if (isFailure) {
        replanCount += 1
        repairCount += 1
        sameActionCount = sameActionCount + 1
        const logicalKey = task.logicalId || task.id
        const history = failureHistory.get(logicalKey) || []
        history.push({ category: observation.type, reason: observation.reason, hypothesis: observation.hypothesis })
        failureHistory.set(logicalKey, history)
        let appliedObservation = { ...observation, taskId: task.id }
        if (shouldShiftStrategy(history)) {
          appliedObservation = { type: 'strategy_shift', reason: nextStrategy(history), taskId: task.id }
          failureHistory.delete(logicalKey)
        }
        current = applyObservationToDag(current, appliedObservation, task.id)
      } else {
        sameActionCount = 0
        current = markTaskDone(current, task.id, observation)
      }
      actions.push({ taskId: task.id, observation })
    }
    step += 1
    if (typeof onProgress === 'function') {
      try {
        await onProgress({
          dag: current,
          step,
          actions,
          metrics: { step, replanCount, repairCount, sameActionCount, tokenUsage, cost, toolCalls },
        })
      } catch {
        // Progress callbacks are best-effort; they must never abort the mission.
      }
    }
  }

  const done = isMissionDagComplete(current)
  const budgetStatus = statusFromBudget()
  return {
    dag: current,
    status: budgetStatus || (done ? 'completed' : step >= b.maxSteps ? 'max_steps' : 'blocked'),
    actions,
    metrics: { step, replanCount, repairCount, sameActionCount, tokenUsage, cost, toolCalls },
  }
}