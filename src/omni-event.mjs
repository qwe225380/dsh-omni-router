/**
 * OmniEvent.
 *
 * Host-independent event model. DSH, Codex, Claude, etc. normalize their own
 * events into OmniEvent so the Evidence/Recovery/Memory kernels never depend on
 * a specific host.
 */

export const OMNI_EVENT_TYPES = [
  'model.started',
  'model.completed',
  'tool.started',
  'tool.completed',
  'command.completed',
  'test.completed',
  'file.changed',
  'approval.requested',
  'approval.completed',
  'agent.started',
  'agent.completed',
]

export function createOmniEvent({
  type,
  host = 'unknown',
  sessionId = '',
  taskId = '',
  workspaceFingerprint = '',
  payload = {},
} = {}) {
  if (!type) throw new Error('OmniEvent type is required')
  return {
    type,
    host,
    sessionId,
    taskId,
    workspaceFingerprint,
    timestamp: new Date().toISOString(),
    payload,
  }
}

export function normalizeHostEvent(hostEvent = {}, host = 'unknown', context = {}) {
  const rawType = String(hostEvent.type || hostEvent.event || hostEvent.name || 'unknown')
  const type = mapHostEventType(rawType, host)
  return createOmniEvent({
    type,
    host: hostEvent.host || host,
    sessionId: hostEvent.sessionId || context.sessionId || '',
    taskId: hostEvent.taskId || context.taskId || '',
    workspaceFingerprint: hostEvent.workspaceFingerprint || context.workspaceFingerprint || '',
    payload: hostEvent.payload || hostEvent.data || hostEvent,
  })
}

function mapHostEventType(raw, host) {
  const value = String(raw).toLowerCase()
  if (host === 'dsh') {
    if (/tool|command/.test(value) && /start/.test(value)) return 'tool.started'
    if (/tool|command/.test(value) && /end|done|complete/.test(value)) return 'tool.completed'
    if (/test/.test(value)) return 'test.completed'
    if (/file|change/.test(value)) return 'file.changed'
    if (/approval/.test(value)) return 'approval.requested'
    if (/agent|subagent/.test(value) && /start/.test(value)) return 'agent.started'
    if (/agent|subagent/.test(value) && /end|done|complete/.test(value)) return 'agent.completed'
  }
  if (/start|begin/.test(value)) return 'model.started'
  if (/end|done|complete|finish/.test(value)) return 'model.completed'
  return OMNI_EVENT_TYPES.includes(raw) ? raw : 'model.completed'
}