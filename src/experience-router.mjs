/**
 * Experience-based Router: use learned skills from memory to bias routing.
 */

import { retrieveLearnedSkill } from './memory.mjs'

export function experienceBasedRouting(memory = {}, taskText = '') {
  const matches = retrieveLearnedSkill(memory, taskText)
  if (matches.length === 0) {
    return { preferredMode: null, learnedSkill: null, confidence: 0 }
  }
  const skill = matches[0]
  return {
    preferredMode: 'plan',
    learnedSkill: skill.name,
    confidence: 0.7,
    recipe: skill.recipe,
  }
}