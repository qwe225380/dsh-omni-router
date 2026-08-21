/**
 * Memory v3: skill distillation, execution policies, historical failures,
 * and cross-session strategy learning.
 *
 * This builds on Memory v1/v2 with a more rigorous learned-skill lifecycle:
 * require repeated successful trajectories before promoting a recipe to a
 * skill, track success/failure counts and confidence, and keep execution
 * policies / historical failures retrievable across sessions.
 */

export function createMemoryV3(base = {}) {
  return {
    ...base,
    learnedSkills: Array.isArray(base.learnedSkills) ? base.learnedSkills : [],
    executionPolicies: Array.isArray(base.executionPolicies) ? base.executionPolicies : [],
    crossSessionStrategies: Array.isArray(base.crossSessionStrategies) ? base.crossSessionStrategies : [],
  }
}

function countOutcomes(trajectories = []) {
  let successCount = 0
  let failureCount = 0
  for (const t of trajectories || []) {
    const text = String(t?.text || t?.outcome || '').toLowerCase()
    if (/success|done|pass|完成|ok/.test(text)) successCount += 1
    else if (/fail|error|blocked|失败|错误/.test(text)) failureCount += 1
  }
  return { successCount, failureCount }
}

export function distillSkill(memory, trajectories = [], options = {}) {
  const minSuccesses = Number(options.minSuccesses) || 3
  const { successCount, failureCount } = countOutcomes(trajectories)
  if (successCount < minSuccesses) return { memory, promoted: false, reason: `need ${minSuccesses} successes, got ${successCount}` }

  const successfulSteps = (trajectories || [])
    .filter((t) => /success|done|pass|完成|ok/i.test(String(t?.text || t?.outcome || '')))
    .map((t) => t?.text || t?.step || '')
    .filter(Boolean)

  const name = options.name || `skill-${Date.now().toString(36)}`
  const existing = (memory.learnedSkills || []).filter((s) => s.name !== name)
  const skill = {
    name,
    taskFingerprint: options.taskFingerprint || '',
    triggers: Array.isArray(options.triggers) ? options.triggers : [],
    preconditions: Array.isArray(options.preconditions) ? options.preconditions : [],
    steps: successfulSteps,
    failureModes: Array.isArray(options.failureModes) ? options.failureModes : [],
    verification: Array.isArray(options.verification) ? options.verification : [],
    successCount,
    failureCount,
    confidence: successCount + failureCount > 0 ? Math.round((successCount / (successCount + failureCount)) * 1000) / 1000 : 0,
    reposSeen: Array.isArray(options.reposSeen) ? options.reposSeen : [],
    lastValidated: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }
  return {
    memory: { ...memory, learnedSkills: [...existing, skill] },
    promoted: true,
    skill,
  }
}

export function recordSkillOutcome(memory, skillName, success) {
  const skills = (memory.learnedSkills || []).map((s) => {
    if (s.name !== skillName) return s
    const successCount = (s.successCount || 0) + (success ? 1 : 0)
    const failureCount = (s.failureCount || 0) + (success ? 0 : 1)
    return {
      ...s,
      successCount,
      failureCount,
      confidence: successCount + failureCount > 0 ? Math.round((successCount / (successCount + failureCount)) * 1000) / 1000 : 0,
      lastValidated: new Date().toISOString(),
    }
  })
  return { ...memory, learnedSkills: skills }
}

export function retrieveHistoricalFailures(memory, taskText = '') {
  const text = String(taskText || '').toLowerCase()
  const failures = memory.failures || []
  if (!text) return failures
  return failures.filter((f) => String(f.text || f.reason || '').toLowerCase().includes(text))
}

export function recordExecutionPolicy(memory, policy = {}) {
  const id = policy.id || `policy-${Date.now().toString(36)}`
  const entry = { ...policy, id, createdAt: new Date().toISOString() }
  return { ...memory, executionPolicies: [...(memory.executionPolicies || []), entry] }
}

export function retrieveExecutionPolicy(memory, taskText = '') {
  const text = String(taskText || '').toLowerCase()
  const policies = memory.executionPolicies || []
  if (!text) return policies
  return policies.filter((p) => {
    const hay = `${p.id || ''} ${p.trigger || ''} ${p.name || ''}`.toLowerCase()
    return hay.includes(text)
  })
}

export function recordCrossSessionStrategy(memory, strategy = {}) {
  const id = strategy.id || `strategy-${Date.now().toString(36)}`
  const entry = { ...strategy, id, createdAt: new Date().toISOString() }
  return { ...memory, crossSessionStrategies: [...(memory.crossSessionStrategies || []), entry] }
}

export function retrieveCrossSessionStrategies(memory) {
  return memory.crossSessionStrategies || []
}
