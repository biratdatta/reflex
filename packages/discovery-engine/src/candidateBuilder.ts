import type { CapabilityCandidate } from '@reflex/capability-model';
import { scanButtons, type ButtonScanOptions } from './buttonScanner.js';
import { IGNORE_THRESHOLD } from './confidence.js';
import { findFormLikeElements, scanForms } from './formScanner.js';
import { scoreReadiness } from './readiness.js';
import type { ReadinessScore } from '@reflex/capability-model';

export interface DiscoveryOptions extends ButtonScanOptions {
  /** Candidates scoring below this are dropped. Defaults to 50, per the PRD. */
  threshold?: number;
  includeButtons?: boolean;
  includeForms?: boolean;
}

export interface DiscoveryResult {
  candidates: CapabilityCandidate[];
  readiness: ReadinessScore;
}

/**
 * Full page scan: forms first (they claim their own submit buttons), then
 * buttons, then a stable sort so the popup's list order does not jitter
 * between rescans.
 */
export const discoverCapabilities = (root: ParentNode, options: DiscoveryOptions = {}): DiscoveryResult => {
  const threshold = options.threshold ?? IGNORE_THRESHOLD;
  const takenNames = new Set<string>();

  const forms = options.includeForms === false ? [] : findFormLikeElements(root);
  const formCandidates = options.includeForms === false ? [] : scanForms(root, { takenNames });

  const buttonCandidates =
    options.includeButtons === false
      ? []
      : scanButtons(root, { ...options, takenNames, threshold, claimedForms: forms });

  const candidates = [...formCandidates, ...buttonCandidates]
    .filter((candidate) => candidate.confidence >= threshold)
    .sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));

  // De-duplicate identical elements reached by two scanners.
  const seen = new Set<string>();
  const unique = candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });

  return { candidates: unique, readiness: scoreReadiness(root, unique) };
};
