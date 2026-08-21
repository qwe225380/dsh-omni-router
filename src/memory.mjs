/**
 * Memory v1: structured project/decision/failure/trajectory memory.
 *
 * This is Omni-owned memory for long-horizon engineering work. It complements
 * session-state-management skills that focus on working notes and continuity.
 */

import fs from 'node:fs'
import path from 'node:path'

export function createMemory() {
  return {
    project: [],
    decisions: [],
    failures: [],
    trajectory: [],
    learnedSkills: [],
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

export function recordLearnedSkill(memory, skill = {}) {
  const name = String(skill.name || '').trim()
  if (!name) return memory
  const existing = (memory.learnedSkills || []).filter((s) => s.name !== name)
  return {
    ...memory,
    learnedSkills: [
      ...existing,
      {
        name,
        recipe: String(skill.recipe || ''),
        triggers: Array.isArray(skill.triggers) ? skill.triggers : [],
        createdAt: new Date().toISOString(),
      },
    ],
  }
}

export function learnFromTrajectory(memory, trajectory = []) {
  const successes = trajectory.filter((e) => /success|done|pass|完成/i.test(e.text || ''))
  if (!successes.length) return memory
  return recordLearnedSkill(memory, {
    name: `learned-${Date.now().toString(36)}`,
    recipe: successes.map((e) => e.text).join(' -> '),
    triggers: [],
  })
}

export function retrieveLearnedSkill(memory, taskText = '') {
  const text = String(taskText || '').toLowerCase()
  const skills = memory.learnedSkills || []
  if (!text) return skills
  return skills.filter((s) => (s.triggers || []).some((t) => text.includes(String(t).toLowerCase())) || (s.name || '').toLowerCase().includes(text))
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
  const learnedSkills = (memory.learnedSkills || []).slice(-limit)

  if (project.length) parts.push(`Project memory:\n${project.map((e) => `- ${e.text}`).join('\n')}`)
  if (decisions.length) parts.push(`Decision memory:\n${decisions.map((e) => `- ${e.text}`).join('\n')}`)
  if (failures.length) parts.push(`Failure memory:\n${failures.map((e) => `- ${e.text}`).join('\n')}`)
  if (trajectory.length) parts.push(`Trajectory:\n${trajectory.map((e) => `- ${e.text}`).join('\n')}`)
  if (learnedSkills.length) parts.push(`Learned skills:\n${learnedSkills.map((s) => `- ${s.name}`).join('\n')}`)

  return parts.join('\n\n')
}

export function formatMemory(memory = {}) {
  const sections = [
    ['Project', memory.project],
    ['Decisions', memory.decisions],
    ['Failures', memory.failures],
    ['Trajectory', memory.trajectory],
    ['Learned Skills', memory.learnedSkills?.map((s) => ({ text: `${s.name}: ${s.recipe}`, at: s.createdAt }))],
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

export function memoryFilePath(cwd) {
  return path.join(cwd, '.omni', 'memory.json')
}

export function loadMemoryFile(cwd) {
  try {
    const file = memoryFilePath(cwd)
    if (!fs.existsSync(file)) return createMemory()
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      project: Array.isArray(raw.project) ? raw.project : [],
      decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
      failures: Array.isArray(raw.failures) ? raw.failures : [],
      trajectory: Array.isArray(raw.trajectory) ? raw.trajectory : [],
      learnedSkills: Array.isArray(raw.learnedSkills) ? raw.learnedSkills : [],
    }
  } catch {
    return createMemory()
  }
}

export function saveMemoryFile(cwd, memory) {
  try {
    const file = memoryFilePath(cwd)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(memory, null, 2), 'utf8')
    return file
  } catch {
    return null
  }
}
