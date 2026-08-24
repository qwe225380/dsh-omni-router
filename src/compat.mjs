/**
 * Compatibility helpers: detect dsh-router-standard / dsh-super-injector and
 * yield reasoning-mode routing to them when present.
 *
 * Omni should not fight another powerful router for the same knob. When
 * router-standard's dev_router_* tools are available, Omni delegates the
 * thinking-mode/persona axis to that plugin and focuses on the control plane:
 * intent, policy, context, skills, methodology, verification, and repair.
 */

export const ROUTER_STANDARD_TOOLS = ['dev_router_status', 'dev_router_mode']

export function isRouterStandardAvailable(tools, scope) {
  if (!tools) return false
  if (typeof tools.get === 'function') {
    try {
      return ROUTER_STANDARD_TOOLS.some((name) => Boolean(tools.get(name, scope)))
    } catch {
      return false
    }
  }
  if (Array.isArray(tools)) {
    return ROUTER_STANDARD_TOOLS.some((name) => tools.includes(name))
  }
  return false
}

export function routerStandardNotice() {
  return 'router-standard detected: reasoning-mode routing is delegated to dev_router_*; Omni focuses on policy, verification, repair, and skill routing.'
}