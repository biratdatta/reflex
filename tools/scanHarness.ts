import { discoverCapabilities } from '@reflex/discovery-engine';

/**
 * Bundled into a single script that can be injected into any page, so the real
 * discovery engine can be pointed at a live site without installing the
 * extension. Used by tools/scan-site.mjs.
 */
declare global {
  interface Window {
    __reflexScan: (threshold?: number) => unknown;
  }
}

window.__reflexScan = (threshold = 50) => {
  const { candidates, suppressed, readiness, counts } = discoverCapabilities(document, { threshold });
  return {
    readiness,
    counts,
    suppressedSample: suppressed.slice(0, 6).map((candidate) => ({
      name: candidate.name,
      confidence: candidate.confidence,
      reason: candidate.suppressedReason,
    })),
    candidates: candidates.map((candidate) => ({
      name: candidate.name,
      title: candidate.title,
      risk: candidate.risk,
      confidence: candidate.confidence,
      source: candidate.source,
      parameters: Object.keys(candidate.inputSchema.properties),
      description: candidate.description,
      selector: candidate.elementSelector,
      duplicateCount: candidate.duplicateCount,
      confidenceReasons: candidate.confidenceReasons,
    })),
  };
};
