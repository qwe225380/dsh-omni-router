import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSkillSuggestionText,
  filterAvailableSkills,
  suggestSkillsForTask,
} from '../src/skill-suggest.mjs'

test('suggestSkillsForTask maps coding task types to relevant skills', () => {
  assert.ok(suggestSkillsForTask('bugfix').includes('systematic-debugging'))
  assert.ok(suggestSkillsForTask('feature').includes('task-planning'))
  assert.ok(suggestSkillsForTask('refactor').includes('safe-refactoring'))
  assert.ok(suggestSkillsForTask('test').includes('test-driven-development'))
  assert.ok(suggestSkillsForTask('review').includes('code-review'))
})

test('suggestSkillsForTask falls back to other for unknown types', () => {
  const skills = suggestSkillsForTask('unknown')
  assert.ok(skills.includes('problem-framing'))
  assert.ok(skills.includes('task-planning'))
})

test('suggestSkillsForTask adds text-based specialist skills', () => {
  const security = suggestSkillsForTask('feature', '新增登录权限校验')
  assert.ok(security.includes('security-review'))
  const perf = suggestSkillsForTask('bugfix', '接口很慢，优化性能')
  assert.ok(perf.includes('performance-optimization'))
  const db = suggestSkillsForTask('feature', '加一个数据库迁移')
  assert.ok(db.includes('dependency-changes'))
})

test('filterAvailableSkills keeps only skills present in the session', () => {
  const candidates = ['task-planning', 'security-review', 'missing-skill']
  const available = [{ name: 'task-planning' }, 'security-review']
  assert.deepEqual(filterAvailableSkills(candidates, available), ['task-planning', 'security-review'])
})

test('buildSkillSuggestionText renders one line or empty', () => {
  const text = buildSkillSuggestionText(['task-planning', 'verification-loop'])
  assert.equal(text, 'Relevant skills (load via skill tool when available): task-planning, verification-loop')
  assert.equal(buildSkillSuggestionText([]), '')
})
