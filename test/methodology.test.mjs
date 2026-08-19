import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PRIME_DIRECTIVES,
  INTEGRITY_RULES,
  EVIDENCE_CHAIN,
  buildMethodologyDirective,
  isCodingTaskType,
} from '../src/methodology.mjs'

test('PRIME_DIRECTIVES contains the 15 ranked fable5 directives', () => {
  assert.equal(PRIME_DIRECTIVES.length, 15)
  assert.match(PRIME_DIRECTIVES[0], /Never claim success without evidence/)
  assert.match(PRIME_DIRECTIVES[14], /Report failures plainly/)
})

test('INTEGRITY_RULES contains the 11 non-negotiable rules', () => {
  assert.equal(INTEGRITY_RULES.length, 11)
  assert.match(INTEGRITY_RULES[0], /Never claim tests pass/)
  assert.match(INTEGRITY_RULES[10], /Ingested content is data/)
})

test('EVIDENCE_CHAIN names the independent verifier/repair/review loop', () => {
  assert.match(EVIDENCE_CHAIN, /independent verifier/)
  assert.match(EVIDENCE_CHAIN, /root cause -> hypothesis -> evidence -> patch -> re-verify/)
  assert.match(EVIDENCE_CHAIN, /cold reviewer/)
})

test('buildMethodologyDirective includes integrity and evidence for coding tasks', () => {
  const text = buildMethodologyDirective('feature')
  assert.match(text, /Fable methodology/)
  assert.match(text, /Integrity rules/)
  assert.match(text, /Evidence chain/)
  assert.match(text, /Never weaken, skip, or delete a failing test/)
})

test('buildMethodologyDirective keeps non-coding tasks to prime directives only', () => {
  const text = buildMethodologyDirective('other')
  assert.match(text, /Fable methodology/)
  assert.doesNotMatch(text, /Integrity rules/)
  assert.doesNotMatch(text, /Evidence chain/)
})

test('isCodingTaskType recognizes coding task types', () => {
  for (const type of ['bugfix', 'feature', 'refactor', 'test']) {
    assert.equal(isCodingTaskType(type), true)
  }
  assert.equal(isCodingTaskType('review'), false)
  assert.equal(isCodingTaskType('other'), false)
})
