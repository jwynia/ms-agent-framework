/**
 * TASK-101e: ChatAgent MCP Tool Integration Tests
 *
 * Comprehensive test coverage for the ChatAgent's MCP (Model Context Protocol) tool integration.
 * Tests MCP tool connection, function resolution, lifecycle management, and cleanup.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ChatAgent } from '../chat-agent.js';
import type { ChatClientProtocol } from '../../chat-client/protocol.js';
import { createAssistantMessage } from '../../types/chat-message.js';
import type { MCPTool } from '../../tools/mcp-tool.js';
import type { AITool } from '../../tools/base-tool.js';
import { z } from 'zod';

describe('TASK-101e: ChatAgent MCP Tool Integration', () => {
  let mockClient: ChatClientProtocol;

  beforeEach(() => {
    // Create a mock chat client
    mockClient = {
      complete: vi.fn(),
      completeStream: vi.fn(),
    } as unknown as ChatClientProtocol;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('MCP Tool Separation', () => {
    it('should separate MCP tools from regular tools in constructor', async () => {
      const regularTool: AITool = {
        name: 'regular_tool',
        description: 'A regular tool',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [regularTool, mcpTool],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      // Should have regular tool but not MCP tool itself
      expect(tools).toContainEqual(regularTool);
      expect(tools).not.toContainEqual(mcpTool);
    });

    it('should handle only MCP tools in constructor', async () => {
      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      // Should have empty tools (MCP functions not resolved in this test)
      expect(tools).toEqual([]);
    });

    it('should handle only regular tools in constructor', async () => {
      const regularTool: AITool = {
        name: 'regular_tool',
        description: 'A regular tool',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [regularTool],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toContainEqual(regularTool);
    });
  });

  describe('MCP Tool Connection', () => {
    it('should connect MCP tool before first use', async () => {
      const mcpFunction: AITool = {
        name: 'mcp_function',
        description: 'Function from MCP server',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await agent.run('Hello');

      // MCP tool's getFunctions should have been called
      expect(mcpTool.getFunctions).toHaveBeenCalled();

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      // Should have MCP function in tools
      expect(tools).toContainEqual(mcpFunction);
    });

    it('should not reconnect already connected MCP tool', async () => {
      const mcpFunction: AITool = {
        name: 'mcp_function',
        description: 'Function from MCP server',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool: MCPTool = {
        isConnected: true, // Already connected
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await agent.run('Hello');

      // getFunctions should still be called
      expect(mcpTool.getFunctions).toHaveBeenCalled();
    });

    it('should connect multiple MCP tools', async () => {
      const mcpFunction1: AITool = {
        name: 'mcp_function_1',
        description: 'Function 1',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpFunction2: AITool = {
        name: 'mcp_function_2',
        description: 'Function 2',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool1: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction1]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const mcpTool2: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction2]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool1, mcpTool2],
      });

      await agent.run('Hello');

      // Both tools should be connected
      expect(mcpTool1.getFunctions).toHaveBeenCalled();
      expect(mcpTool2.getFunctions).toHaveBeenCalled();

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      // Should have both functions
      expect(tools).toContainEqual(mcpFunction1);
      expect(tools).toContainEqual(mcpFunction2);
    });
  });

  describe('MCP Function Resolution', () => {
    it('should resolve and merge MCP functions into tool list', async () => {
      const regularTool: AITool = {
        name: 'regular_tool',
        description: 'Regular tool',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpFunction: AITool = {
        name: 'mcp_function',
        description: 'MCP function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [regularTool, mcpTool],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      // Should have both regular tool and MCP function
      expect(tools).toHaveLength(2);
      expect(tools).toContainEqual(regularTool);
      expect(tools).toContainEqual(mcpFunction);
    });

    it('should resolve multiple functions from single MCP tool', async () => {
      const mcpFunction1: AITool = {
        name: 'func1',
        description: 'Function 1',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpFunction2: AITool = {
        name: 'func2',
        description: 'Function 2',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction1, mcpFunction2]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toHaveLength(2);
      expect(tools).toContainEqual(mcpFunction1);
      expect(tools).toContainEqual(mcpFunction2);
    });

    it('should handle MCP tool returning empty functions', async () => {
      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toEqual([]);
    });
  });

  describe('Runtime MCP Tools', () => {
    it('should handle runtime-provided MCP tools', async () => {
      const mcpFunction: AITool = {
        name: 'runtime_mcp_func',
        description: 'Runtime MCP function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const runtimeMcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      await agent.run('Hello', {
        tools: runtimeMcpTool,
      });

      expect(runtimeMcpTool.getFunctions).toHaveBeenCalled();

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toContainEqual(mcpFunction);
    });

    it('should handle runtime MCP tools array', async () => {
      const mcpFunction1: AITool = {
        name: 'runtime_func1',
        description: 'Runtime function 1',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpFunction2: AITool = {
        name: 'runtime_func2',
        description: 'Runtime function 2',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const runtimeMcpTool1: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction1]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const runtimeMcpTool2: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction2]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      await agent.run('Hello', {
        tools: [runtimeMcpTool1, runtimeMcpTool2],
      });

      expect(runtimeMcpTool1.getFunctions).toHaveBeenCalled();
      expect(runtimeMcpTool2.getFunctions).toHaveBeenCalled();

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toContainEqual(mcpFunction1);
      expect(tools).toContainEqual(mcpFunction2);
    });

    it('should combine constructor and runtime MCP tools', async () => {
      const constructorMcpFunction: AITool = {
        name: 'constructor_func',
        description: 'Constructor function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const runtimeMcpFunction: AITool = {
        name: 'runtime_func',
        description: 'Runtime function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const constructorMcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([constructorMcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const runtimeMcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([runtimeMcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [constructorMcpTool],
      });

      await agent.run('Hello', {
        tools: runtimeMcpTool,
      });

      expect(constructorMcpTool.getFunctions).toHaveBeenCalled();
      expect(runtimeMcpTool.getFunctions).toHaveBeenCalled();

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toContainEqual(constructorMcpFunction);
      expect(tools).toContainEqual(runtimeMcpFunction);
    });

    it('should handle mixed runtime tools (regular + MCP)', async () => {
      const regularTool: AITool = {
        name: 'regular_runtime',
        description: 'Regular runtime tool',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpFunction: AITool = {
        name: 'mcp_runtime_func',
        description: 'MCP runtime function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const runtimeMcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      await agent.run('Hello', {
        tools: [regularTool, runtimeMcpTool],
      });

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toContainEqual(regularTool);
      expect(tools).toContainEqual(mcpFunction);
    });
  });

  describe('MCP Tool Lifecycle', () => {
    it('should cleanup MCP tools on asyncDispose', async () => {
      const mcpFunction: AITool = {
        name: 'mcp_func',
        description: 'MCP function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const disposeSpy = vi.fn().mockResolvedValue(undefined);

      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: disposeSpy,
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await agent.run('Hello');

      // Now dispose the agent
      await agent[Symbol.asyncDispose]();

      // Dispose should have been called on MCP tool
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should cleanup multiple MCP tools on asyncDispose', async () => {
      const disposeSpy1 = vi.fn().mockResolvedValue(undefined);
      const disposeSpy2 = vi.fn().mockResolvedValue(undefined);

      const mcpTool1: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([]),
        [Symbol.asyncDispose]: disposeSpy1,
      };

      const mcpTool2: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([]),
        [Symbol.asyncDispose]: disposeSpy2,
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool1, mcpTool2],
      });

      await agent.run('Hello');
      await agent[Symbol.asyncDispose]();

      expect(disposeSpy1).toHaveBeenCalled();
      expect(disposeSpy2).toHaveBeenCalled();
    });

    it('should cleanup runtime MCP tools on asyncDispose', async () => {
      const disposeSpy = vi.fn().mockResolvedValue(undefined);

      const runtimeMcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([]),
        [Symbol.asyncDispose]: disposeSpy,
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      await agent.run('Hello', {
        tools: runtimeMcpTool,
      });

      await agent[Symbol.asyncDispose]();

      // Runtime MCP tool should also be disposed
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should be callable multiple times without error', async () => {
      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      // Dispose multiple times should not throw
      await agent[Symbol.asyncDispose]();
      await agent[Symbol.asyncDispose]();
      await agent[Symbol.asyncDispose]();

      // No error expected
    });
  });

  describe('MCP Tool Streaming', () => {
    it('should resolve MCP tools in runStream', async () => {
      const mcpFunction: AITool = {
        name: 'mcp_stream_func',
        description: 'MCP streaming function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      // Mock streaming response
      async function* mockStream() {
        yield {
          type: 'message_delta' as const,
          delta: {
            role: 'assistant' as const,
            content: { type: 'text' as const, text: 'Hello' },
            timestamp: new Date(),
          },
        };
        yield {
          type: 'metadata' as const,
          metadata: { responseId: 'resp-123' },
        };
      }

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      // Consume the stream
      const updates = [];
      for await (const update of agent.runStream('Hello')) {
        updates.push(update);
      }

      expect(mcpTool.getFunctions).toHaveBeenCalled();

      const callArgs = vi.mocked(mockClient.completeStream).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;
      const tools = options.tools as AITool[];

      expect(tools).toContainEqual(mcpFunction);
    });

    it('should resolve runtime MCP tools in runStream', async () => {
      const mcpFunction: AITool = {
        name: 'runtime_stream_func',
        description: 'Runtime streaming function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const runtimeMcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      // Mock streaming response
      async function* mockStream() {
        yield {
          type: 'message_delta' as const,
          delta: {
            role: 'assistant' as const,
            content: { type: 'text' as const, text: 'Hello' },
            timestamp: new Date(),
          },
        };
      }

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      // Consume the stream
      const updates = [];
      for await (const update of agent.runStream('Hello', { tools: runtimeMcpTool })) {
        updates.push(update);
      }

      expect(runtimeMcpTool.getFunctions).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle MCP tool getFunctions throwing error', async () => {
      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockRejectedValue(new Error('Connection failed')),
        [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await expect(agent.run('Hello')).rejects.toThrow('Connection failed');
    });

    it('should handle MCP tool asyncDispose errors gracefully', async () => {
      // Test what happens if dispose throws an error
      const mcpFunction: AITool = {
        name: 'func',
        description: 'Function',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const mcpTool: MCPTool = {
        isConnected: false,
        getFunctions: vi.fn().mockResolvedValue([mcpFunction]),
        [Symbol.asyncDispose]: vi.fn().mockRejectedValue(new Error('Dispose failed')),
      };

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mcpTool],
      });

      await agent.run('Hello');

      // Dispose should throw error
      await expect(agent[Symbol.asyncDispose]()).rejects.toThrow('Dispose failed');
    });

    it('should handle empty tool array', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;

      // Tools should be undefined or empty array
      expect(!options.tools || (Array.isArray(options.tools) && options.tools.length === 0)).toBe(true);
    });

    it('should handle null/undefined tools gracefully', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        // tools not provided
      });

      await agent.run('Hello');

      // Should not throw
      expect(mockClient.complete).toHaveBeenCalled();
    });
  });
});
