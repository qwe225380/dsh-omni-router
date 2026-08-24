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

/**
 * Extract machine-checkable evidence from a subagent/tool result.
 *
 * Accepts either a structured `result.evidence` object, top-level arrays on the
 * result (`commands`, `tests`, `files`, `findings`), tool-call records, or an
 * embedded `EVIDENCE_JSON` block in the result text. This lets the runtime
 * prefer Harness-captured facts over agent prose whenever the Harness provides
 * them.
 */
export function extractHarnessEvidence(result = {}) {
  let evidence = createEvidence()
  const source = (result && typeof result === 'object' && result.evidence) || result || {}

  const apply = (key, fn) => {
    for (const item of Array.isArray(source[key]) ? source[key] : []) {
      try {
        evidence = fn(evidence, item)
      } catch {
        // Skip malformed evidence entries; never fail the mission.
      }
    }
  }

  apply('commands', addCommandEvidence)
  apply('tests', addTestEvidence)
  apply('files', addFileEvidence)
  apply('findings', addFindingEvidence)

  if (Array.isArray(result?.toolCalls)) {
    for (const call of result.toolCalls) {
      try {
        if (call?.command || call?.name) {
          evidence = addCommandEvidence(evidence, {
            command: call.command || call.name,
            exitCode: call.exitCode ?? (call.ok === false ? 1 : 0),
            output: call.output || call.stdout || '',
            durationMs: call.durationMs || 0,
          })
        }
      } catch {
        // Ignore malformed tool-call evidence.
      }
    }
  }

  const embedded = parseEmbeddedEvidence(result?.output || result?.text || '')
  if (embedded) {
    for (const item of embedded.commands || []) {
      try { evidence = addCommandEvidence(evidence, item) } catch { /* ignore */ }
    }
    for (const item of embedded.tests || []) {
      try { evidence = addTestEvidence(evidence, item) } catch { /* ignore */ }
    }
    for (const item of embedded.files || []) {
      try { evidence = addFileEvidence(evidence, item) } catch { /* ignore */ }
    }
    for (const item of embedded.findings || []) {
      try { evidence = addFindingEvidence(evidence, item) } catch { /* ignore */ }
    }
  }

  return evidence
}

function parseEmbeddedEvidence(text) {
  const source = String(text || '')
  const markers = ['EVIDENCE_JSON', 'EVIDENCE:']
  for (const marker of markers) {
    const start = source.indexOf(marker)
    if (start === -1) continue
    const jsonStart = source.indexOf('{', start)
    if (jsonStart === -1) continue
    const jsonEnd = source.lastIndexOf('}')
    if (jsonEnd === -1 || jsonEnd <= jsonStart) continue
    try {
      const parsed = JSON.parse(source.slice(jsonStart, jsonEnd + 1))
      if (parsed && (Array.isArray(parsed.commands) || Array.isArray(parsed.tests) || Array.isArray(parsed.files) || Array.isArray(parsed.findings))) {
        return parsed
      }
    } catch {
      // Not valid JSON; fall through to prose-based heuristics.
    }
  }
  return null
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