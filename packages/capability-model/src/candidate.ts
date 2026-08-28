import type { JSONSchema } from './schema.js';

export type CapabilitySource = 'form' | 'button' | 'link';

export type RiskLevel = 'read' | 'write' | 'sensitive' | 'destructive';

export type EvidenceType =
  | 'aria-label'
  | 'aria-description'
  | 'aria-describedby'
  | 'aria-labelledby'
  | 'label'
  | 'button-text'
  | 'form'
  | 'input'
  | 'heading'
  | 'role';

export interface Evidence {
  type: EvidenceType;
  value: string;
  /** Optional pointer at where the evidence came from, e.g. `#employee-search`. */
  origin?: string;
}

/**
 * A semantic fingerprint of the target element, captured at discovery time.
 * Re-verified immediately before execution so a changed DOM fails closed
 * instead of actuating the wrong control.
 */
export interface ElementFingerprint {
  tag: string;
  role?: string;
  ariaLabel?: string;
  text?: string;
  name?: string;
  /** Names of the fields a form candidate expects to populate. */
  fieldNames?: string[];
}

export interface CapabilityCandidate {
  /** Stable across rescans of an unchanged page: hash of selector + fingerprint. */
  id: string;
  source: CapabilitySource;
  elementSelector: string;
  fingerprint: ElementFingerprint;
  name: string;
  title: string;
  description: string;
  inputSchema: JSONSchema;
  /** 0–100 heuristic score. See discovery-engine/confidence.ts. */
  confidence: number;
  risk: RiskLevel;
  evidence: Evidence[];
  /**
   * Region whose text is returned to the agent after execution, when the page
   * points at one (aria-controls, a live region, or a marked result container).
   * Without it a read-only tool could only report "submitted".
   */
  resultSelector?: string;
  /** Set when the candidate was scored below the ignore threshold or matched an ignore rule. */
  suppressed?: boolean;
  suppressedReason?: string;
}

/** User decisions, persisted per origin in chrome.storage.local. */
export type CandidateDecision = 'approved' | 'rejected' | 'undecided';

/** A user's edits to generated metadata, keyed by candidate id. */
export interface CandidateOverride {
  name?: string;
  description?: string;
  risk?: RiskLevel;
}

export interface OriginState {
  enabled: boolean;
  approvedTools: string[];
  rejectedTools: string[];
  overrides: Record<string, CandidateOverride>;
}

export const emptyOriginState = (): OriginState => ({
  enabled: true,
  approvedTools: [],
  rejectedTools: [],
  overrides: {},
});

/** Result shape returned to the agent from a tool execution. */
export interface ExecutionResult {
  success: boolean;
  action: string;
  detail?: string;
  error?: string;
  /** Snapshot of what changed on the page, when cheaply observable. */
  observed?: Record<string, unknown>;
}

export const RISK_ORDER: RiskLevel[] = ['read', 'write', 'sensitive', 'destructive'];

export const isAutoApprovable = (risk: RiskLevel): boolean => risk === 'read';
