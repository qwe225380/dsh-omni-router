/**
 * Evidence Protocol: structured evidence for verifier/judge decisions.
 *
 * Moves away from trusting prose like "QA: PASS" toward machine-checkable
 * evidence records: commands with exit codes, file diffs, test counts, and
 * reviewer findings.
 */

export function createEvidence() {
  return {
    commands: [],
    files: [],
    tests: [],
    findings: [],
  }
}

export function addCommandEvidence(evidence, { command, exitCode, output = '', durationMs = 0 }) {
  return {
    ...evidence,
    commands: [
      ...evidence.commands,
      { command, exitCode, output, durationMs, at: new Date().toISOString() },
    ],
  }
}

export function addFileEvidence(evidence, { file, lines, beforeHash, afterHash, diffHash }) {
  return {
    ...evidence,
    files: [
      ...evidence.files,
      { file, lines, beforeHash, afterHash, diffHash, at: new Date().toISOString() },
    ],
  }
}

export function addTestEvidence(evidence, { command, exitCode, total, passed, failed, durationMs = 0 }) {
  return {
    ...evidence,
    tests: [
      ...evidence.tests,
      { command, exitCode, total, passed, failed, durationMs, at: new Date().toISOString() },
    ],
  }
}

export function addFindingEvidence(evidence, { finding, severity, file, line, evidence: detail = '' }) {
  return {
    ...evidence,
    findings: [
      ...evidence.findings,
      { finding, severity, file, line, evidence: detail, at: new Date().toISOString() },
    ],
  }
}

export function evidencePass(evidence = {}) {
  const commands = evidence.commands || []
  const tests = evidence.tests || []
  const findings = evidence.findings || []

  const failedCommand = commands.find((c) => c.exitCode !== 0)
  const failedTest = tests.find((t) => t.exitCode !== 0 || t.failed > 0)
  const criticalFinding = findings.find((f) => /critical|high/i.test(f.severity || ''))

  if (criticalFinding) return false
  if (failedCommand || failedTest) return false
  if (tests.length === 0 && commands.length === 0) return false
  return true
}

export function summarizeEvidence(evidence = {}) {
  const lines = []
  if (evidence.commands?.length) {
    lines.push(`Commands (${evidence.commands.length}):`)
    for (const c of evidence.commands) lines.push(`- ${c.command} exit=${c.exitCode}`)
  }
  if (evidence.tests?.length) {
    lines.push(`Tests (${evidence.tests.length}):`)
    for (const t of evidence.tests) lines.push(`- ${t.command} ${t.passed}/${t.total} passed`)
  }
  if (evidence.files?.length) {
    lines.push(`Files (${evidence.files.length}):`)
    for (const f of evidence.files) lines.push(`- ${f.file}`)
  }
  if (evidence.findings?.length) {
    lines.push(`Findings (${evidence.findings.length}):`)
    for (const f of evidence.findings) lines.push(`- [${f.severity}] ${f.finding} @ ${f.file}:${f.line}`)
  }
  return lines.join('\n')
}
