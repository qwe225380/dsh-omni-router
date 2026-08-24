/**
 * Intervention Gate.
 *
 * Decides whether Omni should intervene at all. The default answer is NOOP:
 * if the host can already do the job without extra tokens/latency/context
 * pollution, Omni stays out of the way.
 */

export function expectedInterventionUtility({
  successGain = 0,
  tokenOverhead = 0,
  latency = 0,
  contextPollution = 0,
  overlap = 0,
  failureSurface = 0,
  taskFrequency = 1,
} = {}) {
  const utility = (
    successGain * 1.0 -
    tokenOverhead * 0.5 -
    latency * 0.3 -
    contextPollution * 0.5 -
    overlap * 0.4 -
    failureSurface * 0.4
  ) * Math.max(0.1, taskFrequency)
  return Math.round(utility * 1000) / 1000
}

export function shouldIntervene(utility = 0, threshold = 0.1) {
  return utility > threshold
}

export function decideIntervention({
  successGain,
  tokenOverhead,
  latency,
  contextPollution,
  overlap,
  failureSurface,
  taskFrequency,
  threshold = 0.1,
} = {}) {
  const utility = expectedInterventionUtility({
    successGain,
    tokenOverhead,
    latency,
    contextPollution,
    overlap,
    failureSurface,
    taskFrequency,
  })
  return {
    utility,
    threshold,
    intervene: shouldIntervene(utility, threshold),
    mode: shouldIntervene(utility, threshold) ? 'intervene' : 'noop',
  }
}

export function noOpPrecision(decisions = []) {
  // decision: { predictedNoop: boolean, actuallyNeeded: boolean }
  let predictedNoop = 0
  let correctNoop = 0
  for (const d of decisions) {
    if (!d.predictedNoop) continue
    predictedNoop += 1
    if (!d.actuallyNeeded) correctNoop += 1
  }
  return predictedNoop ? Math.round((correctNoop / predictedNoop) * 1000) / 1000 : 1
}

export function interventionEfficiency({ rawSuccess = 0, omniSuccess = 0, tokenOverhead = 0 }) {
  const gain = omniSuccess - rawSuccess
  const overhead = Math.max(0.01, tokenOverhead)
  return {
    gain: Math.round(gain * 1000) / 1000,
    tokenOverhead,
    efficiency: Math.round((gain / overhead) * 1000) / 1000,
  }
}

export function formatInterventionGate(result = {}) {
  return `${result.intervene ? 'INTERVENE' : 'NOOP'} (utility=${result.utility}, threshold=${result.threshold})`
}