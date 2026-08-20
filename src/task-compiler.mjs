/**
 * Task Compiler: turn a user request into a structured engineering brief.
 *
 * Goes beyond task-type classification: objective, constraints, non-goals,
 * acceptance criteria, hidden assumptions, ambiguities, required invariants,
 * risk, and expected artifacts.
 */

export function compileTask(taskText, options = {}) {
  const text = String(taskText || '').trim()
  const taskType = options.taskType || inferTaskType(text)
  const objective = inferObjective(text, taskType)
  const constraints = inferConstraints(text)
  const nonGoals = inferNonGoals(text)
  const acceptance = inferAcceptance(text, taskType)
  const hiddenAssumptions = inferHiddenAssumptions(text, taskType)
  const ambiguities = inferAmbiguities(text)
  const requiredInvariants = inferInvariants(text, taskType)
  const risk = options.risk || inferRisk(text)
  const expectedArtifacts = inferArtifacts(text, taskType)

  return {
    taskText: text,
    taskType,
    objective,
    constraints,
    nonGoals,
    acceptanceCriteria: acceptance,
    hiddenAssumptions,
    ambiguities,
    requiredInvariants,
    risk,
    expectedArtifacts,
    confidence: 0.7,
  }
}

function inferTaskType(text) {
  if (/(bug|fix|修复|报错|错误|崩溃|500)/i.test(text)) return 'bugfix'
  if (/(feature|新增|新做|做一个|实现|增加|开发)/i.test(text)) return 'feature'
  if (/(refactor|重构|优化|重构|简化)/i.test(text)) return 'refactor'
  if (/(test|测试|单测|coverage)/i.test(text)) return 'test'
  if (/(review|审查|评审)/i.test(text)) return 'review'
  return 'other'
}

function inferObjective(text, taskType) {
  if (taskType === 'bugfix') return `Fix the reported issue: ${text}`
  if (taskType === 'feature') return `Implement the requested feature: ${text}`
  if (taskType === 'refactor') return `Refactor while preserving behavior: ${text}`
  return `Complete the task: ${text}`
}

function inferConstraints(text) {
  const constraints = []
  if (/(不要破坏|不能影响|保持|preserve|do not break|without breaking)/i.test(text)) constraints.push('preserve existing behavior')
  if (/(不要新增依赖|no new deps|no new dependencies)/i.test(text)) constraints.push('no new dependencies')
  if (/(不要改|don't touch|do not touch|别动)/i.test(text)) constraints.push('avoid specified files/areas')
  if (/(兼容|compat|backward)/i.test(text)) constraints.push('backward compatibility')
  return constraints
}

function inferNonGoals(text) {
  const nonGoals = []
  if (/(只|just|only|不要做|don't)/i.test(text)) nonGoals.push('do not expand scope beyond the request')
  nonGoals.push('no gold-plating / speculative abstractions')
  return nonGoals
}

function inferAcceptance(text, taskType) {
  const base = []
  if (taskType === 'bugfix') base.push('bug is reproduced and fixed', 'regression test passes', 'no new regressions')
  else if (taskType === 'feature') base.push('feature exists', 'relevant tests pass', 'no regressions')
  else if (taskType === 'refactor') base.push('observable behavior preserved', 'existing tests pass', 'no public API change')
  else base.push('task completed', 'no obvious regressions')
  if (/(测试|test|验证|verify)/i.test(text)) base.push('verification evidence is reported')
  return base
}

function inferHiddenAssumptions(text, taskType) {
  const assumptions = []
  if (taskType === 'bugfix') assumptions.push('the reported failure is reproducible in the current environment')
  if (taskType === 'feature') assumptions.push('the feature follows existing project conventions')
  if (/(数据库|db|schema|migration)/i.test(text)) assumptions.push('a rollback path exists for schema changes')
  return assumptions
}

function inferAmbiguities(text) {
  const ambiguities = []
  if (/(等|etc|之类的|相关|relevant|some)/i.test(text)) ambiguities.push('scope of listed items is not fully enumerated')
  if (/(大概|可能|maybe|perhaps|似乎)/i.test(text)) ambiguities.push('requirement contains uncertainty markers')
  if (/(或|或者|还是|or)/i.test(text)) ambiguities.push('multiple options are mentioned without a decision')
  return ambiguities
}

function inferInvariants(text, taskType) {
  const invariants = []
  if (taskType === 'bugfix' || taskType === 'refactor') invariants.push('existing passing tests must continue to pass')
  if (/(支付|payment|订单|order|金额|money|退款|refund)/i.test(text)) invariants.push('money/order consistency must be preserved')
  if (/(登录|auth|session|token|权限)/i.test(text)) invariants.push('authentication/authorization semantics must be preserved')
  return invariants
}

function inferRisk(text) {
  if (/(生产|prod|生产环境|密钥|secret|删除|drop|migration|支付|payment|退款|auth|权限)/i.test(text)) return 'high'
  if (/(数据库|db|api|接口|订单|order)/i.test(text)) return 'medium'
  return 'low'
}

function inferArtifacts(text, taskType) {
  if (taskType === 'bugfix') return ['code fix', 'regression test', 'verification evidence']
  if (taskType === 'feature') return ['implementation', 'tests', 'usage/docs update if needed']
  if (taskType === 'refactor') return ['refactored code', 'test results', 'diff summary']
  return ['deliverable', 'verification evidence']
}
