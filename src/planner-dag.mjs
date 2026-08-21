/**
 * Planner-generated DAG.
 *
 * Replaces the fixed sequential phase chain with a task-type-aware graph that
 * has parallel branches (backend/UI, extract/update callers, etc.), so
 * `maxParallel` can actually schedule multiple ready tasks.
 */

import { createTask } from './mission-dag.mjs'

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
