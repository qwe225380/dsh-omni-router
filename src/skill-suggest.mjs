/**
 * Skill Suggestions: map Omni task types to existing DSH skills.
 *
 * Omni should not re-implement capabilities that a powerful skill already
 * provides. This module produces a short list of skill names for the system
 * prompt; the model loads them through the standard `skill` tool when they are
 * actually available in the session.
 */

const SKILL_MAP = {
  bugfix: ['systematic-debugging', 'fable5-debugging-methodology', 'verification-loop', 'fable5-verification-loop', 'red-green-tdd', 'fable5-task-planning'],
  feature: ['task-planning', 'fable5-task-planning', 'implementation-standards', 'fable5-implementation-standards', 'test-driven-development', 'verification-loop', 'fable5-incremental-delivery'],
  refactor: ['safe-refactoring', 'fable5-safe-refactoring', 'implementation-standards', 'fable5-implementation-standards', 'verification-loop', 'fable5-verification-loop'],
  test: ['test-driven-development', 'verification-loop', 'fable5-verification-loop'],
  review: ['code-review', 'fable5-code-review', 'verification-and-review', 'fable5-verification-and-review', 'security-review', 'fable5-security-review'],
  other: ['problem-framing', 'fable5-problem-framing', 'task-planning', 'fable5-task-planning'],
}

export function suggestSkillsForTask(taskType, taskText = '') {
  const base = SKILL_MAP[taskType] || SKILL_MAP.other
  const text = String(taskText || '')
  const extra = []
  if (/(安全|auth|登录|权限|security|token|password|密钥)/i.test(text)) extra.push('security-review', 'fable5-security-review')
  if (/(性能|慢|优化|performance|latency|吞吐|并发)/i.test(text)) extra.push('performance-optimization', 'fable5-performance-optimization')
  if (/(数据库|db|schema|sql|migration|迁移)/i.test(text)) extra.push('dependency-changes', 'fable5-dependency-changes')
  if (/(遗留|legacy|旧代码|没文档|undocumented)/i.test(text)) extra.push('legacy-debugging', 'fable5-legacy-debugging')
  return [...new Set([...base, ...extra])]
}

export function filterAvailableSkills(candidates, availableNames) {
  const names = new Set((Array.isArray(availableNames) ? availableNames : [])
    .map((entry) => typeof entry === 'string' ? entry : entry?.name)
    .filter(Boolean))
  return (Array.isArray(candidates) ? candidates : []).filter((name) => names.has(name))
}

export function buildSkillSuggestionText(candidates) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(Boolean)
  if (!list.length) return ''
  return `Relevant skills (load via skill tool when available): ${list.join(', ')}`
}
