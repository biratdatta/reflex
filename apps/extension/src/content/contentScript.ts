import type {
  CapabilityCandidate,
  ExtensionMessage,
  ExtensionResponse,
  OriginState,
  PageSnapshot,
} from '@reflex/capability-model';
import { isAutoApprovable } from '@reflex/capability-model';
import {
  approveCandidate,
  getOriginState,
  getSettings,
  rejectCandidate,
  resetCandidate,
  updateOriginState,
} from '../shared/storage.js';
import type { ReflexSettings } from '../shared/types.js';
import { BridgeMessenger } from './bridgeMessenger.js';
import { diffIds, scanPage, withOverride } from './discovery.js';

/**
 * The content script owns discovery and the user's decisions. It never touches
 * WebMCP: everything that has to run in the page's own world goes through the
 * bridge to the page runtime.
 */

declare global {
  interface Window {
    __reflexContentReady?: boolean;
  }
}

const MUTATION_DEBOUNCE_MS = 500;

const origin = window.location.origin;
const bridge = new BridgeMessenger();

let settings: ReflexSettings | null = null;
let state: OriginState | null = null;
let candidates: CapabilityCandidate[] = [];
/** Held back by triage. Approvable, but only from the popup's "show all" view. */
let suppressed: CapabilityCandidate[] = [];
let counts: PageSnapshot['counts'] = { total: 0, shown: 0, hiddenWeak: 0, hiddenDuplicate: 0, hiddenUnnameable: 0 };
let readiness = { score: 0, breakdown: {}, counts: {} } as PageSnapshot['readiness'];
let activeToolIds: string[] = [];
let webmcp = { available: false, flavor: 'none' };
let scannedAt = 0;
let lastInvocation: { toolName: string; success: boolean; at: number } | null = null;

const currentSettings = async (): Promise<ReflexSettings> => {
  if (!settings) settings = await getSettings();
  return settings;
};

const currentState = async (): Promise<OriginState> => {
  if (!state) state = await getOriginState(origin);
  return state;
};

const runtimeSettings = (config: ReflexSettings) => ({
  confirmDestructive: config.confirmDestructive,
  showAgentConsole: config.showAgentConsole,
  allowShim: config.allowShim,
});

const rescan = async (): Promise<void> => {
  const config = await currentSettings();
  const originState = await currentState();
  const result = scanPage(config.confidenceThreshold, originState);
  candidates = result.candidates;
  suppressed = result.suppressed;
  counts = result.counts;
  readiness = result.readiness;
  scannedAt = Date.now();
};

/** Anything the user could act on, whether triage surfaced it or not. */
const findCandidate = (candidateId: string): CapabilityCandidate | undefined =>
  candidates.find((entry) => entry.id === candidateId) ??
  suppressed.find((entry) => entry.id === candidateId);

const snapshot = (): PageSnapshot => ({
  origin,
  url: window.location.href,
  title: document.title,
  candidates,
  suppressed,
  counts,
  readiness,
  scannedAt,
  activeToolIds,
  webmcpAvailable: webmcp.available,
  webmcpFlavor: webmcp.flavor,
  lastInvocation: lastInvocation ?? undefined,
});

const setBadge = (): void => {
  void chrome.runtime.sendMessage({ type: 'SET_BADGE', count: activeToolIds.length }).catch(() => {
    /* the service worker may be asleep; the badge is cosmetic */
  });
};

/** Push one approved candidate into the page world. */
const registerTool = async (candidate: CapabilityCandidate): Promise<void> => {
  const config = await currentSettings();
  const reply = await bridge.send({
    type: 'REGISTER_TOOL',
    payload: candidate,
    settings: runtimeSettings(config),
  });
  if (!reply.ok) throw new Error(reply.error ?? 'Registration failed');
  activeToolIds = reply.activeToolIds ?? activeToolIds;
  webmcp = { available: Boolean(reply.webmcpAvailable), flavor: reply.webmcpFlavor ?? 'none' };
  setBadge();
};

const unregisterTool = async (candidateId: string): Promise<void> => {
  const reply = await bridge.send({ type: 'UNREGISTER_TOOL', toolId: candidateId });
  activeToolIds = reply.activeToolIds ?? activeToolIds.filter((id) => id !== candidateId);
  setBadge();
};

const unregisterAll = async (): Promise<void> => {
  const reply = await bridge.send({ type: 'UNREGISTER_ALL' });
  activeToolIds = reply.activeToolIds ?? [];
  setBadge();
};

/**
 * Bring the page's registered tools in line with the approved set: register what
 * is approved and present, and withdraw anything whose element has gone.
 */
const syncTools = async (): Promise<void> => {
  const originState = await currentState();
  if (!originState.enabled) {
    await unregisterAll();
    return;
  }

  const approved = [...candidates, ...suppressed].filter((candidate) =>
    originState.approvedTools.includes(candidate.id),
  );
  const { added, removed } = diffIds(activeToolIds, approved.map((candidate) => candidate.id));

  for (const id of removed) await unregisterTool(id);
  for (const id of added) {
    const candidate = approved.find((entry) => entry.id === id);
    if (candidate) await registerTool(candidate);
  }
};

/**
 * Injection order is not guaranteed, so a PING can arrive before the page
 * runtime is listening. Retry briefly, and RUNTIME_READY covers the rest.
 */
const handshake = async (attempts = 3): Promise<boolean> => {
  const config = await currentSettings();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const reply = await bridge.send({ type: 'PING', settings: runtimeSettings(config) }, 400);
      webmcp = { available: Boolean(reply.webmcpAvailable), flavor: reply.webmcpFlavor ?? 'none' };
      activeToolIds = reply.activeToolIds ?? [];
      return true;
    } catch {
      /* try again */
    }
  }
  webmcp = { available: false, flavor: 'none' };
  return false;
};

const subscribeToPageEvents = (): void => {
  bridge.onEvent((event) => {
  if (event.event === 'RUNTIME_READY') {
    // The page runtime came up (possibly after us). Re-introduce ourselves.
    void (async () => {
      await handshake(1);
      await syncTools();
    })();
    return;
  }
  if (event.event === 'TOOLS_CHANGED' && event.activeToolIds) {
    activeToolIds = event.activeToolIds;
    setBadge();
  }
  if (event.event === 'TOOL_INVOKED' && event.toolName) {
    lastInvocation = { toolName: event.toolName, success: Boolean(event.result?.success), at: Date.now() };
    // A write tool changes the page, so what is discoverable may have changed too.
    scheduleRescan();
  }
  });
};

let rescanTimer: number | undefined;
const scheduleRescan = (): void => {
  window.clearTimeout(rescanTimer);
  rescanTimer = window.setTimeout(() => {
    void (async () => {
      const config = await currentSettings();
      if (!config.autoRescan) return;
      await rescan();
      await syncTools();
    })();
  }, MUTATION_DEBOUNCE_MS);
};

/**
 * Pages change under their own steam. Rescans are debounced, and Reflex's own
 * overlay is ignored so the console cannot trigger a rescan of itself.
 */
const observer = new MutationObserver((records) => {
  const meaningful = records.some((record) => {
    const target = record.target as Element;
    if (target.nodeType === Node.ELEMENT_NODE && target.closest?.('#reflex-agent-console')) return false;
    if (record.type === 'attributes') {
      return ['aria-label', 'aria-description', 'aria-describedby', 'disabled', 'hidden', 'role'].includes(
        record.attributeName ?? '',
      );
    }
    return record.addedNodes.length > 0 || record.removedNodes.length > 0;
  });
  if (meaningful) scheduleRescan();
});

const respond = async (message: ExtensionMessage): Promise<ExtensionResponse> => {
  const originState = await currentState();

  switch (message.type) {
    case 'REQUEST_SNAPSHOT': {
      if (!scannedAt) await rescan();
      return { ok: true, snapshot: snapshot(), state: originState };
    }

    case 'RESCAN': {
      await rescan();
      await syncTools();
      return { ok: true, snapshot: snapshot(), state: await currentState() };
    }

    case 'APPROVE_CANDIDATE': {
      const candidate = findCandidate(message.candidateId);
      if (!candidate) return { ok: false, error: 'That capability is no longer on the page' };

      state = await updateOriginState(origin, (current) =>
        approveCandidate(current, message.candidateId, message.override),
      );
      // Apply edits immediately, so what registers is what the reviewer saw.
      const edited = withOverride(candidate, state.overrides[candidate.id]);
      candidates = candidates.map((entry) => (entry.id === edited.id ? edited : entry));
      suppressed = suppressed.map((entry) => (entry.id === edited.id ? edited : entry));
      await registerTool(edited);
      return { ok: true, snapshot: snapshot(), state };
    }

    case 'REJECT_CANDIDATE': {
      state = await updateOriginState(origin, (current) => rejectCandidate(current, message.candidateId));
      await unregisterTool(message.candidateId);
      return { ok: true, snapshot: snapshot(), state };
    }

    case 'RESET_CANDIDATE': {
      state = await updateOriginState(origin, (current) => resetCandidate(current, message.candidateId));
      await unregisterTool(message.candidateId);
      await rescan();
      return { ok: true, snapshot: snapshot(), state };
    }

    case 'SET_ORIGIN_ENABLED': {
      state = await updateOriginState(origin, (current) => ({ ...current, enabled: message.enabled }));
      if (!message.enabled) await unregisterAll();
      else await syncTools();
      return { ok: true, snapshot: snapshot(), state };
    }

    case 'APPROVE_SAFE_TOOLS': {
      // Read-only capabilities only. Write, sensitive and destructive tools
      // always need an explicit, individual decision.
      const safe = candidates.filter((candidate) => isAutoApprovable(candidate.risk));
      state = await updateOriginState(origin, (current) =>
        safe.reduce((acc, candidate) => approveCandidate(acc, candidate.id), current),
      );
      await syncTools();
      return { ok: true, snapshot: snapshot(), state };
    }

    case 'DISABLE_ALL_TOOLS': {
      state = await updateOriginState(origin, (current) => ({ ...current, approvedTools: [] }));
      await unregisterAll();
      return { ok: true, snapshot: snapshot(), state };
    }

    case 'HIGHLIGHT_CANDIDATE': {
      const candidate = findCandidate(message.candidateId);
      if (!candidate) return { ok: false, error: 'That capability is no longer on the page' };
      await bridge.send({ type: 'HIGHLIGHT', selector: candidate.elementSelector });
      return { ok: true, snapshot: snapshot(), state: originState };
    }

    default:
      return { ok: false, error: 'Unknown message' };
  }
};

if (!window.__reflexContentReady) {
  window.__reflexContentReady = true;
  subscribeToPageEvents();

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    respond(message)
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      );
    return true; // async response
  });

  chrome.storage.onChanged.addListener(() => {
    // Settings or approvals may have been changed from the popup or another tab.
    settings = null;
    state = null;
    void (async () => {
      await rescan();
      await syncTools();
    })();
  });

  void (async () => {
    await handshake();
    await rescan();
    await syncTools();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'aria-description', 'aria-describedby', 'disabled', 'hidden', 'role'],
    });
    setBadge();
  })();

  // Registered tools cannot survive a navigation; the fresh page re-registers.
  window.addEventListener('pagehide', () => {
    void unregisterAll();
  });
}
