/**
 * Mission Planner v1: turn a task into a Mission → Phase → Task skeleton.
 *
 * This is an orchestration layer, not a detailed planning skill. Detailed
 * planning procedure is delegated to writing-plans.
 */

export function missionPhasesForType(taskType = 'other') {
  const base = [
    { id: 'understand', name: 'Understand', goal: 'Inspect repository, read relevant code, and confirm requirements.' },
    { id: 'design', name: 'Design', goal: 'Decide interfaces, data flow, risks, and produce a concrete plan.' },
    { id: 'implement', name: 'Implement', goal: 'Build in dependency order and verify each unit.' },
    { id: 'validate', name: 'Validate', goal: 'Run tests/build/lint, probe edge cases, and review the diff.' },
    { id: 'deliver', name: 'Deliver', goal: 'Report evidence, assumptions, and limitations.' },
  ]

  if (taskType === 'bugfix') {
    return [
      { id: 'understand', name: 'Understand', goal: 'Reproduce the failure and read the relevant code path.' },
      { id: 'diagnose', name: 'Diagnose', goal: 'Find the root cause with a falsifiable hypothesis and evidence.' },
      { id: 'fix', name: 'Fix', goal: 'Apply the smallest patch and add a regression test.' },
      { id: 'verify', name: 'Verify', goal: 'Run the relevant suite and probe edge cases.' },
      { id: 'deliver', name: 'Deliver', goal: 'Report the root cause, fix, and verification evidence.' },
    ]
  }

  if (taskType === 'refactor') {
    return [
      { id: 'understand', name: 'Understand', goal: 'Map affected modules, call sites, and existing test coverage.' },
      { id: 'baseline', name: 'Baseline', goal: 'Establish a test safety net before changing behavior.' },
      { id: 'refactor', name: 'Refactor', goal: 'Apply small behavior-preserving transformations and verify after each.' },
      { id: 'validate', name: 'Validate', goal: 'Run the full relevant suite and review the diff.' },
      { id: 'deliver', name: 'Deliver', goal: 'Report preserved behavior and verification evidence.' },
    ]
  }

  return base
}

export function buildMission(taskText, options = {}) {
  const taskType = options.taskType || 'other'
  const phases = missionPhasesForType(taskType)
  return {
    mission: String(taskText || '').trim(),
    taskType,
    phases,
    replanCount: 0,
  }
}

export function buildPhaseTasks(phaseId, taskType = 'other') {
  const tasks = {
    understand: ['Inspect repository structure', 'Read relevant files/symbols', 'Confirm requirements and constraints'],
    design: ['Decide interfaces/data flow', 'Identify risks and reversibility', 'Write a concrete plan'],
    implement: ['Build in dependency order', 'Verify each unit', 'Keep changes scoped'],
    validate: ['Run tests/build/lint', 'Probe edge cases', 'Review diff cold'],
    deliver: ['Summarize outcome', 'Report evidence and assumptions', 'List limitations/next steps'],
    diagnose: ['Reproduce the failure', 'Read the failing path', 'Form a falsifiable hypothesis'],
    fix: ['Apply the smallest patch', 'Add a regression test', 'Do not weaken tests'],
    verify: ['Run relevant tests', 'Probe edge cases', 'Confirm no regressions'],
    baseline: ['Identify test gaps', 'Add missing safety-net tests', 'Confirm current behavior'],
    refactor: ['Apply one transformation', 'Verify after each step', 'Keep public API stable'],
  }
  return tasks[phaseId] || ['Define concrete steps', 'Add verification for each step']
}

export function decideReplan(state = {}, observation = {}) {
  const type = observation.type || ''
  const current = state.phase || 'understand'
  if (type === 'build_failure' || type === 'test_failure') {
    return {
      replan: true,
      reason: 'verification failed; move to repair/validate before continuing',
      nextPhase: 'repair',
    }
  }
  if (type === 'missing_dependency' || type === 'unexpected_file') {
    return {
      replan: true,
      reason: 'new information discovered; update the current phase',
      nextPhase: current,
    }
  }
  if (type === 'scope_change') {
    return {
      replan: true,
      reason: 'requirements changed; re-plan from design',
      nextPhase: 'design',
    }
  }
  return { replan: false, reason: '', nextPhase: null }
}

export function formatMissionPlan(mission) {
  const lines = [`Mission: ${mission.mission || '(untitled)'}`, `Task type: ${mission.taskType || 'other'}`, 'Phases:']
  for (const phase of mission.phases || []) {
    lines.push(`- ${phase.id}: ${phase.name} — ${phase.goal}`)
    for (const task of buildPhaseTasks(phase.id, mission.taskType)) {
      lines.push(`  * ${task}`)
    }
  }
  if (mission.replanCount > 0) lines.push(`Replans: ${mission.replanCount}`)
  return lines.join('\n')
}