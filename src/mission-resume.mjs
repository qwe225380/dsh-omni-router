/**
 * Mission Resume: persist DAG + evidence state so long-running missions can be
 * audited, resumed, or analyzed across sessions.
 */

import fs from 'node:fs'
import path from 'node:path'

export function missionStatePath(cwd, key) {
  return path.join(cwd, '.omni', 'missions', `${String(key).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`)
}

export function saveMissionState(cwd, key, state = {}) {
  const file = missionStatePath(cwd, key)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8')
  return file
}

export function loadMissionState(cwd, key) {
  const file = missionStatePath(cwd, key)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export function listMissionStates(cwd) {
  const dir = path.join(cwd, '.omni', 'missions')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
}
