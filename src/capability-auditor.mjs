/**
 * Capability Auditor.
 *
 * Answers "what does the current Harness environment lack?" for both a
 * baseline (first-run / after DSH update) and a specific task. It is the
 * front door of the Capability Auto-Provisioning loop.
 */

export const OMNI_CODING_BASELINE = [
  'repository.read',
  'repository.search',
  'source.write',
  'shell',
  'test.run',
  'debugging',
  'verification',
  'code.review',
  'git.workflow',
]

const SEVERITY = {
  'repository.read': 'high',
  'repository.search': 'high',
  'source.write': 'high',
  'shell': 'high',
  'test.run': 'high',
  'debugging': 'high',
  'verification': 'high',
  'code.review': 'medium',
  'git.workflow': 'medium',
  'browser.navigation': 'medium',
  'browser.interaction': 'medium',
  'browser.screenshot': 'medium',
  'frontend.validation': 'medium',
  'github.remote': 'medium',
  'gitlab.remote': 'medium',
  'db.inspection': 'low',
  'container.run': 'low',
  'security.review': 'medium',
  'performance.analysis': 'low',
}

export function severityForCapability(capability) {
  return SEVERITY[capability] || 'low'
}

export function auditCapabilities(brain, required = []) {
  const availableSet = new Set()
  for (const provider of brain?.capabilities || []) {
    for (const cap of provider.capabilities || []) availableSet.add(cap)
  }
  const requiredList = [...new Set(required.map((c) => String(c).trim()).filter(Boolean))]
  const available = requiredList.filter((c) => availableSet.has(c))
  const missing = requiredList.filter((c) => !availableSet.has(c))
  return {
    required: requiredList,
    available,
    missing,
    coverage: requiredList.length ? Math.round((available.length / requiredList.length) * 1000) / 1000 : 1,
    gaps: missing.map((capability) => ({
      capability,
      severity: severityForCapability(capability),
    })),
  }
}

export function baselineAudit(brain, baseline = OMNI_CODING_BASELINE) {
  return auditCapabilities(brain, baseline)
}

export function taskTimeAudit(brain, requirements = []) {
  return auditCapabilities(brain, requirements)
}

export function formatCapabilityAudit(audit = {}) {
  const lines = [
    `Capability audit: ${audit.available?.length || 0}/${audit.required?.length || 0} available (coverage ${audit.coverage ?? 0})`,
  ]
  if (audit.required?.length) lines.push(`Required: ${audit.required.join(', ')}`)
  if (audit.available?.length) lines.push(`Available: ${audit.available.join(', ')}`)
  if (audit.missing?.length) {
    lines.push(`Missing (${audit.missing.length}):`)
    for (const gap of audit.gaps || []) {
      lines.push(`- ${gap.capability} [${gap.severity}]`)
    }
  } else {
    lines.push('No missing capabilities.')
  }
  return lines.join('\n')
}