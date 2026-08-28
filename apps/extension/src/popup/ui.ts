import type { CapabilityCandidate, RiskLevel } from '@reflex/capability-model';

export const RISK_ORDER: RiskLevel[] = ['read', 'write', 'sensitive', 'destructive'];

export const RISK_LABEL: Record<RiskLevel, string> = {
  read: 'Read',
  write: 'Write',
  sensitive: 'Sensitive',
  destructive: 'Destructive',
};

export const RISK_NOTE: Record<RiskLevel, string> = {
  read: 'Reads what the page already shows.',
  write: 'Changes data in this application.',
  sensitive: 'Touches credentials, roles, money or outbound messages.',
  destructive: 'Removes access or data. Human approval required.',
};

export const confidenceLabel = (score: number): string => {
  if (score >= 90) return 'High confidence';
  if (score >= 75) return 'Review recommended';
  return 'Low confidence';
};

export type CandidateStatus = 'approved' | 'rejected' | 'undecided';

export const statusGlyph: Record<CandidateStatus, string> = {
  approved: '✓',
  rejected: '✕',
  undecided: '○',
};

/** Group candidates by risk, keeping the read → destructive order. */
export const groupByRisk = (candidates: CapabilityCandidate[]): Array<[RiskLevel, CapabilityCandidate[]]> =>
  RISK_ORDER.map(
    (risk) => [risk, candidates.filter((candidate) => candidate.risk === risk)] as [RiskLevel, CapabilityCandidate[]],
  ).filter(([, group]) => group.length > 0);

export const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export const relativeTime = (timestamp: number): string => {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
};
