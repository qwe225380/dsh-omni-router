/**
 * DSH Host Adapter.
 *
 * Implements the OmniHost contract for DeepSeek Harness. This is the only
 * place that knows about `ctx`, Cordis, and DSH plugin APIs. The kernel never
 * imports this file.
 */

import { describeHostCapabilities } from '../host-interface.mjs'

export function createDshHostAdapter(ctx = {}) {
  const get = (key) => (typeof ctx.get === 'function' ? ctx.get(key) : undefined) || ctx[key]

  return {
    describeHost() {
      return describeHostCapabilities({
        workflow: !!(get('workflow') || ctx.workflow),
        approvals: !!(get('approvals') || ctx.approvals),
        skills: !!(get('skills') || ctx.skills),
        plugins: !!(get('plugins') || ctx.plugins),
        subagents: !!(get('subagents') || ctx.subagents),
        toolEvents: !!(get('events') || ctx.events),
        testEvents: false,
        fileEvents: !!(get('fs') || ctx.fs),
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

    getWorkspaceFingerprint() {
      // Real fingerprinting is done by ContextEngine/Context Freshness when fs
      // is available; the adapter can later delegate to it.
      return ''
    },

    async listCapabilities() {
      const toolsService = get('tools') || ctx.tools
      const names = []
      if (Array.isArray(toolsService)) {
        for (const tool of toolsService) {
          if (typeof tool === 'string') names.push(tool)
          else if (tool?.name) names.push(tool.name)
        }
      }
      return names.map((name) => ({ provider: `dsh-tool-${name}`, capabilities: inferCapabilities(name) }))
    },

    subscribeEvents() {
      // DSH event subscription is wired in the plugin entry; kept as a stub
      // here so the interface is complete.
      return () => {}
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