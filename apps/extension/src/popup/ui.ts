import type { CapabilityCandidate, RiskLevel } from '@reflex/capability-model';

export const RISK_ORDER: RiskLevel[] = ['read', 'write', 'sensitive', 'destructive'];

export const RISK_LABEL: Record<RiskLevel, string> = {
  read: 'read',
  write: 'write',
  sensitive: 'sensitive',
  destructive: 'destructive',
};

export const RISK_NOTE: Record<RiskLevel, string> = {
  read: 'Reads what the page already shows. Nothing changes.',
  write: 'Changes data in this application.',
  sensitive: 'Moves money, credentials, permissions, or sends something outward.',
  destructive: 'Removes access or data. Reflex will ask you again, in the page, on every call.',
};

export const confidenceLabel = (score: number): string => {
  if (score >= 90) return 'high confidence';
  if (score >= 75) return 'review recommended';
  return 'low confidence';
};

export type CandidateStatus = 'approved' | 'rejected' | 'undecided';

export const statusGlyph: Record<CandidateStatus, string> = {
  approved: '✓',
  rejected: '✕',
  undecided: '○',
};

/** Group by risk, keeping read → destructive order and dropping empty groups. */
export const groupByRisk = (candidates: CapabilityCandidate[]): Array<[RiskLevel, CapabilityCandidate[]]> =>
  RISK_ORDER.map(
    (risk) => [risk, candidates.filter((candidate) => candidate.risk === risk)] as [RiskLevel, CapabilityCandidate[]],
  ).filter(([, group]) => group.length > 0);

export const percent = (ratio: number): string => `${Math.round(ratio * 100)}%`;

export const relativeTime = (timestamp: number): string => {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
};

/** Match a typed filter against everything a reviewer might search by. */
export const matchesFilter = (candidate: CapabilityCandidate, filter: string): boolean => {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return (
    candidate.name.toLowerCase().includes(needle) ||
    candidate.title.toLowerCase().includes(needle) ||
    candidate.description.toLowerCase().includes(needle) ||
    candidate.risk.includes(needle) ||
    Object.keys(candidate.inputSchema.properties).some((key) => key.toLowerCase().includes(needle))
  );
};

/** One line describing a candidate's shape, for the row's second line. */
export const shapeOf = (candidate: CapabilityCandidate): string => {
  const keys = Object.keys(candidate.inputSchema.properties);
  if (!keys.length) return 'no arguments';
  const required = new Set(candidate.inputSchema.required ?? []);
  return keys
    .slice(0, 3)
    .map((key) => `${key}${required.has(key) ? '*' : ''}`)
    .join(' · ')
    .concat(keys.length > 3 ? ` +${keys.length - 3}` : '');
};
