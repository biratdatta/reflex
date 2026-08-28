import {
  REFLEX_CHANNEL,
  isBridgeMessage,
  type BridgeEvent,
  type BridgeReply,
  type CapabilityCandidate,
} from '@reflex/capability-model';
import { WebMCPAdapter, executeCandidate, toToolResponse } from '@reflex/webmcp-adapter';
import { mountAgentConsole, type AgentConsole } from './agentConsole.js';
import { highlight } from './highlight.js';

/**
 * Runs in the page's own JavaScript world, which is the only place that can
 * reach document/navigator.modelContext and dispatch events a framework will
 * believe. It holds no discovery logic: the content script decides what exists,
 * this decides nothing and only does what it is told.
 */

declare global {
  interface Window {
    __reflexRuntimeReady?: boolean;
  }
}

interface RuntimeSettings {
  confirmDestructive: boolean;
  showAgentConsole: boolean;
  allowShim: boolean;
}

const settings: RuntimeSettings = { confirmDestructive: true, showAgentConsole: true, allowShim: true };

/** Registered candidates, by id, so the console and re-registration can find them. */
const registry = new Map<string, CapabilityCandidate>();

let adapter: WebMCPAdapter | null = null;
let console_: AgentConsole | null = null;

const post = (payload: BridgeReply | BridgeEvent): void => {
  window.postMessage(payload, window.location.origin === 'null' ? '*' : window.location.origin);
};

const notifyToolsChanged = (): void => {
  post({
    channel: REFLEX_CHANNEL,
    direction: 'to-content',
    event: 'TOOLS_CHANGED',
    activeToolIds: adapter?.activeIds() ?? [],
  });
  renderConsole();
};

const getAdapter = (): WebMCPAdapter => {
  if (!adapter) {
    adapter = new WebMCPAdapter(window, {
      installShim: settings.allowShim,
      onToolsChanged: () => renderConsole(),
    });
  }
  return adapter;
};

const renderConsole = (): void => {
  if (!settings.showAgentConsole) {
    console_?.destroy();
    console_ = null;
    return;
  }
  const active = (adapter?.activeIds() ?? [])
    .map((id) => registry.get(id))
    .filter((candidate): candidate is CapabilityCandidate => Boolean(candidate));
  if (!console_) {
    console_ = mountAgentConsole({
      invoke: (candidateId, input) => invoke(candidateId, input),
      flavor: () => getAdapter().flavor(),
      isNative: () => getAdapter().isNative(),
    });
  }
  console_.update(active);
};

/** The single path from a tool call to the DOM. */
const invoke = async (candidateId: string, input: Record<string, unknown>) => {
  const candidate = registry.get(candidateId);
  if (!candidate) {
    return { success: false, action: candidateId, error: 'Tool is no longer registered' };
  }

  const result = await executeCandidate(document, candidate, input, {
    confirm: settings.confirmDestructive
      ? (target) =>
          window.confirm(
            `Reflex — human approval required\n\n` +
              `An agent is asking to run a destructive tool on this page:\n\n` +
              `  ${target.name}\n  ${target.description}\n\n` +
              `Allow it?`,
          )
      : undefined,
  });

  post({
    channel: REFLEX_CHANNEL,
    direction: 'to-content',
    event: 'TOOL_INVOKED',
    toolId: candidate.id,
    toolName: candidate.name,
    result,
  });
  // Deliberately no re-render here: the caller has not recorded the result yet,
  // and rebuilding the console now would throw away what it is about to show.
  // Tool-set changes re-render through notifyToolsChanged instead.
  return result;
};

const register = async (candidate: CapabilityCandidate): Promise<void> => {
  registry.set(candidate.id, candidate);
  await getAdapter().register(candidate, async (input) => toToolResponse(await invoke(candidate.id, input)));
};

const unregister = async (candidateId: string): Promise<void> => {
  await getAdapter().unregister(candidateId);
  registry.delete(candidateId);
};

const unregisterAll = async (): Promise<void> => {
  await getAdapter().unregisterAll();
  registry.clear();
};

const reply = (requestId: string, extra: Partial<BridgeReply> = {}): void => {
  post({
    channel: REFLEX_CHANNEL,
    direction: 'to-content',
    requestId,
    ok: true,
    activeToolIds: adapter?.activeIds() ?? [],
    webmcpAvailable: Boolean(adapter?.available()),
    webmcpFlavor: adapter?.flavor() ?? 'none',
    ...extra,
  });
};

const fail = (requestId: string, error: string): void => {
  post({ channel: REFLEX_CHANNEL, direction: 'to-content', requestId, ok: false, error });
};

const listen = (): void =>
  window.addEventListener('message', (event) => {
  // Only same-window traffic on Reflex's own channel.
  if (event.source !== window) return;
  const data = event.data as unknown;
  if (!isBridgeMessage(data)) return;

  void (async () => {
    try {
      switch (data.type) {
        case 'PING': {
          if (data.settings) Object.assign(settings, data.settings);
          getAdapter();
          renderConsole();
          reply(data.requestId);
          return;
        }
        case 'REGISTER_TOOL': {
          if (data.settings) Object.assign(settings, data.settings);
          await register(data.payload);
          notifyToolsChanged();
          reply(data.requestId);
          return;
        }
        case 'UNREGISTER_TOOL': {
          await unregister(data.toolId);
          notifyToolsChanged();
          reply(data.requestId);
          return;
        }
        case 'UNREGISTER_ALL': {
          await unregisterAll();
          notifyToolsChanged();
          reply(data.requestId);
          return;
        }
        case 'HIGHLIGHT': {
          highlight(document, data.selector);
          reply(data.requestId);
          return;
        }
        default:
          fail((data as { requestId: string }).requestId, 'Unknown message');
      }
    } catch (error) {
      fail(data.requestId, error instanceof Error ? error.message : String(error));
    }
  })();
  });

/**
 * Exactly one runtime per page. A second injection must not attach a second
 * message listener: two registries would each register the same approved tool,
 * and each would execute it.
 */
if (!window.__reflexRuntimeReady) {
  window.__reflexRuntimeReady = true;
  listen();
  // Stand the host and the console up on defaults, then announce readiness: the
  // content script may have been injected first and lost its PING.
  getAdapter();
  renderConsole();
  post({ channel: REFLEX_CHANNEL, direction: 'to-content', event: 'RUNTIME_READY', activeToolIds: [] });
}
