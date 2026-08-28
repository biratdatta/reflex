import type { CapabilityCandidate } from '@reflex/capability-model';
import { ReflexShimHost } from './shim.js';
import type { MCPAdapter, MCPFlavor, MCPToolDefinition, ModelContextHost } from './types.js';

interface HostLookup {
  host: ModelContextHost;
  flavor: MCPFlavor;
}

const asHost = (value: unknown): ModelContextHost | null => {
  if (!value || typeof value !== 'object') return null;
  const host = value as ModelContextHost;
  return typeof host.registerTool === 'function' || typeof host.provideContext === 'function' ? host : null;
};

/** Probe the surfaces WebMCP prototypes have used, in order of preference. */
export const findNativeHost = (win: Window & typeof globalThis): HostLookup | null => {
  const navigatorHost = asHost((win.navigator as unknown as { modelContext?: unknown })?.modelContext);
  if (navigatorHost) return { host: navigatorHost, flavor: 'navigator.modelContext' };

  const documentHost = asHost((win.document as unknown as { modelContext?: unknown })?.modelContext);
  if (documentHost) return { host: documentHost, flavor: 'document.modelContext' };

  return null;
};

export interface AdapterOptions {
  /** Install the local shim when the browser has no WebMCP host. Default true. */
  installShim?: boolean;
  onToolsChanged?: (activeIds: string[]) => void;
}

export class WebMCPAdapter implements MCPAdapter {
  private readonly win: Window & typeof globalThis;
  private readonly options: AdapterOptions;
  private lookup: HostLookup | null = null;
  /** candidate id -> registered tool + whatever handle the host returned. */
  private readonly registered = new Map<string, { definition: MCPToolDefinition; handle: unknown }>();

  constructor(win: Window & typeof globalThis, options: AdapterOptions = {}) {
    this.win = win;
    this.options = options;
  }

  /** Resolve (and if permitted, create) the host. */
  private resolveHost(): HostLookup | null {
    if (this.lookup) return this.lookup;

    const native = findNativeHost(this.win);
    if (native) {
      this.lookup = native;
      return native;
    }

    if (this.options.installShim === false) return null;

    const shim = new ReflexShimHost();
    try {
      Object.defineProperty(this.win.navigator, 'modelContext', {
        value: shim,
        configurable: true,
        writable: true,
      });
    } catch {
      // Some environments refuse to extend navigator; the shim still works via the alias below.
    }
    Object.defineProperty(this.win, '__reflexModelContext', {
      value: shim,
      configurable: true,
      writable: true,
    });

    this.lookup = { host: shim, flavor: 'reflex-shim' };
    return this.lookup;
  }

  available(): boolean {
    return this.resolveHost() !== null;
  }

  flavor(): MCPFlavor {
    return this.resolveHost()?.flavor ?? 'none';
  }

  /** True when a real browser host is present, i.e. Reflex is not shimming. */
  isNative(): boolean {
    const flavor = this.flavor();
    return flavor === 'navigator.modelContext' || flavor === 'document.modelContext';
  }

  activeIds(): string[] {
    return Array.from(this.registered.keys());
  }

  activeNames(): string[] {
    return Array.from(this.registered.values()).map((entry) => entry.definition.name);
  }

  async register(candidate: CapabilityCandidate, execute: MCPToolDefinition['execute']): Promise<void> {
    const lookup = this.resolveHost();
    if (!lookup) throw new Error('No WebMCP host available on this page');

    // Re-registering the same candidate replaces it, so edits take effect.
    if (this.registered.has(candidate.id)) await this.unregister(candidate.id);

    const definition: MCPToolDefinition = {
      name: candidate.name,
      title: candidate.title,
      description: candidate.description,
      inputSchema: candidate.inputSchema,
      annotations: {
        title: candidate.title,
        readOnlyHint: candidate.risk === 'read',
        destructiveHint: candidate.risk === 'destructive',
      },
      execute,
    };

    let handle: unknown = null;
    if (typeof lookup.host.registerTool === 'function') {
      handle = lookup.host.registerTool(definition);
      this.registered.set(candidate.id, { definition, handle });
    } else {
      this.registered.set(candidate.id, { definition, handle: null });
      await this.provideAll(lookup);
    }

    this.notify();
  }

  async unregister(id: string): Promise<void> {
    const lookup = this.resolveHost();
    const entry = this.registered.get(id);
    if (!lookup || !entry) return;

    this.registered.delete(id);

    const handle = entry.handle;
    if (typeof handle === 'function') {
      (handle as () => void)();
    } else if (handle && typeof (handle as { unregister?: () => void }).unregister === 'function') {
      (handle as { unregister: () => void }).unregister();
    } else if (typeof lookup.host.unregisterTool === 'function') {
      lookup.host.unregisterTool(entry.definition.name);
    } else if (typeof lookup.host.provideContext === 'function') {
      await this.provideAll(lookup);
    }

    this.notify();
  }

  async unregisterAll(): Promise<void> {
    for (const id of this.activeIds()) await this.unregister(id);
    const lookup = this.resolveHost();
    if (lookup && typeof lookup.host.provideContext === 'function' && typeof lookup.host.registerTool !== 'function') {
      lookup.host.provideContext({ tools: [] });
    }
    this.notify();
  }

  /** For hosts that take the whole tool list at once. */
  private async provideAll(lookup: HostLookup): Promise<void> {
    if (typeof lookup.host.provideContext !== 'function') return;
    lookup.host.provideContext({ tools: Array.from(this.registered.values()).map((entry) => entry.definition) });
  }

  private notify(): void {
    this.options.onToolsChanged?.(this.activeIds());
  }
}
