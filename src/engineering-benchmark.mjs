/**
 * Omni Engineering Benchmark (v1).
 *
 * Converts engineering run metrics into an Omni Engineering Score (OES) and
 * summarizes a batch of task results. This is an evaluation framework, not a
 * replacement for routing benchmarks.
 */

export const ENGINEERING_LEVELS = [
  'L1 Single-file',
  'L2 Small bug',
  'L3 Small feature',
  'L4 Multi-file feature',
  'L5 Refactor',
  'L6 Cross-service',
  'L7 Migration',
  'L8 Debugging',
  'L9 Long-horizon',
  'L10 Autonomous',
]

const OES_WEIGHTS = {
  correctness: 0.3,
  requirement: 0.2,
  regression: 0.15,
  verification: 0.1,
  architecture: 0.1,
  maintainability: 0.05,
  efficiency: 0.05,
  honesty: 0.05,
}

export function computeOes(metrics = {}) {
  const success = Number(metrics.success ?? 0)
  const firstPass = Number(metrics.firstPass ?? success)
  const finalPass = Number(metrics.finalPass ?? success)
  const regressionRate = Number(metrics.regressionRate ?? 0)
  const humanInterventions = Number(metrics.humanInterventions ?? 0)
  const toolCalls = Number(metrics.toolCalls ?? 0)
  const repairCount = Number(metrics.repairCount ?? 0)
  const failureRecoveryRate = Number(metrics.failureRecoveryRate ?? 0)
  const falseCompletionRate = Number(metrics.falseCompletionRate ?? 0)

  const correctness = success
  const requirement = 0.5 * firstPass + 0.5 * finalPass
  const regression = Math.max(0, 1 - regressionRate)
  const verification = Math.min(1, (failureRecoveryRate + (repairCount > 0 ? 0.5 : 1)) / 2)
  const architecture = Math.max(0, 1 - Math.min(1, humanInterventions / 10))
  const maintainability = Math.max(0, 1 - Math.min(1, toolCalls / 200))
  const efficiency = Math.max(0, 1 - Math.min(1, toolCalls / 300))
  const honesty = Math.max(0, 1 - falseCompletionRate)

  const components = { correctness, requirement, regression, verification, architecture, maintainability, efficiency, honesty }
  const score = Object.entries(OES_WEIGHTS).reduce((sum, [key, weight]) => sum + (components[key] || 0) * weight, 0)
  return {
    score: Math.round(score * 1000) / 1000,
    components,
    weights: OES_WEIGHTS,
  }
}

export function scoreTask(result = {}) {
  const oes = computeOes(result)
  return {
    id: result.id || 'unknown',
    level: result.level || 'L1 Single-file',
    task: result.task || '',
    success: Boolean(result.success),
    oes,
  }
}

export function summarizeBenchmark(results = []) {
  const tasks = results.map(scoreTask)
  const successful = tasks.filter((t) => t.success)
  const avgScore = tasks.length ? tasks.reduce((sum, t) => sum + t.oes.score, 0) / tasks.length : 0
  const lines = [
    `Omni Engineering Benchmark`,
    `Tasks: ${tasks.length}`,
    `Success rate: ${tasks.length ? Math.round((successful.length / tasks.length) * 1000) / 10 : 0}%`,
    `Average OES: ${Math.round(avgScore * 1000) / 1000}`,
    '',
  ]
  for (const task of tasks) {
    lines.push(`- [${task.success ? 'PASS' : 'FAIL'}] ${task.id} (${task.level}) OES=${task.oes.score}`)
  }
  return lines.join('\n')
}