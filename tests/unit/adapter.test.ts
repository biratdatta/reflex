import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scanForm } from '@reflex/discovery-engine';
import { ReflexShimHost, WebMCPAdapter, findNativeHost, type MCPToolDefinition } from '@reflex/webmcp-adapter';
import { el, mount } from './helpers.js';

const candidateFrom = (html: string) => {
  mount(html);
  return scanForm(el('form'))!;
};

const SEARCH = `
  <form id="employee-search" aria-label="Search employees" aria-description="Find an employee by name or email">
    <label for="q">Employee name or email</label>
    <input id="q" name="query" required>
    <button type="submit">Search</button>
  </form>
`;

const DEACTIVATE = `
  <form id="deactivate" aria-label="Deactivate employee" aria-description="Prevents this employee from signing in">
    <label for="c">Confirm employee id</label><input id="c" name="employeeId" required>
    <button type="submit">Deactivate</button>
  </form>
`;

const noop = async () => ({ content: [{ type: 'text' as const, text: 'ok' }] });

/** A host that only supports the whole-list API. */
class ProvideOnlyHost {
  tools: MCPToolDefinition[] = [];
  provideContext = (context: { tools: MCPToolDefinition[] }) => {
    this.tools = context.tools;
  };
}

describe('findNativeHost', () => {
  beforeEach(() => {
    delete (window.navigator as { modelContext?: unknown }).modelContext;
    delete (window.document as { modelContext?: unknown }).modelContext;
  });

  it('finds nothing on a plain page', () => {
    expect(findNativeHost(window)).toBeNull();
  });

  it('prefers navigator.modelContext', () => {
    Object.defineProperty(window.navigator, 'modelContext', { value: { registerTool: () => {} }, configurable: true });
    expect(findNativeHost(window)?.flavor).toBe('navigator.modelContext');
  });

  it('accepts document.modelContext', () => {
    Object.defineProperty(window.document, 'modelContext', { value: { provideContext: () => {} }, configurable: true });
    expect(findNativeHost(window)?.flavor).toBe('document.modelContext');
  });

  it('ignores an object that implements neither API', () => {
    Object.defineProperty(window.navigator, 'modelContext', { value: { somethingElse: true }, configurable: true });
    expect(findNativeHost(window)).toBeNull();
  });
});

describe('WebMCPAdapter with no browser host', () => {
  beforeEach(() => {
    // Reflex installs its shim on both surfaces, so both must be cleared.
    delete (window.navigator as { modelContext?: unknown }).modelContext;
    delete (window.document as { modelContext?: unknown }).modelContext;
  });

  it('reports unavailable when shimming is switched off', () => {
    const adapter = new WebMCPAdapter(window, { installShim: false });
    expect(adapter.available()).toBe(false);
    expect(adapter.flavor()).toBe('none');
  });

  it('exposes the shim as both document.modelContext and navigator.modelContext', () => {
    delete (window.navigator as { modelContext?: unknown }).modelContext;
    delete (window.document as { modelContext?: unknown }).modelContext;
    const adapter = new WebMCPAdapter(window);
    expect(adapter.available()).toBe(true);

    // The canonical WebMCP example calls document.modelContext.registerTool(...);
    // the prototypes we have seen use navigator. Both must find the same host.
    const viaDocument = (window.document as unknown as { modelContext: ReflexShimHost }).modelContext;
    const viaNavigator = (window.navigator as unknown as { modelContext: ReflexShimHost }).modelContext;
    expect(viaDocument).toBe(viaNavigator);
    expect(typeof viaDocument.registerTool).toBe('function');
  });

  it('registers through document.modelContext.registerTool, the documented surface', async () => {
    delete (window.navigator as { modelContext?: unknown }).modelContext;
    delete (window.document as { modelContext?: unknown }).modelContext;
    const adapter = new WebMCPAdapter(window);
    const search = candidateFrom(SEARCH);
    await adapter.register(search, noop);

    const host = (window.document as unknown as { modelContext: ReflexShimHost }).modelContext;
    const [tool] = host.listTools();
    expect(tool).toMatchObject({ name: 'search_employees', description: 'Find an employee by name or email.' });
    expect(typeof tool.execute).toBe('function');
    expect(tool.inputSchema.properties.query).toBeDefined();
  });

  it('installs the shim, clearly marked as not native', () => {
    const adapter = new WebMCPAdapter(window);
    expect(adapter.available()).toBe(true);
    expect(adapter.flavor()).toBe('reflex-shim');
    expect(adapter.isNative()).toBe(false);
    expect((window.navigator as { modelContext?: { __reflexShim?: boolean } }).modelContext?.__reflexShim).toBe(true);
  });

  it('rejects registration when there is no host at all', async () => {
    const adapter = new WebMCPAdapter(window, { installShim: false });
    await expect(adapter.register(candidateFrom(SEARCH), noop)).rejects.toThrow('No WebMCP host available');
  });
});

describe('WebMCPAdapter registration', () => {
  beforeEach(() => {
    delete (window.navigator as { modelContext?: unknown }).modelContext;
    delete (window.document as { modelContext?: unknown }).modelContext;
  });

  it('registers a candidate as a tool with risk-derived annotations', async () => {
    const adapter = new WebMCPAdapter(window);
    const search = candidateFrom(SEARCH);
    await adapter.register(search, noop);

    const host = (window.navigator as unknown as { modelContext: ReflexShimHost }).modelContext;
    const [tool] = host.listTools();
    expect(tool).toMatchObject({
      name: 'search_employees',
      title: 'Search employees',
      description: 'Find an employee by name or email.',
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    expect(tool.inputSchema.properties.query).toBeDefined();
    expect(adapter.activeIds()).toEqual([search.id]);
  });

  it('marks a destructive candidate with destructiveHint', async () => {
    const adapter = new WebMCPAdapter(window);
    await adapter.register(candidateFrom(DEACTIVATE), noop);
    const host = (window.navigator as unknown as { modelContext: ReflexShimHost }).modelContext;
    expect(host.listTools()[0].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('routes an invocation through to the candidate executor', async () => {
    const adapter = new WebMCPAdapter(window);
    const execute = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'executed' }] }));
    await adapter.register(candidateFrom(SEARCH), execute);

    const host = (window.navigator as unknown as { modelContext: ReflexShimHost }).modelContext;
    const response = await host.callTool('search_employees', { query: 'Sarah Chen' });

    expect(execute).toHaveBeenCalledWith({ query: 'Sarah Chen' });
    expect(response.content[0].text).toBe('executed');
  });

  it('unregisters a single tool', async () => {
    const adapter = new WebMCPAdapter(window);
    const search = candidateFrom(SEARCH);
    await adapter.register(search, noop);
    await adapter.unregister(search.id);

    const host = (window.navigator as unknown as { modelContext: ReflexShimHost }).modelContext;
    expect(host.listTools()).toEqual([]);
    expect(adapter.activeIds()).toEqual([]);
  });

  it('unregisters everything at once', async () => {
    const adapter = new WebMCPAdapter(window);
    await adapter.register(candidateFrom(SEARCH), noop);
    await adapter.register(candidateFrom(DEACTIVATE), noop);
    expect(adapter.activeIds()).toHaveLength(2);

    await adapter.unregisterAll();
    expect(adapter.activeIds()).toEqual([]);
  });

  it('replaces a tool when the same candidate is registered again', async () => {
    const adapter = new WebMCPAdapter(window);
    const search = candidateFrom(SEARCH);
    await adapter.register(search, noop);
    await adapter.register({ ...search, description: 'Edited by the user.' }, noop);

    const host = (window.navigator as unknown as { modelContext: ReflexShimHost }).modelContext;
    expect(host.listTools()).toHaveLength(1);
    expect(host.listTools()[0].description).toBe('Edited by the user.');
  });

  it('reports active tool changes to its owner', async () => {
    const onToolsChanged = vi.fn();
    const adapter = new WebMCPAdapter(window, { onToolsChanged });
    const search = candidateFrom(SEARCH);
    await adapter.register(search, noop);
    await adapter.unregister(search.id);
    expect(onToolsChanged).toHaveBeenLastCalledWith([]);
  });
});

describe('WebMCPAdapter against a provideContext-only host', () => {
  it('re-provides the whole tool list on every change', async () => {
    delete (window.document as { modelContext?: unknown }).modelContext;
    const host = new ProvideOnlyHost();
    Object.defineProperty(window.navigator, 'modelContext', { value: host, configurable: true });
    const adapter = new WebMCPAdapter(window);

    const search = candidateFrom(SEARCH);
    await adapter.register(search, noop);
    expect(host.tools.map((tool) => tool.name)).toEqual(['search_employees']);

    const deactivate = candidateFrom(DEACTIVATE);
    await adapter.register(deactivate, noop);
    expect(host.tools).toHaveLength(2);

    await adapter.unregister(search.id);
    expect(host.tools.map((tool) => tool.name)).toEqual(['deactivate_employee']);

    await adapter.unregisterAll();
    expect(host.tools).toEqual([]);
  });
});

describe('ReflexShimHost', () => {
  it('errors clearly for an unknown tool', async () => {
    const host = new ReflexShimHost();
    const response = await host.callTool('nope', {});
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain('No such tool');
  });

  it('notifies listeners when the tool set changes', () => {
    const host = new ReflexShimHost();
    const listener = vi.fn();
    const off = host.onToolsChanged(listener);
    host.registerTool({ name: 't', description: 'd', inputSchema: { type: 'object', properties: {} }, execute: noop });
    expect(listener).toHaveBeenCalledOnce();
    off();
    host.unregisterTool('t');
    expect(listener).toHaveBeenCalledOnce();
  });
});
