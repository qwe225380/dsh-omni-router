#!/usr/bin/env node
/**
 * OmniBench v2 runner / prompt generator.
 *
 * Generates per-repo per-arm per-run DSH prompts. Actual execution must happen
 * inside DSH Desktop; this script makes that reproducible.
 *
 * Usage:
 *   node benchmark/omnibench-v2/run.mjs <manifest.json>
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function buildPrompt(manifest, arm) {
  const criteria = (manifest.acceptance || []).map((c) => `- ${c}`).join('\n')
  const task = `Task:\n${manifest.task}\n\nAcceptance criteria:\n${criteria}`
  if (arm === 'raw') {
    return `${task}\n\nWork on the task. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`
  }
  return `${task}\n\nYou are using the Omni control plane. Follow engineering methodology, verify with real evidence, and do not claim completion without checks. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`
}

function main() {
  const manifestPath = process.argv[2] || path.join(here, 'manifest.local.example.json')
  const manifests = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const list = Array.isArray(manifests) ? manifests : [manifests]
  const outDir = path.join(here, 'prompts')
  fs.mkdirSync(outDir, { recursive: true })
  let count = 0
  for (const m of list) {
    for (const arm of ['raw', 'omni']) {
      for (let i = 1; i <= (m.runs || 3); i++) {
        const file = path.join(outDir, `${m.id}-${arm}-${i}.txt`)
        fs.writeFileSync(file, buildPrompt(m, arm), 'utf8')
        count += 1
      }
    }
  }
  console.log(`Generated ${count} DSH prompts in ${outDir}`)
  console.log('Run each prompt inside a DSH Desktop session with the Omni Router preset, then collect results.')
}

main()
