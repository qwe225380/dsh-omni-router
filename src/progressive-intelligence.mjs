/**
 * Progressive Intelligence.
 *
 * Omni should be invisible for simple tasks and gradually unfold for hard
 * ones. This module maps a TaskDecision to one of four run levels:
 *
 *   L0 Direct       — raw DSH + light verification
 *   L1 Assisted     — context + skill + test
 *   L2 Orchestrated — plan + DAG + subagents + evidence
 *   L3 Guarded      — deep plan + approval + independent verify + rollback
 */

export const INTELLIGENCE_LEVELS = ['L0', 'L1', 'L2', 'L3']

export function decideIntelligenceLevel(decision = {}) {
  const complexity = decision.complexity || 'direct'
  const risk = decision.risk || 'low'
  const taskType = decision.type || decision.taskType || 'other'

  if (risk === 'high' || risk === 'critical') {
    return {
      level: 'L3',
      label: 'Guarded',
      useDag: true,
      useSubagents: true,
      approvalRequired: true,
      verification: 'full',
      independentVerify: true,
      reasoningEffort: 'max',
      contextMaxFiles: 20,
      maxTaskAdditions: 1,
      description: 'High-risk task: deep plan, approval, independent verify, rollback.',
    }
  }

  if (complexity === 'plan' || (['feature', 'refactor'].includes(taskType) && complexity !== 'direct')) {
    return {
      level: 'L2',
      label: 'Orchestrated',
      useDag: true,
      useSubagents: true,
      approvalRequired: false,
      verification: 'full',
      independentVerify: false,
      reasoningEffort: 'high',
      contextMaxFiles: 12,
      maxTaskAdditions: 1,
      description: 'Multi-file or complex task: DAG + subagents + evidence.',
    }
  }

  if (complexity === 'balanced' || ['bugfix', 'test'].includes(taskType)) {
    return {
      level: 'L1',
      label: 'Assisted',
      useDag: false,
      useSubagents: false,
      approvalRequired: false,
      verification: 'standard',
      independentVerify: false,
      reasoningEffort: 'balanced',
      contextMaxFiles: 6,
      maxTaskAdditions: 0,
      description: 'Normal task: focused context + skills + tests.',
    }
  }

  return {
    level: 'L0',
    label: 'Direct',
    useDag: false,
    useSubagents: false,
    approvalRequired: false,
    verification: 'light',
    independentVerify: false,
    reasoningEffort: 'balanced',
    contextMaxFiles: 3,
    maxTaskAdditions: 0,
    description: 'Simple task: raw DSH + light verification.',
  }
}

export function formatIntelligenceLevel(level = {}) {
  return `${level.level} ${level.label} — ${level.description}`
}