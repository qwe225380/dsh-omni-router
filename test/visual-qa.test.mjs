import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildVisualQaPrompt,
  buildVisualQaRequest,
  buildVisualQaStepRequirement,
  isFrontendTask,
  parseVisualQaResponse,
} from '../src/visual-qa.mjs'

test('buildVisualQaPrompt includes requirement and verdict marker', () => {
  const prompt = buildVisualQaPrompt('页面应显示黑洞并带 HUD')
  assert.match(prompt, /页面应显示黑洞并带 HUD/)
  assert.match(prompt, /VISUAL_QA: PASS/)
  assert.match(prompt, /VISUAL_QA: FAIL/)
})

test('buildVisualQaRequest creates OpenAI-compatible image request', () => {
  const req = buildVisualQaRequest({ apiUrl: 'https://vision.example/v1/chat/completions', apiKey: 'k', model: 'vision-model', imageBase64: 'AAAA', prompt: 'check' })
  assert.equal(req.url, 'https://vision.example/v1/chat/completions')
  assert.equal(req.headers.Authorization, 'Bearer k')
  const body = JSON.parse(req.body)
  assert.equal(body.model, 'vision-model')
  assert.equal(body.messages[0].content[1].image_url.url, 'data:image/png;base64,AAAA')
})

test('parseVisualQaResponse detects PASS and FAIL', () => {
  assert.equal(parseVisualQaResponse('VISUAL_QA: PASS\nno issues').verdict, 'pass')
  assert.equal(parseVisualQaResponse('VISUAL_QA: FAIL\nhigh: layout broken').verdict, 'fail')
  assert.equal(parseVisualQaResponse('no marker').verdict, 'unknown')
})

test('parseVisualQaResponse extracts findings by severity', () => {
  const parsed = parseVisualQaResponse('VISUAL_QA: FAIL\nhigh: HUD overlaps canvas\nmedium: color contrast low')
  assert.ok(parsed.findings.some((f) => /HUD overlaps/i.test(f)))
  assert.ok(parsed.findings.some((f) => /color contrast/i.test(f)))
})

test('isFrontendTask detects frontend/UI/web tasks', () => {
  assert.equal(isFrontendTask('做一个前端页面'), true)
  assert.equal(isFrontendTask('fix the login UI'), true)
  assert.equal(isFrontendTask('修复后端接口'), false)
})

test('buildVisualQaStepRequirement mandates screenshot and visual check', () => {
  const req = buildVisualQaStepRequirement()
  assert.match(req, /browser_screenshot/)
  assert.match(req, /omni_visual_check/)
  assert.match(req, /VISUAL_QA: PASS/)
})