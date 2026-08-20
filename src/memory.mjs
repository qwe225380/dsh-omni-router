/**
 * Memory v1: structured project/decision/failure/trajectory memory.
 *
 * This is Omni-owned memory for long-horizon engineering work. It complements
 * (not replaces) fable5-session-state-management, which focuses on working
 * notes and session continuity.
 */

export function createMemory() {
  return {
    project: [],
    decisions: [],
    failures: [],
    trajectory: [],
  }
}

export function recordProject(memory, entry) {
  return { ...memory, project: appendEntry(memory.project, entry) }
}

export function recordDecision(memory, entry) {
  return { ...memory, decisions: appendEntry(memory.decisions, entry) }
}

export function recordFailure(memory, entry) {
  return { ...memory, failures: appendEntry(memory.failures, entry) }
}

export function recordTrajectory(memory, entry) {
  return { ...memory, trajectory: appendEntry(memory.trajectory, entry) }
}

function appendEntry(list, entry) {
  const text = typeof entry === 'string' ? entry : entry?.text || ''
  if (!text.trim()) return list
  const item = {
    text: text.trim(),
    at: new Date().toISOString(),
  }
  return [...list, item]
}

export function summarizeMemory(memory = {}, limit = 5) {
  const parts = []
  const project = (memory.project || []).slice(-limit)
  const decisions = (memory.decisions || []).slice(-limit)
  const failures = (memory.failures || []).slice(-limit)
  const trajectory = (memory.trajectory || []).slice(-limit)

  if (project.length) parts.push(`Project memory:\n${project.map((e) => `- ${e.text}`).join('\n')}`)
  if (decisions.length) parts.push(`Decision memory:\n${decisions.map((e) => `- ${e.text}`).join('\n')}`)
  if (failures.length) parts.push(`Failure memory:\n${failures.map((e) => `- ${e.text}`).join('\n')}`)
  if (trajectory.length) parts.push(`Trajectory:\n${trajectory.map((e) => `- ${e.text}`).join('\n')}`)

  return parts.join('\n\n')
}

export function formatMemory(memory = {}) {
  const sections = [
    ['Project', memory.project],
    ['Decisions', memory.decisions],
    ['Failures', memory.failures],
    ['Trajectory', memory.trajectory],
  ]
  const lines = []
  for (const [name, list] of sections) {
    if (!list?.length) continue
    lines.push(`## ${name}`)
    for (const entry of list) {
      lines.push(`- ${entry.text} (${entry.at})`)
    }
  }
  return lines.length ? lines.join('\n') : '(empty memory)'
}
