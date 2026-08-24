import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SEMANTIC_EXPANSIONS,
  expandQueryTokens,
  normalizeQuery,
  tokenizeChinese,
  tokenizeEnglish,
  tokenizePaths,
  tokenizeQuery,
} from '../src/query-tokenizer.mjs'

test('tokenizeEnglish splits camelCase and snake_case', () => {
  const tokens = tokenizeEnglish('refreshSession race_condition')
  assert.ok(tokens.includes('refreshsession'))
  assert.ok(tokens.includes('refresh'))
  assert.ok(tokens.includes('session'))
  assert.ok(tokens.includes('race'))
  assert.ok(tokens.includes('condition'))
})

test('tokenizeChinese emits 2-gram and 3-gram tokens', () => {
  const tokens = tokenizeChinese('登录超时')
  assert.ok(tokens.includes('登录'))
  assert.ok(tokens.includes('超时'))
  assert.ok(tokens.includes('登录超时'))
})

test('tokenizeQuery handles mixed Chinese and English', () => {
  const tokens = tokenizeQuery('修复登录超时 refreshSession race condition')
  assert.ok(tokens.includes('登录'))
  assert.ok(tokens.includes('登录超时'))
  assert.ok(tokens.includes('refresh'))
  assert.ok(tokens.includes('session'))
})

test('expandQueryTokens adds semantic expansions', () => {
  const expanded = expandQueryTokens(['登录', '登录超时'])
  assert.ok(expanded.includes('login'))
  assert.ok(expanded.includes('session'))
  assert.ok(expanded.includes('timeout'))
})

test('normalizeQuery returns tokens and expanded tokens', () => {
  const result = normalizeQuery('修复登录超时')
  assert.ok(result.tokens.includes('登录超时'))
  assert.ok(result.expanded.includes('timeout'))
  assert.equal(typeof SEMANTIC_EXPANSIONS['支付'][0], 'string')
})

test('tokenizePaths extracts path segments', () => {
  const tokens = tokenizePaths('src/auth/session.ts')
  assert.ok(tokens.includes('auth'))
  assert.ok(tokens.includes('session.ts'))
})