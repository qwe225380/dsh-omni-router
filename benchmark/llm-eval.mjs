#!/usr/bin/env node
/**
 * Optional LLM-vs-heuristic router evaluation.
 *
 * Uses an OpenAI-compatible chat completions API if these env vars are set:
 *   OPENAI_API_KEY, OPENAI_BASE_URL (optional), OPENAI_MODEL (optional)
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node benchmark/llm-eval.mjs [--limit 20]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  classifyComplexity,
  classifyTaskType,
  classifyThinkingMode,
} from '../src/omni-router.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tasks = JSON.parse(fs.readFileSync(path.join(__dirname, 'tasks.json'), 'utf8'))
const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 20)
const sample = tasks.slice(0, limit)

const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) {
  console.log('No OPENAI_API_KEY set. This script compares heuristic vs LLM routing.')
  console.log('Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL / OPENAI_MODEL) to run.')
  process.exit(0)
}

const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

async function llmClassify(task) {
  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: 'You are a task router. Return ONLY JSON: {"complexity":"plan|direct|balanced","task_type":"bugfix|feature|refactor|test|review|other","thinking_mode":"spec|react|balanced"}',
        },
        { role: 'user', content: `Task: ${task.task}` },
      ],
    }),
  })
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content || ''
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    const parsed = JSON.parse(content.slice(start, end + 1))
    return {
      complexity: parsed.complexity,
      taskType: parsed.task_type || parsed.taskType,
      thinkingMode: parsed.thinking_mode || parsed.thinkingMode,
    }
  } catch {
    return null
  }
}

let heuristicCorrect = 0
let llmCorrect = 0
let llmFailed = 0

console.log(`Evaluating ${sample.length} tasks (model: ${model})`)
for (const t of sample) {
  const h = {
    complexity: classifyComplexity(t.task),
    taskType: classifyTaskType(t.task),
    thinkingMode: classifyThinkingMode(t.task),
  }
  const llm = await llmClassify(t)
  const hOk = h.complexity === t.expected.complexity
  const lOk = llm?.complexity === t.expected.complexity
  if (hOk) heuristicCorrect++
  if (lOk) llmCorrect++
  if (!llm) llmFailed++
  console.log(`${hOk ? 'H' : ' '}${lOk ? 'L' : ' '} | ${t.task} | heuristic=${h.complexity} llm=${llm?.complexity || 'FAIL'} expected=${t.expected.complexity}`)
}

console.log('')
console.log(`Heuristic complexity accuracy: ${(heuristicCorrect / sample.length * 100).toFixed(1)}%`)
console.log(`LLM complexity accuracy: ${(llmCorrect / sample.length * 100).toFixed(1)}%`)
console.log(`LLM failures: ${llmFailed}/${sample.length}`)
