/**
 * MCP (Model Context Protocol) Tool Integration
 *
 * Defines interfaces for MCP tool support in the agent framework.
 * MCP tools connect to external servers that provide additional capabilities.
 *
 * @module tools/mcp-tool
 */

import type { AITool } from './base-tool.js';

/**
 * Interface for MCP (Model Context Protocol) tools.
 *
 * MCP tools connect to external servers that provide additional
 * capabilities and functions to agents. They support async lifecycle
 * management for establishing and closing connections.
 *
 * @example
 * ```typescript
 * class MyMCPTool implements MCPTool {
 *   isConnected = false;
 *   private functions: AITool[] = [];
 *
 *   async [Symbol.asyncDispose](): Promise<void> {
 *     // Cleanup connection
 *     this.isConnected = false;
 *   }
 *
 *   getFunctions(): AITool[] | Promise<AITool[]> {
 *     return this.functions;
 *   }
 * }
 * ```
 */
export interface MCPTool extends AsyncDisposable {
  /**
   * Whether the MCP tool is currently connected to its server.
   * Must be true before getFunctions() can be called successfully.
   */
  readonly isConnected: boolean;

  /**
   * Get the list of functions/tools provided by this MCP server.
   *
   * This method returns the AITool instances that wrap the MCP server's
   * capabilities. Functions are typically loaded when the tool connects.
   *
   * @returns Array of AITool instances provided by the MCP server
   *
   * @example
   * ```typescript
   * const mcpTool = new FilesystemMCPTool({ ... });
   * await mcpTool[Symbol.asyncDispose](); // Connect
   * const functions = await mcpTool.getFunctions();
   * // Use functions with agent
   * ```
   */
  getFunctions(): AITool[] | Promise<AITool[]>;
}

/**
 * Type guard to check if a value is an MCPTool.
 *
 * Checks for the presence of required MCPTool properties
 * (isConnected and getFunctions method).
 *
 * @param value - Value to check
 * @returns True if the value implements the MCPTool interface
 *
 * @example
 * ```typescript
 * const tool: unknown = getTool();
 * if (isMCPTool(tool)) {
 *   if (tool.isConnected) {
 *     const functions = await tool.getFunctions();
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Filter MCP tools from a mixed array
 * const allTools: (AITool | MCPTool)[] = [...];
 * const mcpTools = allTools.filter(isMCPTool);
 * const regularTools = allTools.filter(t => !isMCPTool(t));
 * ```
 */
export function isMCPTool(value: unknown): value is MCPTool {
  return (
    value !== null &&
    typeof value === 'object' &&
    'isConnected' in value &&
    typeof value.isConnected === 'boolean' &&
    'getFunctions' in value &&
    typeof value.getFunctions === 'function' &&
    Symbol.asyncDispose in value &&
    typeof (value as Record<symbol, unknown>)[Symbol.asyncDispose] === 'function'
  );
}
