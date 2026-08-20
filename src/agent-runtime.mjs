/**
 * Agent Runtime: Observe → Think → Act → Replan loop.
 *
 * Drives a Mission Planner mission through phases with a bounded loop. The
 * actual action execution is provided by the caller (e.g. subagents or tools).
 */

import { buildPhaseTasks, decideReplan } from './mission-planner.mjs'

export function createRuntimeState(mission) {
  const phases = mission?.phases || []
  return {
    mission,
    phaseIndex: 0,
    phase: phases[0]?.id || null,
    step: 0,
    status: 'active',
    replanCount: 0,
    observations: [],
    actions: [],
  }
}

export function nextRuntimeAction(state) {
  const phase = state.phase
  const tasks = buildPhaseTasks(phase, state.mission?.taskType)
  const task = tasks[Math.min(state.step, tasks.length - 1)] || 'Continue current phase'
  return { phase, task, index: state.step }
}

export function applyObservation(state, observation = {}) {
  const replan = decideReplan({ phase: state.phase }, observation)
  if (replan.replan) {
    return {
      ...state,
      status: 'active',
      replanCount: state.replanCount + 1,
      observations: [...state.observations, { type: observation.type || 'unknown', reason: replan.reason }],
    }
  }

  const phases = state.mission?.phases || []
  const tasks = buildPhaseTasks(state.phase, state.mission?.taskType)
  const nextStep = state.step + 1
  if (nextStep < tasks.length) {
    return { ...state, step: nextStep, observations: [...state.observations, { type: observation.type || 'step_done' }] }
  }

  const nextPhaseIndex = state.phaseIndex + 1
  if (nextPhaseIndex >= phases.length) {
    return { ...state, status: 'completed', observations: [...state.observations, { type: 'mission_complete' }] }
  }

  return {
    ...state,
    phaseIndex: nextPhaseIndex,
    phase: phases[nextPhaseIndex].id,
    step: 0,
    observations: [...state.observations, { type: 'phase_complete', phase: state.phase }],
  }
}

export async function runMissionLoop(state, { act, observe, maxSteps = 50 } = {}) {
  let current = state
  while (current.status === 'active' && current.step < maxSteps) {
    const action = nextRuntimeAction(current)
    const result = await act(action, current)
    const observation = await observe(result, current)
    current = applyObservation(current, observation)
    current = { ...current, actions: [...current.actions, { action, observation }] }
  }
  return current
}
