/**
 * Evidence Engine.
 *
 * Single facade over the Evidence Protocol (semantic PASS/FAIL) and the
 * Evidence Store (harness-captured records). The runtime talks to one engine.
 */

import { evidencePass, summarizeEvidence } from './evidence.mjs'
import {
  captureEvidence,
  createEvidenceStore,
  evidenceSummary,
  getEvidence,
  queryEvidence,
} from './evidence-store.mjs'

export function createEvidenceEngine() {
  return {
    store: createEvidenceStore(),
    evaluate: evidencePass,
    summarize: (engine) => evidenceSummary(engine?.store || engine),
  }
}

export {
  captureEvidence,
  evidencePass,
  evidenceSummary,
  getEvidence,
  queryEvidence,
  summarizeEvidence,
}