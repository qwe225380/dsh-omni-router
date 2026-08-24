/**
 * Memory Engine.
 *
 * Single facade over Memory v1/v2/v3. Internally versioned schema, externally
 * one API so the main runtime only talks to one memory engine.
 */

import { createMemory, loadMemoryFile, saveMemoryFile } from './memory.mjs'
import {
  createMemoryV3,
  distillSkill,
  recordCrossSessionStrategy,
  recordExecutionPolicy,
  recordSkillOutcome,
  retrieveCrossSessionStrategies,
  retrieveExecutionPolicy,
  retrieveHistoricalFailures,
} from './memory-v3.mjs'

export function createMemoryEngine() {
  return createMemoryV3(createMemory())
}

export function loadMemoryEngine(cwd) {
  const base = loadMemoryFile(cwd)
  return createMemoryV3(base)
}

export function saveMemoryEngine(cwd, engine) {
  return saveMemoryFile(cwd, engine)
}

export {
  createMemoryV3,
  distillSkill,
  recordCrossSessionStrategy,
  recordExecutionPolicy,
  recordSkillOutcome,
  retrieveCrossSessionStrategies,
  retrieveExecutionPolicy,
  retrieveHistoricalFailures,
}