/**
 * TaskDecision: the single unified decision object consumed by the runtime.
 *
 * Fixes the P0 issue where LLM classification and Policy Engine could diverge
 * by re-classifying the same task. Once built, all layers consume this object.
 */

export function createTaskDecision({ taskText = '', taskType = 'other', complexity = 'direct', risk = 'low', thinkingMode = 'balanced' } = {}) {
  const coding = ['bugfix', 'feature', 'refactor', 'test'].includes(taskType)
  const highRisk = ['high', 'critical'].includes(risk)
  const executionMode = complexity === 'plan' || highRisk ? 'plan' : 'direct'
  return {
    taskText,
    type: taskType,
    complexity,
    risk,
    uncertainty: complexity === 'balanced' ? 0.5 : complexity === 'plan' ? 0.3 : 0.1,
    reasoningEffort: highRisk ? 'max' : complexity === 'plan' ? 'high' : 'balanced',
    executionMode,
    verificationLevel: coding ? (highRisk ? 'full' : 'standard') : 'light',
    contextBudget: complexity === 'plan' ? (highRisk ? 150000 : 100000) : complexity === 'balanced' ? 60000 : 20000,
    evidenceRequirements: coding
      ? ['command output', 'test results', 'diff summary', 'review findings']
      : [],
    thinkingMode,
  }
}

export function buildPolicyFromTaskDecision(decision = {}) {
  const highRisk = ['high', 'critical'].includes(decision.risk)
  const coding = ['bugfix', 'feature', 'refactor', 'test'].includes(decision.type)
  return {
    taskType: decision.type || 'other',
    complexity: decision.complexity || 'direct',
    risk: decision.risk || 'low',
    reasoningMode: highRisk ? 'max' : decision.complexity === 'plan' ? 'max' : 'balanced',
    contextStrategy: 'dependency-aware',
    executionMode: decision.executionMode || (highRisk ? 'plan' : 'direct'),
    approvalRequired: (decision.executionMode === 'plan') || highRisk,
    confidence: 1 - (decision.uncertainty || 0),
    verification: coding ? ['unit', 'integration', 'regression'] : [],
    gitPolicy: {
      requireBranch: coding,
    },
  }
}