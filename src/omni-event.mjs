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
  'unknown',
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
    if (/command/.test(value)) return value.includes('start') ? 'tool.started' : 'command.completed'
    if (/approval/.test(value)) return value.includes('completed') || value.includes('done') ? 'approval.completed' : 'approval.requested'
    if (/tool/.test(value)) return value.includes('start') ? 'tool.started' : 'tool.completed'
    if (/test/.test(value)) return 'test.completed'
    if (/file|change/.test(value)) return 'file.changed'
    if (/agent|subagent/.test(value) && /start/.test(value)) return 'agent.started'
    if (/agent|subagent/.test(value) && /end|done|complete/.test(value)) return 'agent.completed'
  }
  if (/^model\./.test(value) && OMNI_EVENT_TYPES.includes(value)) return value
  if (/^(tool|command|test|file|approval|agent)\./.test(value) && OMNI_EVENT_TYPES.includes(value)) return value
  if (/start|begin/.test(value)) return 'model.started'
  if (/end|done|complete|finish/.test(value)) return 'model.completed'
  return 'unknown'
}