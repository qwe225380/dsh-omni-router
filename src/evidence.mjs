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

export const TRUST_VALUES = { T0: 0, T1: 1, T2: 2, T3: 3, T4: 4 }

export function addCommandEvidence(evidence, { command, exitCode, output = '', durationMs = 0, source = 'tool', trustLevel = 'T2' }) {
  return {
    ...evidence,
    commands: [
      ...evidence.commands,
      { command, exitCode, output, durationMs, source, trustLevel, trustValue: TRUST_VALUES[trustLevel] ?? 0, at: new Date().toISOString() },
    ],
  }
}

export function addFileEvidence(evidence, { file, lines, beforeHash, afterHash, diffHash, source = 'tool', trustLevel = 'T2' }) {
  return {
    ...evidence,
    files: [
      ...evidence.files,
      { file, lines, beforeHash, afterHash, diffHash, source, trustLevel, trustValue: TRUST_VALUES[trustLevel] ?? 0, at: new Date().toISOString() },
    ],
  }
}

export function addTestEvidence(evidence, { command, exitCode, total, passed, failed, durationMs = 0, source = 'tool', trustLevel = 'T2' }) {
  return {
    ...evidence,
    tests: [
      ...evidence.tests,
      { command, exitCode, total, passed, failed, durationMs, source, trustLevel, trustValue: TRUST_VALUES[trustLevel] ?? 0, at: new Date().toISOString() },
    ],
  }
}

export function addFindingEvidence(evidence, { finding, severity, file, line, evidence: detail = '', source = 'tool', trustLevel = 'T2' }) {
  return {
    ...evidence,
    findings: [
      ...evidence.findings,
      { finding, severity, file, line, evidence: detail, source, trustLevel, trustValue: TRUST_VALUES[trustLevel] ?? 0, at: new Date().toISOString() },
    ],
  }
}

export function maxEvidenceTrust(evidence = {}) {
  let max = 0
  for (const key of ['commands', 'tests', 'files', 'findings']) {
    for (const record of evidence[key] || []) {
      max = Math.max(max, record.trustValue ?? 0)
    }
  }
  return max
}

export function evidenceTrustLevel(evidence = {}) {
  const value = maxEvidenceTrust(evidence)
  const entry = Object.entries(TRUST_VALUES).find(([, v]) => v === value)
  return entry ? entry[0] : 'T0'
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
  let hostEvidenceCount = 0
  let embeddedCount = 0

  // Harness/tool-provided structured records: deterministic command/test
  // results with explicit exitCode are T3, plain tool output is T2.
  const apply = (key, fn, defaultTrust) => {
    for (const item of Array.isArray(source[key]) ? source[key] : []) {
      try {
        const recordTrust = (item?.exitCode !== undefined || key === 'tests') ? defaultTrust : 'T2'
        evidence = fn(evidence, { ...item, source: item.source || 'tool', trustLevel: item.trustLevel || recordTrust })
        hostEvidenceCount += 1
      } catch {
        // Skip malformed evidence entries; never fail the mission.
      }
    }
  }

  apply('commands', addCommandEvidence, 'T3')
  apply('tests', addTestEvidence, 'T3')
  apply('files', addFileEvidence, 'T2')
  apply('findings', addFindingEvidence, 'T2')

  // Tool call records without an explicit exitCode are observations, not
  // deterministic executions; they stay T2 and are never auto-passed.
  if (Array.isArray(result?.toolCalls)) {
    for (const call of result.toolCalls) {
      try {
        if (!call || (!call.command && !call.name)) continue
        if (call.exitCode === undefined && call.ok !== false) continue
        evidence = addCommandEvidence(evidence, {
          command: call.command || call.name,
          exitCode: call.exitCode ?? 1,
          output: call.output || call.stdout || '',
          durationMs: call.durationMs || 0,
          source: 'tool',
          trustLevel: call.exitCode !== undefined ? 'T3' : 'T2',
        })
        hostEvidenceCount += 1
      } catch {
        // Ignore malformed tool-call evidence.
      }
    }
  }

  // EVIDENCE_JSON written by the model is always T1 per record.
  const embedded = parseEmbeddedEvidence(result?.output || result?.text || '')
  if (embedded) {
    for (const item of embedded.commands || []) {
      try { evidence = addCommandEvidence(evidence, { ...item, source: 'model', trustLevel: 'T1' }); embeddedCount += 1 } catch { /* ignore */ }
    }
    for (const item of embedded.tests || []) {
      try { evidence = addTestEvidence(evidence, { ...item, source: 'model', trustLevel: 'T1' }); embeddedCount += 1 } catch { /* ignore */ }
    }
    for (const item of embedded.files || []) {
      try { evidence = addFileEvidence(evidence, { ...item, source: 'model', trustLevel: 'T1' }); embeddedCount += 1 } catch { /* ignore */ }
    }
    for (const item of embedded.findings || []) {
      try { evidence = addFindingEvidence(evidence, { ...item, source: 'model', trustLevel: 'T1' }); embeddedCount += 1 } catch { /* ignore */ }
    }
  }

  // Bundle-level metadata is only a convenience summary; per-record trust is
  // authoritative. The bundle is never auto-upgraded to T3 just because one
  // host record exists.
  if (hostEvidenceCount > 0) evidence.source = 'tool'
  else if (embeddedCount > 0) evidence.source = 'model'
  else evidence.source = 'model'
  evidence.trustLevel = evidenceTrustLevel(evidence)
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