import test from 'node:test'
import assert from 'node:assert/strict'

import { buildKernelPrompt } from '../src/kernel-prompt.mjs'

test('buildKernelPrompt emits only Contract, Context, Completion sections', () => {
  const prompt = buildKernelPrompt({
    contract: {
      objective: 'Fix race',
      constraints: ['keep API'],
      acceptance: ['no double charge', 'tests pass'],
      risk: 'high',
      verificationPolicy: { level: 'full' },
    },
    contextCapsule: 'src/auth/session.ts',
  })
  assert.match(prompt, /\[Task Contract\]/)
  assert.match(prompt, /\[Relevant Context\]/)
  assert.match(prompt, /\[Completion Rule\]/)
  assert.match(prompt, /src\/auth\/session\.ts/)
  assert.match(prompt, /T2\/T3 harness evidence/)
  assert.doesNotMatch(prompt, /Methodology|TDD|Skill/)
})