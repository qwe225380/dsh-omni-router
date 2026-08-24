/**
 * Context Freshness.
 *
 * Context Capsules and evidence records must be bound to a workspace
 * fingerprint. After files change, old context/evidence is stale and cannot be
 * used as reliable input.
 */

import crypto from 'node:crypto'

export function fingerprintText(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 16)
}

export function fingerprintFiles(files = {}) {
  const hash = crypto.createHash('sha1')
  for (const [name, content] of Object.entries(files)) {
    hash.update(name)
    hash.update('\0')
    hash.update(String(content || ''))
    hash.update('\0')
  }
  return hash.digest('hex').slice(0, 24)
}

export function fingerprintWorkspace({ commit = '', files = {} } = {}) {
  return fingerprintText(`${commit || ''}|${fingerprintFiles(files)}`)
}

export function attachFingerprint(context = {}, fingerprint = '') {
  return { ...context, workspaceFingerprint: fingerprint }
}

export function isContextStale(context = {}, currentFingerprint = '') {
  if (!currentFingerprint) return false
  return Boolean(context.workspaceFingerprint && context.workspaceFingerprint !== currentFingerprint)
}