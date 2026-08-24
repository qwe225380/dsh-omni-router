/**
 * OmniHost Interface.
 *
 * The small contract a host (DSH, Codex, Claude, ...) implements so Omni's
 * kernel stays host-independent. Omni never executes; it decides, prepares,
 * and verifies through this boundary.
 */

export const HOST_FEATURES = [
  'workflow',
  'approvals',
  'skills',
  'plugins',
  'subagents',
  'toolEvents',
  'testEvents',
  'fileEvents',
]

export function createHostAdapter(host = {}) {
  const missing = []
  for (const method of ['describeHost']) {
    if (typeof host[method] !== 'function') missing.push(method)
  }
  return {
    ...host,
    missing,
    valid: missing.length === 0,
  }
}

export function describeHostCapabilities(capabilities = {}) {
  const result = {}
  for (const feature of HOST_FEATURES) {
    result[feature] = capabilities[feature] === true
  }
  return result
}

export function negotiateHost(hostCapabilities = {}, required = HOST_FEATURES) {
  const caps = describeHostCapabilities(hostCapabilities)
  const supported = []
  const degraded = []
  for (const feature of required) {
    if (caps[feature]) supported.push(feature)
    else degraded.push(feature)
  }
  return {
    supported,
    degraded,
    capabilities: caps,
    mode: degraded.length ? 'degraded' : 'full',
  }
}

export function formatHostNegotiation(result = {}) {
  return [
    `Host mode: ${result.mode}`,
    `Supported: ${result.supported.join(', ') || '(none)'}`,
    `Degraded: ${result.degraded.join(', ') || '(none)'}`,
  ].join('\n')
}