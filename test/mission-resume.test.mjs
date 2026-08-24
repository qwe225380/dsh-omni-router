import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  listMissionStates,
  loadMissionState,
  saveMissionState,
} from '../src/mission-resume.mjs'

test('saveMissionState and loadMissionState round-trip', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-resume-'))
  try {
    const state = { dag: { tasks: [{ id: 'T1', status: 'done' }] }, evidence: [{ id: 'E-1' }] }
    const file = saveMissionState(cwd, 'mission-1', state)
    assert.ok(fs.existsSync(file))
    const loaded = loadMissionState(cwd, 'mission-1')
    assert.equal(loaded.dag.tasks[0].status, 'done')
    assert.equal(loaded.evidence[0].id, 'E-1')
    assert.deepEqual(listMissionStates(cwd), ['mission-1'])
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})

test('loadMissionState returns null for missing key', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-resume-miss-'))
  try {
    assert.equal(loadMissionState(cwd, 'missing'), null)
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true })
  }
})
