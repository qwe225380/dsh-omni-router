#!/usr/bin/env node
/**
 * OmniBench v2 repo preparer.
 *
 * Reads a manifest and clones/checks out each repo at the fixed commit.
 * Usage: node benchmark/omnibench-v2/prepare.mjs <manifest.json> [workDir]
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

function main() {
  const manifestPath = process.argv[2] || path.join(here, 'manifest.example.json')
  const workDir = path.resolve(process.argv[3] || path.join(here, 'repos'))
  const manifests = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const list = Array.isArray(manifests) ? manifests : [manifests]

  fs.mkdirSync(workDir, { recursive: true })
  for (const m of list) {
    const dir = path.join(workDir, m.id)
    if (!fs.existsSync(path.join(dir, '.git'))) {
      console.log(`cloning ${m.repo} -> ${dir}`)
      execSync(`git clone "${m.repo}" "${dir}"`, { stdio: 'inherit' })
    }
    console.log(`checkout ${m.id} @ ${m.commit}`)
    execSync(`git -C "${dir}" checkout ${m.commit}`, { stdio: 'inherit' })
  }
  console.log(`Prepared ${list.length} repo(s) in ${workDir}`)
}

main()