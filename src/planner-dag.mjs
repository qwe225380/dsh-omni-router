/**
 * Planner-generated DAG.
 *
 * Replaces the fixed sequential phase chain with a task-type-aware graph that
 * has parallel branches (backend/UI, extract/update callers, etc.), so
 * `maxParallel` can actually schedule multiple ready tasks.
 */

import { createTask, getReadyTasks } from './mission-dag.mjs'

export function generateMissionDag(mission, brief = {}, options = {}) {
  const taskType = mission?.taskType || options.taskType || 'feature'
  const tasks = []
  const add = (id, goal, dependencies = [], extra = {}) => {
    tasks.push(createTask({
      id,
      goal,
      dependencies,
      acceptance: extra.acceptance || [`${goal} is complete`],
      verification: extra.verification || [],
      requiredCapabilities: extra.requiredCapabilities || [],
      ...extra,
    }))
  }

  if (taskType === 'bugfix') {
    add('T1', 'Reproduce the reported bug and capture failing evidence', [])
    add('T2', 'Diagnose root cause and form a falsifiable hypothesis', ['T1'])
    add('T3', 'Implement the minimal fix for the root cause', ['T2'], { requiredCapabilities: ['source.write'] })
    add('T4', 'Add regression test and run verification', ['T3'], { verification: ['run relevant checks'], requiredCapabilities: ['verification'] })
    add('T5', 'Review diff for regressions and scope creep', ['T4'], { requiredCapabilities: ['verification'] })
  } else if (taskType === 'refactor') {
    add('T1', 'Map current structure, behavior, and callers', [])
    add('T2a', 'Refactor core module without changing behavior', ['T1'], { requiredCapabilities: ['source.write'] })
    add('T2b', 'Update callers, exports, and imports', ['T1'], { requiredCapabilities: ['source.write'] })
    add('T3', 'Integrate refactored pieces and verify behavior', ['T2a', 'T2b'], { verification: ['run relevant checks'] })
    add('T4', 'Run full regression suite and review', ['T3'], { verification: ['run full test suite'], requiredCapabilities: ['verification'] })
  } else if (taskType === 'feature') {
    add('T1', 'Inspect current code, conventions, and requirements', [])
    add('T2a', 'Implement backend/service changes', ['T1'], { requiredCapabilities: ['source.write'] })
    add('T2b', 'Implement UI/client changes', ['T1'], { requiredCapabilities: ['source.write'] })
    add('T3', 'Integrate backend and UI changes', ['T2a', 'T2b'], { verification: ['run integration checks'] })
    add('T4', 'Add tests and verify end-to-end', ['T3'], { verification: ['run relevant tests'], requiredCapabilities: ['verification'] })
    add('T5', 'Review scope, quality, and regressions', ['T4'], { requiredCapabilities: ['verification'] })
  } else if (taskType === 'test') {
    add('T1', 'Inspect code under test and existing test patterns', [])
    add('T2', 'Add unit/integration tests for target behavior', ['T1'], { requiredCapabilities: ['source.write'] })
    add('T3', 'Run tests and verify all pass', ['T2'], { verification: ['run test suite'], requiredCapabilities: ['verification'] })
  } else {
    // fallback: derive from mission phases sequentially
    let prev = null
    let seq = 0
    for (const phase of mission?.phases || []) {
      const goals = (brief?.phases?.[phase.id] || [phase.id])
      for (const goal of goals) {
        seq += 1
        const id = `T${seq}`
        add(id, goal, prev ? [prev] : [], {
          verification: phase.id === 'validate' || phase.id === 'verify' ? ['run relevant checks'] : [],
          requiredCapabilities: phase.id === 'validate' || phase.id === 'verify' ? ['verification'] : [],
        })
        prev = id
      }
    }
  }

  return { mission, tasks }
}

export function roleForTask(task = {}) {
  const text = `${task.goal || ''} ${task.id || ''}`
  if (/judge|final verdict/i.test(text)) return 'judge'
  if (/review/i.test(text)) return 'code-reviewer'
  if (/verify|verification|run (relevant|full|failing)|regression|validate|test suite/i.test(text)) return 'qa-verifier'
  if (/repair|diagnose/i.test(text)) return 'repair'
  return 'builder'
}

/**
 * Compile a Mission DAG into a DSH-native plan artifact (objective + ordered
 * task groups). This is the bridge toward executing through DSH native
 * workflow/goal loops instead of Omni re-implementing a full runtime.
 */
export function compileDagToPlan(dag) {
  const tasks = dag?.tasks || []
  const groups = []
  let remaining = tasks.map((t) => ({ ...t }))
  const done = new Set()
  while (remaining.length) {
    const ready = remaining.filter((t) => t.dependencies.every((d) => done.has(d)))
    if (!ready.length) break
    groups.push(ready.map((t) => t.id))
    for (const t of ready) {
      done.add(t.id)
      remaining = remaining.filter((r) => r.id !== t.id)
    }
  }
  return {
    objective: dag?.mission?.task || '',
    groups,
    tasks: tasks.map((t) => ({
      id: t.id,
      goal: t.goal,
      dependencies: t.dependencies,
      requiredCapabilities: t.requiredCapabilities,
      verification: t.verification,
    })),
  }
}

/**
 * Compile a Mission DAG into a DSH-native workflow outline. Each group is a
 * parallel step with explicit roles and prompts; this is the integration
 * surface for DSH workflow/goal execution.
 */
export function compileDagToWorkflow(dag) {
  const plan = compileDagToPlan(dag)
  return {
    objective: plan.objective,
    steps: plan.groups.map((ids, index) => ({
      step: index + 1,
      parallel: ids,
      tasks: ids.map((id) => {
        const t = dag.tasks.find((x) => x.id === id)
        return {
          id,
          role: roleForTask(t),
          goal: t.goal,
          prompt: `[${t.id}] ${t.goal}`,
        }
      }),
    })),
  }
}
