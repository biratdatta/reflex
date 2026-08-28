import { discoverCapabilities, type DiscoveryResult } from '@reflex/discovery-engine';
import type {
  CandidateOverride,
  CapabilityCandidate,
  OriginState,
  ReadinessScore,
  TriageCounts,
} from '@reflex/capability-model';

export interface ScanOutput {
  candidates: CapabilityCandidate[];
  suppressed: CapabilityCandidate[];
  counts: TriageCounts;
  readiness: ReadinessScore;
}

/** Apply the user's edits to a freshly discovered candidate. */
export const withOverride = (
  candidate: CapabilityCandidate,
  override: CandidateOverride | undefined,
): CapabilityCandidate => {
  if (!override) return candidate;
  return {
    ...candidate,
    name: override.name?.trim() || candidate.name,
    description: override.description?.trim() || candidate.description,
    risk: override.risk ?? candidate.risk,
  };
};

export const scanPage = (threshold: number, state: OriginState): ScanOutput => {
  const result: DiscoveryResult = discoverCapabilities(document, { threshold });
  const applyOverrides = (list: CapabilityCandidate[]) =>
    list.map((candidate) => withOverride(candidate, state.overrides[candidate.id]));
  return {
    candidates: applyOverrides(result.candidates),
    suppressed: applyOverrides(result.suppressed),
    counts: result.counts,
    readiness: result.readiness,
  };
};

/** Ids present in `next` but not `previous`, and vice versa. */
export const diffIds = (previous: string[], next: string[]) => ({
  added: next.filter((id) => !previous.includes(id)),
  removed: previous.filter((id) => !next.includes(id)),
});
