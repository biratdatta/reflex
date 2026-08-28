import type { MCPToolDefinition, MCPToolResponse } from '@reflex/webmcp-adapter';

/**
 * WebMCP is not in the DOM typings yet. These tests read the host the way a
 * WebMCP client would.
 */
declare global {
  interface Navigator {
    modelContext?: {
      registerTool?: (definition: MCPToolDefinition) => unknown;
      unregisterTool?: (name: string) => unknown;
      listTools?: () => MCPToolDefinition[];
      callTool?: (name: string, input: Record<string, unknown>) => Promise<MCPToolResponse>;
      __reflexShim?: boolean;
    };
  }
}

export {};
