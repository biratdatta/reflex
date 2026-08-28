import type { MCPToolDefinition, MCPToolResponse, ModelContextHost } from './types.js';

/**
 * A local stand-in for a browser WebMCP host.
 *
 * WebMCP is not in stable Chrome yet, so without this the demo could register
 * nothing. The shim is installed ONLY when no native host exists, is marked
 * `__reflexShim: true` so nothing mistakes it for the real thing, and
 * implements the same surface: register, unregister, list, call.
 */
export class ReflexShimHost implements ModelContextHost {
  readonly __reflexShim = true;
  private readonly tools = new Map<string, MCPToolDefinition>();
  private readonly listeners = new Set<(tools: MCPToolDefinition[]) => void>();

  registerTool = (definition: MCPToolDefinition): { unregister: () => void } => {
    this.tools.set(definition.name, definition);
    this.emit();
    return { unregister: () => this.unregisterTool(definition.name) };
  };

  unregisterTool = (name: string): boolean => {
    const removed = this.tools.delete(name);
    if (removed) this.emit();
    return removed;
  };

  provideContext = (context: { tools: MCPToolDefinition[] }): void => {
    this.tools.clear();
    for (const tool of context.tools) this.tools.set(tool.name, tool);
    this.emit();
  };

  listTools = (): MCPToolDefinition[] => Array.from(this.tools.values());

  callTool = async (name: string, input: Record<string, unknown> = {}): Promise<MCPToolResponse> => {
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: [{ type: 'text', text: `No such tool: ${name}` }], isError: true };
    }
    return tool.execute(input);
  };

  onToolsChanged = (listener: (tools: MCPToolDefinition[]) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    const tools = this.listTools();
    for (const listener of this.listeners) listener(tools);
  }
}
