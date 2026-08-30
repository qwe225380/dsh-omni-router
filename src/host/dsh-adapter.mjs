/**
 * DSH Host Adapter.
 *
 * Implements the OmniHost contract for DeepSeek Harness. This is the only
 * place that knows about `ctx`, Cordis, and DSH plugin APIs. The kernel never
 * imports this file.
 */

import { describeHostCapabilities } from '../host-interface.mjs'
import { normalizeHostEvent } from '../omni-event.mjs'

export function createDshHostAdapter(ctx = {}) {
  const get = (key) => {
    try {
      if (typeof ctx.get === 'function') {
        const value = ctx.get(key)
        if (value !== undefined) return value
      }
    } catch {
      // Not injected or not available.
    }
    try {
      return ctx[key]
    } catch {
      return undefined
    }
  }

  const revisions = new Map()
  let freshnessAvailable = false

  return {
    describeHost() {
      return describeHostCapabilities({
        workflow: !!get('workflow'),
        approvals: !!get('approvals'),
        skills: !!get('skills'),
        plugins: !!get('plugins'),
        subagents: !!get('subagents'),
        toolEvents: !!get('events'),
        testEvents: false,
        fileEvents: !!get('fs'),
      })
    },

    getWorkspaceState() {
      const agent = get('agent')
      const session = agent?.session || null
      return {
        cwd: session?.meta?.cwd || session?.header?.cwd || null,
        sessionId: session?.id || null,
      }
    },

    getWorkspaceRevision(sessionId = '') {
      return revisions.get(sessionId) || 0
    },

    getFreshnessAvailable() {
      return freshnessAvailable
    },

    getWorkspaceFingerprint() {
      // Real fingerprinting is done by ContextEngine/Context Freshness when fs
      // is available; the adapter can later delegate to it.
      return ''
    },

    async listCapabilities() {
      const toolsService = get('tools')
      const names = []
      if (Array.isArray(toolsService)) {
        for (const tool of toolsService) {
          if (typeof tool === 'string') names.push(tool)
          else if (tool?.name) names.push(tool.name)
        }
      }
      return names.map((name) => ({ provider: `dsh-tool-${name}`, capabilities: inferCapabilities(name) }))
    },

    subscribeEvents(handler) {
      if (typeof ctx.on !== 'function') return () => {}
      const disposables = []
      const eventTypes = [
        'tool.started', 'tool.completed', 'command.completed', 'test.completed',
        'file.changed', 'approval.requested', 'approval.completed',
        'agent.started', 'agent.completed',
      ]
      for (const type of eventTypes) {
        try {
          const off = ctx.on(type, (payload) => {
            const sessionId = payload?.sessionId || payload?.session?.id || null
            const event = normalizeHostEvent({ ...payload, type }, 'dsh', { sessionId })
            if (event.type === 'file.changed') {
              const next = (revisions.get(sessionId) || 0) + 1
              revisions.set(sessionId, next)
            }
            // Every host event carries the CURRENT session revision so each
            // EvidenceRecord knows which workspace version produced it.
            const current = revisions.get(sessionId) || 0
            event.workspaceRevision = current
            event.hostObserved = true
            // Host-derived provenance: only native command/test events are
            // host-observed deterministic execution. External plugin envelopes
            // carry no authenticated identity here.
            event.provenance = {
              source: 'dsh',
              eventType: event.type,
              provider: null,
              deterministic: event.type === 'command.completed' || event.type === 'test.completed',
            }
            event.revisionTrusted = freshnessAvailable
            event.payload = { ...event.payload, workspaceRevision: current }
            handler(event)
          })
          if (typeof off === 'function') disposables.push(off)
          if (type === 'file.changed') freshnessAvailable = true
        } catch {
          // Some DSH versions do not expose every event name; skip gracefully.
        }
      }
      return () => {
        for (const off of disposables) {
          try { off() } catch { /* already disposed */ }
        }
      }
    },

    async requestApproval(request = {}) {
      return { approved: false, reason: 'DSH approval adapter not configured', request }
    },

    async provisionCapability() {
      return { ok: false, reason: 'DSH provisioning adapter not configured' }
    },

    compileMission(ir = {}) {
      return {
        objective: ir.objective || '',
        steps: (ir.tasks || []).map((task) => ({
          id: task.id,
          role: task.role,
          goal: task.objective,
          dependencies: task.dependencies,
          acceptance: task.acceptance,
        })),
        degraded: false,
      }
    },
  }
}

function inferCapabilities(name = '') {
  const map = {
    read: ['repository.read'],
    glob: ['repository.search'],
    grep: ['repository.search'],
    edit: ['source.write'],
    write: ['source.write'],
    browser_open: ['browser.navigation'],
    browser_screenshot: ['browser.screenshot'],
    browser_click: ['browser.interaction'],
  }
  return map[name] || []
}