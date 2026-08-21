/**
 * Dynamic Context Expansion.
 *
 * Unlike a one-shot static level, context grows in response to uncertainty:
 * L0 repo map -> L1 symbols -> L2 implementations -> L3 callers -> L4 tests.
 */

import { CONTEXT_LEVELS, buildProgressiveContext } from './context-expansion.mjs'

export const MAX_CONTEXT_LEVEL = CONTEXT_LEVELS.length - 1

export function nextContextLevel(currentLevel = 0) {
  return Math.min(MAX_CONTEXT_LEVEL, Math.max(0, Number(currentLevel) + 1))
}

export function shouldExpandContext(uncertainty = 0, threshold = 0.5) {
  return Number(uncertainty) > Number(threshold)
}

export function buildDynamicContext(taskText, entries, files = {}, options = {}) {
  const requestedLevel = Number(options.level ?? 0)
  const uncertainty = Number(options.uncertainty ?? 0)
  const threshold = Number(options.threshold ?? 0.5)
  const expand = options.force || shouldExpandContext(uncertainty, threshold)
  const level = expand ? nextContextLevel(requestedLevel) : requestedLevel

  return {
    level,
    nextLevel: nextContextLevel(level),
    expanded: expand,
    uncertainty,
    context: buildProgressiveContext(taskText, entries, files, {
      level,
      maxFiles: options.maxFiles || 8,
      maxFileChars: options.maxFileChars || 2000,
      graph: options.graph,
    }),
  }
}
