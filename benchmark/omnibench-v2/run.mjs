#!/usr/bin/env node
/**
 * OmniBench v2 runner / prompt generator.
 *
 * Generates per-repo per-arm per-run DSH prompts. With `--exec` and a
 * configured `agentCommand` (or `--agent-command`), it also executes the run
 * locally, runs baseline/verify commands, and writes machine-readable results.
 *
 * Usage:
 *   node benchmark/omnibench-v2/run.mjs <manifest.json>            # plan + prompts
 *   node benchmark/omnibench-v2/run.mjs <manifest.json> --exec     # execute agentCommand runs
 *   node benchmark/omnibench-v2/run.mjs <manifest.json> --exec --agent-command "node agent.mjs"
 */

import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export function buildPrompt(manifest, arm) {
  const criteria = (manifest.acceptance || []).map((c) => `- ${c}`).join('\n')
  const task = `Task:\n${manifest.task}\n\nAcceptance criteria:\n${criteria}`
  if (arm === 'raw') {
    return `${task}\n\nWork on the task. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`
  }
  return `${task}\n\nYou are using the Omni control plane. Follow engineering methodology, verify with real evidence, and do not claim completion without checks. When done, reply exactly "BENCHMARK: PASS" if you verified all criteria, otherwise "BENCHMARK: FAIL".`
}

export function readManifests(manifestPath) {
  const manifests = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  return Array.isArray(manifests) ? manifests : [manifests]
}

export function validateManifests(list) {
  const errors = []
  for (const m of list) {
    if (!m.id) errors.push('missing id')
    if (!m.repo) errors.push(`${m.id || '?'}: missing repo`)
    if (!m.commit) errors.push(`${m.id || '?'}: missing commit`)
    if (!m.task) errors.push(`${m.id || '?'}: missing task`)
    if (!Array.isArray(m.acceptance) || !m.acceptance.length) errors.push(`${m.id || '?'}: missing acceptance`)
    if (!m.runs || m.runs < 3) errors.push(`${m.id || '?'}: runs should be >= 3`)
  }
  return errors
}

export function ensureRepo(m) {
  const workDir = path.resolve(process.env.OMNIBENCH_REPOS || path.join(here, 'repos'))
  const dir = path.join(workDir, m.id)
  fs.mkdirSync(workDir, { recursive: true })
  if (!fs.existsSync(path.join(dir, '.git'))) {
    console.log(`cloning ${m.repo} -> ${dir}`)
    execSync(`git clone "${m.repo}" "${dir}"`, { stdio: 'inherit' })
  }
  console.log(`checkout ${m.id} @ ${m.commit}`)
  execSync(`git -C "${dir}" checkout ${m.commit}`, { stdio: 'inherit' })
  return dir
}

export function runCommand(command, cwd, label) {
  if (!command) return { skipped: true }
  const start = Date.now()
  try {
    const output = execSync(command, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { skipped: false, exitCode: 0, output, durationMs: Date.now() - start }
  } catch (error) {
    return {
      skipped: false,
      exitCode: error.status ?? 1,
      output: String(error.stdout || '') + String(error.stderr || ''),
      durationMs: Date.now() - start,
    }
  }
}

export function generatePrompts(list) {
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
  return count
}

export function writeResults(results, resultsDir) {
  fs.mkdirSync(resultsDir, { recursive: true })
  const file = path.join(resultsDir, `omnibench-v2-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(results, null, 2), 'utf8')
  return file
}

function main() {
  const manifestPath = process.argv[2] || path.join(here, 'manifest.local.example.json')
  const execMode = process.argv.includes('--exec')
  const agentCommandOverride = (() => {
    const idx = process.argv.indexOf('--agent-command')
    return idx !== -1 ? process.argv[idx + 1] : null
  })()
  const resultsDir = path.resolve(process.env.OMNIBENCH_RESULTS || path.join(here, 'results'))

  const list = readManifests(manifestPath)
  const errors = validateManifests(list)
  if (errors.length) {
    console.error('Invalid manifest:')
    for (const e of errors) console.error(`- ${e}`)
    process.exit(1)
  }
  const promptCount = generatePrompts(list)

  let totalRuns = 0
  for (const m of list) totalRuns += (m.runs || 1) * 2
  console.log(`Generated ${promptCount} DSH prompts in ${path.join(here, 'prompts')}`)
  console.log(`OmniBench v2 run plan (${totalRuns} agent runs)`)

  if (!execMode) {
    for (const m of list) {
      console.log(`- ${m.id}: ${m.repo} @ ${m.commit} (${m.language}/${m.framework}) runs=${m.runs} -> raw ${m.runs} + omni ${m.runs}`)
    }
    console.log('Pass --exec and configure agentCommand to execute runs locally.')
    return
  }

  const results = []
  for (const m of list) {
    const repoDir = ensureRepo(m)
    for (const arm of ['raw', 'omni']) {
      for (let i = 1; i <= (m.runs || 3); i++) {
        const agentCommand = agentCommandOverride || m.agentCommand
        const promptFile = path.join(here, 'prompts', `${m.id}-${arm}-${i}.txt`)
        const prompt = fs.readFileSync(promptFile, 'utf8')
        console.log(`\n=== ${m.id} ${arm} run ${i} ===`)
        if (m.setupCommand) {
          const setup = runCommand(m.setupCommand, repoDir, 'setup')
          console.log(`setup exit=${setup.exitCode ?? 'skip'}`)
        }
        const baseline = m.baselineCommand ? runCommand(m.baselineCommand, repoDir, 'baseline') : null
        if (baseline) console.log(`baseline exit=${baseline.exitCode ?? 'skip'}`)

        let agent = null
        if (agentCommand) {
          const command = `${agentCommand} ${JSON.stringify(prompt)}`
          agent = runCommand(command, repoDir, 'agent')
          console.log(`agent exit=${agent.exitCode ?? 'skip'} duration=${agent.durationMs ?? 0}ms`)
        } else {
          console.log(`agentCommand not configured; run prompt manually in DSH Desktop:\n  ${promptFile}`)
        }

        const verify = m.verifyCommand ? runCommand(m.verifyCommand, repoDir, 'verify') : null
        if (verify) console.log(`verify exit=${verify.exitCode ?? 'skip'}`)

        let success = null
        if (verify && verify.skipped !== true) {
          success = verify.exitCode === 0
        } else if (agent && agent.skipped !== true) {
          success = agent.exitCode === 0 && /BENCHMARK:\s*PASS/i.test(agent.output || '')
        }

        results.push({
          id: m.id,
          arm,
          run: i,
          repo: m.repo,
          commit: m.commit,
          task: m.task,
          success,
          agentExitCode: agent?.exitCode ?? null,
          verifyExitCode: verify?.exitCode ?? null,
          durationMs: (agent?.durationMs || 0) + (verify?.durationMs || 0),
          baselineExitCode: baseline?.exitCode ?? null,
          agentOutput: agent?.output?.slice(0, 4000) || '',
          verifyOutput: verify?.output?.slice(0, 4000) || '',
          metrics: {
            tokens: 0,
            cost: 0,
            toolCalls: 0,
          },
          promptFile,
          ranAt: new Date().toISOString(),
        })
      }
    }
  }

  const file = writeResults(results, resultsDir)
  const executed = results.filter((r) => r.success !== null).length
  const passed = results.filter((r) => r.success === true).length
  console.log(`\nWrote ${results.length} result record(s) to ${file}`)
  console.log(`Executed ${executed}/${results.length} runs; passed ${passed}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}