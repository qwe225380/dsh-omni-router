#!/usr/bin/env node
/**
 * Code Diet audit.
 *
 * Scans src/ for exports that are never imported anywhere (src/test/benchmark)
 * and writes a report. This is the first step of the Production Code Diet:
 * find dead code before deleting it.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

function listFiles(dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) out.push(...listFiles(full))
    else if (/\.m?js$/.test(entry)) out.push(full)
  }
  return out
}

const srcFiles = listFiles(path.join(root, 'src'))
const allFiles = [
  ...srcFiles,
  ...listFiles(path.join(root, 'test')),
  ...listFiles(path.join(root, 'benchmark')),
]

const byFile = new Map(allFiles.map((f) => [f, fs.readFileSync(f, 'utf8')]))

const report = []
for (const file of srcFiles) {
  const text = byFile.get(file)
  const exported = []
  for (const match of text.matchAll(/export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z0-9_]+)/g)) {
    exported.push(match[1])
  }
  const base = path.basename(file)
  const unused = exported.filter((name) => {
    // Search OTHER files only: the definition file itself must not count.
    const pattern = new RegExp(`\\b${name}\\b`, 'g')
    let otherRefs = 0
    for (const [other, otherText] of byFile) {
      if (other === file) continue
      for (const m of otherText.matchAll(pattern)) otherRefs += 1
    }
    return otherRefs === 0
  })
  if (unused.length) report.push({ file: base, exports: exported.length, unused })
}

const outPath = path.join(root, '.omni', 'code-diet.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')

console.log(`Code Diet audit: ${srcFiles.length} src files, ${report.length} files with unused exports`)
for (const item of report) {
  console.log(`- ${item.file}: unused ${item.unused.join(', ')}`)
}
console.log(`Report written to ${outPath}`)