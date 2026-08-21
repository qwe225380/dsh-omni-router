import test from 'node:test'
import assert from 'node:assert/strict'

import { buildTrend, detectRegressions } from '../benchmark/continuous-eval.mjs'

test('buildTrend groups raw/omni runs by date', () => {
  const groups = {
    raw: [
      { date: '2026-08-20', success: true, oes: { score: 0.9 } },
      { date: '2026-08-21', success: false, oes: { score: 0.4 } },
    ],
    omni: [
      { date: '2026-08-20', success: true, oes: { score: 0.95 } },
      { date: '2026-08-21', success: true, oes: { score: 0.85 } },
    ],
  }
  const trend = buildTrend(groups)
  assert.equal(trend.length, 2)
  assert.equal(trend[0].date, '2026-08-20')
  assert.equal(trend[0].omni.successRate, 100)
})

test('detectRegressions alerts on success rate or OES drops', () => {
  const trend = [
    { date: '2026-08-20', omni: { successRate: 90, avgOes: 0.9 } },
    { date: '2026-08-21', omni: { successRate: 70, avgOes: 0.8 } },
  ]
  const alerts = detectRegressions(trend, { successDrop: 10, oesDrop: 0.05 })
  assert.ok(alerts.some((a) => a.includes('success rate')))
  assert.ok(alerts.some((a) => a.includes('avgOES')))
})
