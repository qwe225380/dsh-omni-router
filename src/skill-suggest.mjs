/**
 * Skill Suggestions: map Omni task types to existing DSH skills.
 *
 * Omni should not re-implement capabilities that a powerful skill already
 * provides. This module produces a short list of skill names for the system
 * prompt; the model loads them through the standard `skill` tool when they are
 * actually available in the session.
 */

const SKILL_MAP = {
  bugfix: ['systematic-debugging', 'verification-loop', 'red-green-tdd'],
  feature: ['task-planning', 'implementation-standards', 'test-driven-development', 'verification-loop'],
  refactor: ['safe-refactoring', 'implementation-standards', 'verification-loop'],
  test: ['test-driven-development', 'verification-loop'],
  review: ['code-review', 'verification-and-review', 'security-review'],
  other: ['problem-framing', 'task-planning'],
}

export function suggestSkillsForTask(taskType, taskText = '') {
  const base = SKILL_MAP[taskType] || SKILL_MAP.other
  const text = String(taskText || '')
  const extra = []
  if (/(安全|auth|登录|权限|security|token|password|密钥)/i.test(text)) extra.push('security-review')
  if (/(性能|慢|优化|performance|latency|吞吐|并发)/i.test(text)) extra.push('performance-optimization')
  if (/(数据库|db|schema|sql|migration|迁移)/i.test(text)) extra.push('dependency-changes')
  if (/(遗留|legacy|旧代码|没文档|undocumented)/i.test(text)) extra.push('legacy-debugging')
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