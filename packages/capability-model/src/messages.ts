import type { CapabilityCandidate, CandidateOverride, ExecutionResult, OriginState } from './candidate.js';
import type { ReadinessScore } from './readiness.js';

/** Namespaced so page-context messages can never be confused with a host page's own traffic. */
export const REFLEX_CHANNEL = 'reflex/v1';

export interface TriageCounts {
  total: number;
  shown: number;
  hiddenWeak: number;
  hiddenDuplicate: number;
  hiddenUnnameable: number;
}

export interface PageSnapshot {
  origin: string;
  url: string;
  title: string;
  /** What triage judged worth a human decision. */
  candidates: CapabilityCandidate[];
  /** Held back by triage; each carries a suppressedReason. Shown behind "show all". */
  suppressed: CapabilityCandidate[];
  counts: TriageCounts;
  readiness: ReadinessScore;
  scannedAt: number;
  /** Ids currently registered with the page's WebMCP host. */
  activeToolIds: string[];
  webmcpAvailable: boolean;
  webmcpFlavor: string;
  /** The most recent tool call observed on this page, for the popup's activity line. */
  lastInvocation?: { toolName: string; success: boolean; at: number };
}

/** content script <-> popup, over chrome.runtime. */
export type ExtensionMessage =
  | { type: 'REQUEST_SNAPSHOT' }
  | { type: 'RESCAN' }
  | { type: 'APPROVE_CANDIDATE'; candidateId: string; override?: CandidateOverride }
  | { type: 'REJECT_CANDIDATE'; candidateId: string }
  | { type: 'RESET_CANDIDATE'; candidateId: string }
  | { type: 'SET_ORIGIN_ENABLED'; enabled: boolean }
  | { type: 'APPROVE_SAFE_TOOLS' }
  | { type: 'DISABLE_ALL_TOOLS' }
  | { type: 'HIGHLIGHT_CANDIDATE'; candidateId: string }
  | { type: 'SET_BADGE'; count: number };

export type ExtensionResponse =
  | { ok: true; snapshot?: PageSnapshot; state?: OriginState }
  | { ok: false; error: string };

/** Runtime knobs the content script hands to the page runtime. */
export interface RuntimeSettingsPayload {
  confirmDestructive?: boolean;
  showAgentConsole?: boolean;
  allowShim?: boolean;
}

/** content script <-> page runtime, over window.postMessage. */
export type BridgeMessage =
  | {
      channel: typeof REFLEX_CHANNEL;
      direction: 'to-page';
      requestId: string;
      type: 'PING';
      settings?: RuntimeSettingsPayload;
    }
  | {
      channel: typeof REFLEX_CHANNEL;
      direction: 'to-page';
      requestId: string;
      type: 'REGISTER_TOOL';
      payload: CapabilityCandidate;
      settings?: RuntimeSettingsPayload;
    }
  | {
      channel: typeof REFLEX_CHANNEL;
      direction: 'to-page';
      requestId: string;
      type: 'UNREGISTER_TOOL';
      toolId: string;
    }
  | { channel: typeof REFLEX_CHANNEL; direction: 'to-page'; requestId: string; type: 'UNREGISTER_ALL' }
  | {
      channel: typeof REFLEX_CHANNEL;
      direction: 'to-page';
      requestId: string;
      type: 'HIGHLIGHT';
      selector: string;
    };

/** Omit that distributes over a union, so each message keeps its own fields. */
export type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/** A bridge message as callers write it: the envelope is added by the messenger. */
export type BridgeRequest = DistributiveOmit<BridgeMessage, 'channel' | 'direction' | 'requestId'>;

export interface BridgeReply {
  channel: typeof REFLEX_CHANNEL;
  direction: 'to-content';
  requestId: string;
  ok: boolean;
  error?: string;
  activeToolIds?: string[];
  webmcpAvailable?: boolean;
  webmcpFlavor?: string;
}

/** Unsolicited page -> content notifications (tool invocations, host changes). */
export interface BridgeEvent {
  channel: typeof REFLEX_CHANNEL;
  direction: 'to-content';
  /** RUNTIME_READY lets the content script re-handshake if its PING lost the race. */
  event: 'TOOL_INVOKED' | 'TOOLS_CHANGED' | 'RUNTIME_READY';
  toolId?: string;
  toolName?: string;
  result?: ExecutionResult;
  activeToolIds?: string[];
}

export const isBridgeReply = (data: unknown): data is BridgeReply =>
  typeof data === 'object' &&
  data !== null &&
  (data as BridgeReply).channel === REFLEX_CHANNEL &&
  (data as BridgeReply).direction === 'to-content' &&
  typeof (data as BridgeReply).requestId === 'string';

export const isBridgeEvent = (data: unknown): data is BridgeEvent =>
  typeof data === 'object' &&
  data !== null &&
  (data as BridgeEvent).channel === REFLEX_CHANNEL &&
  (data as BridgeEvent).direction === 'to-content' &&
  typeof (data as BridgeEvent).event === 'string';

export const isBridgeMessage = (data: unknown): data is BridgeMessage =>
  typeof data === 'object' &&
  data !== null &&
  (data as BridgeMessage).channel === REFLEX_CHANNEL &&
  (data as BridgeMessage).direction === 'to-page' &&
  typeof (data as BridgeMessage).type === 'string';
