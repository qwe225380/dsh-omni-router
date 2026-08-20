/**
 * Verifier / Judge / Repair helpers.
 *
 * Adds a final Judge stage to the agent chain and a bounded repair budget.
 * Detailed verification procedures are delegated to verification skills.
 */

export const GRADING_DIMENSIONS = [
  'correctness',
  'completeness',
  'robustness',
  'clarity',
  'scope',
  'honesty',
]

export function buildJudgePrompt(taskText, options = {}) {
  return `You are the independent judge in a software-engineering chain. Decide whether the delivered work is ready, based ONLY on the evidence below.

Task:
${taskText}

Acceptance criteria:
${formatCriteria(options.criteria)}

Builder report:
${options.builderOutput || '(none)'}

QA report:
${options.qaReport || '(none)'}

Review report:
${options.reviewReport || '(none)'}

Grade these dimensions independently (0-1): correctness, completeness, robustness, clarity, scope, honesty.
Overall grade = the LOWEST dimension. Honesty below bar is an automatic fail.
If overall is below 0.8 or any critical/high review finding remains, return "JUDGE: FAIL".
Otherwise return "JUDGE: PASS".

Return a short report: dimension scores, overall, and the single most important remaining risk (or "none").`
}

function formatCriteria(criteria) {
  const list = Array.isArray(criteria) ? criteria.filter(Boolean) : []
  if (!list.length) return '- task is implemented as requested\n- relevant tests pass\n- no regressions or out-of-scope changes'
  return list.map((c) => `- ${c}`).join('\n')
}

export function isJudgePass(output) {
  const text = String(output || '')
  return /JUDGE:\s*PASS/i.test(text) && !/JUDGE:\s*FAIL/i.test(text)
}

export function buildRepairBudget(maxAttempts = 2, options = {}) {
  const attempts = Math.max(1, Math.min(5, Number(maxAttempts) || 2))
  return {
    maxAttempts: attempts,
    escalationAfter: options.escalationAfter ?? Math.max(1, Math.floor(attempts / 2)),
    stopAfter: attempts,
  }
}

export function scoreDelivery({ qaPass = false, reviewPass = false, judgePass = false, hasCriticalFindings = false } = {}) {
  const dimensions = {
    correctness: qaPass ? 1 : 0.4,
    completeness: qaPass ? 0.9 : 0.5,
    robustness: qaPass ? 0.85 : 0.4,
    clarity: reviewPass ? 0.9 : 0.6,
    scope: hasCriticalFindings ? 0.3 : 0.9,
    honesty: qaPass ? 0.95 : 0.6,
  }
  const overall = Math.min(...Object.values(dimensions))
  return {
    dimensions,
    overall,
    verdict: judgePass ? 'pass' : overall >= 0.8 ? 'pass' : 'rework',
  }
}
