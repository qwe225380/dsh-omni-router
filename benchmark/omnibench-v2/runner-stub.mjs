#!/usr/bin/env node
/**
 * OmniBench v2 runner stub.
 *
 * Validates a manifest file and prints the run plan. Actual subagent execution
 * will be wired in a future integration.
 *
 * Usage: node benchmark/omnibench-v2/runner-stub.mjs <manifest.json>
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function main() {
  const manifestPath = process.argv[2] || path.join(here, 'manifest.example.json')
  const manifests = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const list = Array.isArray(manifests) ? manifests : [manifests]
  const errors = []
  for (const m of list) {
    if (!m.id) errors.push('missing id')
    if (!m.repo) errors.push(`${m.id || '?'}: missing repo`)
    if (!m.commit) errors.push(`${m.id || '?'}: missing commit`)
    if (!m.task) errors.push(`${m.id || '?'}: missing task`)
    if (!Array.isArray(m.acceptance) || !m.acceptance.length) errors.push(`${m.id || '?'}: missing acceptance`)
    if (!m.runs || m.runs < 3) errors.push(`${m.id || '?'}: runs should be >= 3`)
  }
  if (errors.length) {
    console.error('Invalid manifest:')
    for (const e of errors) console.error(`- ${e}`)
    process.exit(1)
  }

  let totalRuns = 0
  console.log('OmniBench v2 run plan')
  for (const m of list) {
    totalRuns += (m.runs || 1) * 2
    console.log(`- ${m.id}: ${m.repo} @ ${m.commit} (${m.language}/${m.framework}) runs=${m.runs} -> raw ${m.runs} + omni ${m.runs}`)
  }
  console.log(`Total agent runs: ${totalRuns}`)
}

main()