/**
 * MCP (Model Context Protocol) Tool Integration
 *
 * Provides MCP server integration for the agent framework.
 * MCP tools connect to external servers that provide additional capabilities.
 *
 * @module tools/mcp-tool
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, type StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { z } from 'zod';
import { FunctionTool, type AITool } from './base-tool.js';

/**
 * Interface for MCP (Model Context Protocol) tools.
 *
 * MCP tools connect to external servers that provide additional
 * capabilities and functions to agents. They support async lifecycle
 * management for establishing and closing connections.
 *
 * @example
 * ```typescript
 * const mcpTool = new MCPStdioTool({
 *   name: 'filesystem',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 * });
 *
 * await using tool = mcpTool;
 * const functions = await tool.getFunctions();
 * // Use functions with agent
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
   */
  getFunctions(): AITool[] | Promise<AITool[]>;

  /**
   * Connect to the MCP server.
   * Called automatically when using `await using` syntax.
   *
   * @throws {Error} If connection fails
   */
  connect(): Promise<void>;
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

/**
 * Options for creating an MCPTool instance.
 */
export interface MCPToolOptions {
  /**
   * The name of the MCP tool/server.
   */
  name: string;

  /**
   * Optional description of the tool's capabilities.
   */
  description?: string;

  /**
   * Filter to only load specific tools from the server.
   * If not provided, all tools will be loaded.
   */
  allowedTools?: string[];
}

/**
 * Helper function to convert JSON Schema to Zod schema.
 * Supports basic types commonly used in MCP tools.
 *
 * @param jsonSchema - JSON Schema object from MCP tool definition
 * @returns Zod schema for validation
 */
function jsonSchemaToZod(jsonSchema: Record<string, unknown>): z.ZodSchema {
  const properties = (jsonSchema.properties as Record<string, Record<string, unknown>>) || {};
  const required = (jsonSchema.required as string[]) || [];

  if (Object.keys(properties).length === 0) {
    return z.object({});
  }

  const zodShape: Record<string, z.ZodTypeAny> = {};

  for (const [propName, propSchema] of Object.entries(properties)) {
    let zodType: z.ZodTypeAny;

    // Handle type
    const type = propSchema.type as string | undefined;
    switch (type) {
      case 'string':
        zodType = z.string();
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case 'number':
      case 'integer':
        zodType = z.number();
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case 'boolean':
        zodType = z.boolean();
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case 'array':
        zodType = z.array(z.unknown());
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      case 'object':
        zodType = z.record(z.unknown());
        if (propSchema.description) {
          zodType = zodType.describe(propSchema.description as string);
        }
        break;
      default:
        zodType = z.unknown();
    }

    // Make optional if not in required array
    if (!required.includes(propName)) {
      zodType = zodType.optional();
    }

    zodShape[propName] = zodType;
  }

  return z.object(zodShape);
}

/**
 * Base class for MCP tool implementations.
 * Handles connection lifecycle, tool discovery, and function wrapping.
 */
abstract class MCPToolBase implements MCPTool {
  protected client?: Client;
  protected _functions: AITool[] = [];
  protected _isConnected = false;
  public readonly name: string;
  public readonly description: string;
  protected readonly allowedTools?: string[];

  constructor(options: MCPToolOptions) {
    this.name = options.name;
    this.description = options.description || `MCP Server: ${options.name}`;
    this.allowedTools = options.allowedTools;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  getFunctions(): AITool[] {
    return this.allowedTools
      ? this._functions.filter(fn => this.allowedTools!.includes(fn.name))
      : this._functions;
  }

  async connect(): Promise<void> {
    if (this._isConnected) {
      return;
    }

    try {
      // Create the transport (implemented by subclasses)
      const transport = await this.createTransport();

      // Create the MCP client
      this.client = new Client({
        name: this.name,
        version: '1.0.0',
      });

      // Connect to the server
      await this.client.connect(transport);
      this._isConnected = true;

      // Discover tools from the server
      await this.discoverTools();
    } catch (error) {
      this._isConnected = false;
      throw new Error(`Failed to connect to MCP server '${this.name}': ${error}`);
    }
  }

  protected abstract createTransport(): Promise<StdioClientTransport | SSEClientTransport | WebSocketClientTransport>;

  protected async discoverTools(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized. Call connect() first.');
    }

    try {
      const toolsResponse = await this.client.listTools();
      const tools = toolsResponse.tools || [];

      for (const mcpTool of tools) {
        const schema = jsonSchemaToZod(mcpTool.inputSchema as Record<string, unknown>);

        const aiTool = new FunctionTool({
          name: mcpTool.name,
          description: mcpTool.description || '',
          schema,
          fn: async (params: unknown): Promise<string> => {
            if (!this.client) {
              throw new Error('MCP client not connected');
            }

            try {
              const result = await this.client.callTool({
                name: mcpTool.name,
                arguments: params as Record<string, unknown>,
              });

              // Extract text content from the result
              if (result.content && Array.isArray(result.content)) {
                const textContent = result.content
                  .filter((c: { type: string }) => c.type === 'text')
                  .map((c: { text: string }) => c.text)
                  .join('\n');
                return textContent || JSON.stringify(result.content);
              }

              return JSON.stringify(result);
            } catch (error) {
              throw new Error(`Failed to execute MCP tool '${mcpTool.name}': ${error}`);
            }
          },
        });

        this._functions.push(aiTool);
      }
    } catch (error) {
      throw new Error(`Failed to discover tools from MCP server '${this.name}': ${error}`);
    }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
      this._isConnected = false;
    }
  }
}

/**
 * MCP tool that connects via stdio (spawning a child process).
 *
 * This is the most common transport type for local MCP servers.
 *
 * @example
 * ```typescript
 * const filesystemTool = new MCPStdioTool({
 *   name: 'filesystem',
 *   command: 'npx',
 *   args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
 *   description: 'File system operations',
 * });
 *
 * // Using explicit lifecycle management
 * await filesystemTool.connect();
 * const functions = filesystemTool.getFunctions();
 * // Use functions...
 * await filesystemTool[Symbol.asyncDispose]();
 *
 * // Or using await using syntax (TypeScript 5.2+)
 * await using tool = filesystemTool;
 * await tool.connect();
 * const fns = tool.getFunctions();
 * // Automatically disposed at end of scope
 * ```
 */
export class MCPStdioTool extends MCPToolBase {
  private serverParams: StdioServerParameters;

  constructor(
    options: MCPToolOptions & { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }
  ) {
    super(options);
    this.serverParams = {
      command: options.command,
      args: options.args,
      env: options.env,
      cwd: options.cwd,
    };
  }

  protected async createTransport(): Promise<StdioClientTransport> {
    const transport = new StdioClientTransport(this.serverParams);
    await transport.start();
    return transport;
  }
}

/**
 * MCP tool that connects via Server-Sent Events (SSE) over HTTP.
 *
 * Used for remote MCP servers exposed via HTTP endpoints.
 *
 * @example
 * ```typescript
 * const remoteTool = new MCPSSETool({
 *   name: 'remote-api',
 *   url: 'https://api.example.com/mcp',
 *   headers: { Authorization: 'Bearer token' },
 *   description: 'Remote API operations',
 * });
 *
 * await using tool = remoteTool;
 * await tool.connect();
 * const functions = tool.getFunctions();
 * ```
 */
export class MCPSSETool extends MCPToolBase {
  private url: string;
  private headers?: Record<string, string>;

  constructor(options: MCPToolOptions & { url: string; headers?: Record<string, string> }) {
    super(options);
    this.url = options.url;
    this.headers = options.headers;
  }

  protected async createTransport(): Promise<SSEClientTransport> {
    const transport = new SSEClientTransport(
      new URL(this.url),
      this.headers
        ? {
            requestInit: {
              headers: this.headers,
            },
          }
        : undefined
    );
    await transport.start();
    return transport;
  }
}

/**
 * MCP tool that connects via WebSocket.
 *
 * Used for real-time bidirectional communication with MCP servers.
 *
 * @example
 * ```typescript
 * const wsTool = new MCPWebSocketTool({
 *   name: 'realtime-service',
 *   url: 'wss://service.example.com/mcp',
 *   description: 'Real-time service operations',
 * });
 *
 * await using tool = wsTool;
 * await tool.connect();
 * const functions = tool.getFunctions();
 * ```
 */
export class MCPWebSocketTool extends MCPToolBase {
  private url: string;

  constructor(options: MCPToolOptions & { url: string }) {
    super(options);
    this.url = options.url;
  }

  protected async createTransport(): Promise<WebSocketClientTransport> {
    const transport = new WebSocketClientTransport(new URL(this.url));
    await transport.start();
    return transport;
  }
}
