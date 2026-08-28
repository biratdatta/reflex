import type { CapabilityCandidate, JSONSchema } from '@reflex/capability-model';

/** The tool shape WebMCP hosts accept. */
export interface MCPToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: JSONSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    title?: string;
  };
  execute: (input: Record<string, unknown>) => Promise<MCPToolResponse>;
}

/** MCP content response. Hosts expect `content`, so results are serialised into it. */
export interface MCPToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

/**
 * WebMCP is experimental and its surface is still moving, so Reflex talks to it
 * only through this interface. Nothing else in the codebase touches
 * `modelContext` directly.
 */
export interface MCPAdapter {
  available(): boolean;
  flavor(): MCPFlavor;
  register(candidate: CapabilityCandidate, execute: MCPToolDefinition['execute']): Promise<void>;
  unregister(id: string): Promise<void>;
  unregisterAll(): Promise<void>;
  activeIds(): string[];
}

export type MCPFlavor = 'navigator.modelContext' | 'document.modelContext' | 'reflex-shim' | 'none';

/** Minimal view of a host, covering both APIs seen in WebMCP prototypes. */
export interface ModelContextHost {
  registerTool?: (definition: MCPToolDefinition) => unknown;
  unregisterTool?: (name: string) => unknown;
  provideContext?: (context: { tools: MCPToolDefinition[] }) => unknown;
  listTools?: () => MCPToolDefinition[];
  callTool?: (name: string, input: Record<string, unknown>) => Promise<MCPToolResponse>;
  __reflexShim?: boolean;
}
