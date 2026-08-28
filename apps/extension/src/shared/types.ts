export type {
  CandidateDecision,
  CandidateOverride,
  CapabilityCandidate,
  ElementFingerprint,
  Evidence,
  ExecutionResult,
  JSONSchema,
  JSONSchemaProperty,
  OriginState,
  PageSnapshot,
  ReadinessScore,
  RiskLevel,
} from '@reflex/capability-model';

export interface ReflexSettings {
  /** Candidates below this score are not shown at all. */
  confidenceThreshold: number;
  /** Ask for confirmation in the page before a destructive tool actuates. */
  confirmDestructive: boolean;
  /** Rescan automatically when the page mutates. */
  autoRescan: boolean;
  /** Show the in-page tool console (stands in for a WebMCP client during a demo). */
  showAgentConsole: boolean;
  /** Install a local WebMCP host when the browser has none. */
  allowShim: boolean;
}

export const DEFAULT_SETTINGS: ReflexSettings = {
  confidenceThreshold: 50,
  confirmDestructive: true,
  autoRescan: true,
  showAgentConsole: true,
  allowShim: true,
};
