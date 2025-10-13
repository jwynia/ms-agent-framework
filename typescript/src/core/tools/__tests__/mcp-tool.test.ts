import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  isMCPTool,
  MCPStdioTool,
  MCPSSETool,
  MCPWebSocketTool,
  type MCPTool,
} from '../mcp-tool.js';
import type { AITool } from '../base-tool.js';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string', description: 'Input string' },
            },
            required: ['input'],
          },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Test result' }],
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/sse.js', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/websocket.js', () => ({
  WebSocketClientTransport: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('isMCPTool type guard', () => {
  it('should return true for valid MCPTool objects', () => {
    const mockTool: MCPTool = {
      isConnected: true,
      getFunctions: () => [],
      connect: async () => {},
      async [Symbol.asyncDispose]() {},
    };

    expect(isMCPTool(mockTool)).toBe(true);
  });

  it('should return false for objects missing isConnected', () => {
    const invalid = {
      getFunctions: () => [],
      [Symbol.asyncDispose]: async () => {},
    };

    expect(isMCPTool(invalid)).toBe(false);
  });

  it('should return false for objects missing getFunctions', () => {
    const invalid = {
      isConnected: true,
      [Symbol.asyncDispose]: async () => {},
    };

    expect(isMCPTool(invalid)).toBe(false);
  });

  it('should return false for objects missing Symbol.asyncDispose', () => {
    const invalid = {
      isConnected: true,
      getFunctions: () => [],
    };

    expect(isMCPTool(invalid)).toBe(false);
  });

  it('should return false for non-objects', () => {
    expect(isMCPTool(null)).toBe(false);
    expect(isMCPTool(undefined)).toBe(false);
    expect(isMCPTool('string')).toBe(false);
    expect(isMCPTool(123)).toBe(false);
    expect(isMCPTool(true)).toBe(false);
  });

  it('should filter MCP tools from mixed arrays', () => {
    const regularTool: AITool = {
      name: 'regular',
      description: 'A regular tool',
      schema: z.object({}),
      execute: async () => 'result',
    };

    const mcpTool: MCPTool = {
      isConnected: true,
      getFunctions: () => [],
      connect: async () => {},
      async [Symbol.asyncDispose]() {},
    };

    const mixed: unknown[] = [regularTool, mcpTool, 'string', null];
    const mcpTools = mixed.filter(isMCPTool);

    expect(mcpTools).toHaveLength(1);
    expect(mcpTools[0]).toBe(mcpTool);
  });
});

describe('MCPStdioTool', () => {
  let tool: MCPStdioTool;

  beforeEach(() => {
    tool = new MCPStdioTool({
      name: 'test-server',
      command: 'node',
      args: ['server.js'],
      description: 'Test MCP server',
    });
  });

  afterEach(async () => {
    if (tool.isConnected) {
      await tool[Symbol.asyncDispose]();
    }
  });

  it('should create an MCPStdioTool instance', () => {
    expect(tool).toBeInstanceOf(MCPStdioTool);
    expect(tool.name).toBe('test-server');
    expect(tool.description).toBe('Test MCP server');
  });

  it('should start with isConnected=false', () => {
    expect(tool.isConnected).toBe(false);
  });

  it('should connect to MCP server via stdio', async () => {
    await tool.connect();
    expect(tool.isConnected).toBe(true);
  });

  it('should discover tools from the server after connection', async () => {
    await tool.connect();
    const functions = tool.getFunctions();

    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('test_tool');
    expect(functions[0].description).toBe('A test tool');
  });

  it('should execute discovered tools via MCP protocol', async () => {
    await tool.connect();
    const functions = tool.getFunctions();
    const result = await functions[0].execute({ input: 'test' });

    expect(result).toBe('Test result');
  });

  it('should support allowedTools filter', async () => {
    const filteredTool = new MCPStdioTool({
      name: 'filtered-server',
      command: 'node',
      args: ['server.js'],
      allowedTools: ['other_tool'], // Not 'test_tool'
    });

    await filteredTool.connect();
    const functions = filteredTool.getFunctions();

    expect(functions).toHaveLength(0); // test_tool is filtered out
    await filteredTool[Symbol.asyncDispose]();
  });

  it('should cleanup resources on dispose', async () => {
    await tool.connect();
    expect(tool.isConnected).toBe(true);

    await tool[Symbol.asyncDispose]();
    expect(tool.isConnected).toBe(false);
  });

  it('should work with await using syntax', async () => {
    {
      await using t = new MCPStdioTool({
        name: 'using-test',
        command: 'node',
        args: ['server.js'],
      });

      await t.connect();
      expect(t.isConnected).toBe(true);
      // Automatically disposed at end of block
    }
  });

  it('should handle connection errors gracefully', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn().mockRejectedValue(new Error('Connection failed')),
        }) as never
    );

    const failingTool = new MCPStdioTool({
      name: 'failing-server',
      command: 'invalid-command',
    });

    await expect(failingTool.connect()).rejects.toThrow(/Failed to connect to MCP server/);
    expect(failingTool.isConnected).toBe(false);
  });

  it('should not reconnect if already connected', async () => {
    await tool.connect();
    const firstConnectTime = Date.now();

    await tool.connect();
    expect(Date.now() - firstConnectTime).toBeLessThan(100); // Should be instant
  });
});

describe('MCPSSETool', () => {
  let tool: MCPSSETool;

  beforeEach(() => {
    tool = new MCPSSETool({
      name: 'sse-server',
      url: 'https://api.example.com/mcp',
      headers: { Authorization: 'Bearer token' },
      description: 'SSE MCP server',
    });
  });

  afterEach(async () => {
    if (tool.isConnected) {
      await tool[Symbol.asyncDispose]();
    }
  });

  it('should create an MCPSSETool instance', () => {
    expect(tool).toBeInstanceOf(MCPSSETool);
    expect(tool.name).toBe('sse-server');
    expect(tool.description).toBe('SSE MCP server');
  });

  it('should connect to MCP server via SSE', async () => {
    await tool.connect();
    expect(tool.isConnected).toBe(true);
  });

  it('should discover and execute tools', async () => {
    await tool.connect();
    const functions = tool.getFunctions();
    expect(functions).toHaveLength(1);

    const result = await functions[0].execute({ input: 'test' });
    expect(result).toBe('Test result');
  });

  it('should support SSE without custom headers', async () => {
    const simpleSSE = new MCPSSETool({
      name: 'simple-sse',
      url: 'https://api.example.com/mcp',
    });

    await simpleSSE.connect();
    expect(simpleSSE.isConnected).toBe(true);
    await simpleSSE[Symbol.asyncDispose]();
  });
});

describe('MCPWebSocketTool', () => {
  let tool: MCPWebSocketTool;

  beforeEach(() => {
    tool = new MCPWebSocketTool({
      name: 'ws-server',
      url: 'wss://service.example.com/mcp',
      description: 'WebSocket MCP server',
    });
  });

  afterEach(async () => {
    if (tool.isConnected) {
      await tool[Symbol.asyncDispose]();
    }
  });

  it('should create an MCPWebSocketTool instance', () => {
    expect(tool).toBeInstanceOf(MCPWebSocketTool);
    expect(tool.name).toBe('ws-server');
    expect(tool.description).toBe('WebSocket MCP server');
  });

  it('should connect to MCP server via WebSocket', async () => {
    await tool.connect();
    expect(tool.isConnected).toBe(true);
  });

  it('should discover and execute tools', async () => {
    await tool.connect();
    const functions = tool.getFunctions();
    expect(functions).toHaveLength(1);

    const result = await functions[0].execute({ input: 'test' });
    expect(result).toBe('Test result');
  });
});

describe('MCP Tool Integration', () => {
  it('should handle multiple simultaneous MCP servers', async () => {
    const stdio = new MCPStdioTool({
      name: 'stdio-server',
      command: 'node',
      args: ['server1.js'],
    });

    const sse = new MCPSSETool({
      name: 'sse-server',
      url: 'https://api.example.com/mcp',
    });

    const ws = new MCPWebSocketTool({
      name: 'ws-server',
      url: 'wss://service.example.com/mcp',
    });

    await Promise.all([stdio.connect(), sse.connect(), ws.connect()]);

    expect(stdio.isConnected).toBe(true);
    expect(sse.isConnected).toBe(true);
    expect(ws.isConnected).toBe(true);

    await Promise.all([stdio[Symbol.asyncDispose](), sse[Symbol.asyncDispose](), ws[Symbol.asyncDispose]()]);
  });

  it('should handle tools with complex parameter schemas', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(undefined),
          listTools: vi.fn().mockResolvedValue({
            tools: [
              {
                name: 'complex_tool',
                description: 'A tool with complex parameters',
                inputSchema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Name' },
                    age: { type: 'number', description: 'Age' },
                    active: { type: 'boolean', description: 'Is active' },
                    tags: { type: 'array', description: 'Tags' },
                    metadata: { type: 'object', description: 'Metadata' },
                  },
                  required: ['name', 'age'],
                },
              },
            ],
          }),
          callTool: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'Complex result' }],
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }) as never
    );

    const tool = new MCPStdioTool({
      name: 'complex-server',
      command: 'node',
      args: ['server.js'],
    });

    await tool.connect();
    const functions = tool.getFunctions();
    expect(functions).toHaveLength(1);

    const fn = functions[0];
    expect(fn.name).toBe('complex_tool');

    const result = await fn.execute({
      name: 'John',
      age: 30,
      active: true,
      tags: ['tag1', 'tag2'],
      metadata: { key: 'value' },
    });

    expect(result).toBe('Complex result');
    await tool[Symbol.asyncDispose]();
  });

  it('should handle tool execution errors', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(undefined),
          listTools: vi.fn().mockResolvedValue({
            tools: [
              {
                name: 'error_tool',
                description: 'A tool that errors',
                inputSchema: {
                  type: 'object',
                  properties: {
                    input: { type: 'string' },
                  },
                },
              },
            ],
          }),
          callTool: vi.fn().mockRejectedValue(new Error('Tool execution failed')),
          close: vi.fn().mockResolvedValue(undefined),
        }) as never
    );

    const tool = new MCPStdioTool({
      name: 'error-server',
      command: 'node',
      args: ['server.js'],
    });

    await tool.connect();
    const functions = tool.getFunctions();
    const fn = functions[0];

    await expect(fn.execute({ input: 'test' })).rejects.toThrow(/Failed to execute MCP tool/);
    await tool[Symbol.asyncDispose]();
  });

  it('should handle empty tool lists', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(undefined),
          listTools: vi.fn().mockResolvedValue({ tools: [] }),
          close: vi.fn().mockResolvedValue(undefined),
        }) as never
    );

    const tool = new MCPStdioTool({
      name: 'empty-server',
      command: 'node',
      args: ['server.js'],
    });

    await tool.connect();
    const functions = tool.getFunctions();
    expect(functions).toHaveLength(0);
    await tool[Symbol.asyncDispose]();
  });

  it('should handle tools with no required parameters', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(undefined),
          listTools: vi.fn().mockResolvedValue({
            tools: [
              {
                name: 'no_params_tool',
                description: 'A tool with no parameters',
                inputSchema: {
                  type: 'object',
                  properties: {},
                },
              },
            ],
          }),
          callTool: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'No params result' }],
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }) as never
    );

    const tool = new MCPStdioTool({
      name: 'no-params-server',
      command: 'node',
      args: ['server.js'],
    });

    await tool.connect();
    const functions = tool.getFunctions();
    const fn = functions[0];

    const result = await fn.execute({});
    expect(result).toBe('No params result');
    await tool[Symbol.asyncDispose]();
  });

  it('should extract text content from multi-part responses', async () => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    vi.mocked(Client).mockImplementationOnce(
      () =>
        ({
          connect: vi.fn().mockResolvedValue(undefined),
          listTools: vi.fn().mockResolvedValue({
            tools: [
              {
                name: 'multi_content_tool',
                description: 'Returns multiple content items',
                inputSchema: {
                  type: 'object',
                  properties: {},
                },
              },
            ],
          }),
          callTool: vi.fn().mockResolvedValue({
            content: [
              { type: 'text', text: 'Part 1' },
              { type: 'text', text: 'Part 2' },
              { type: 'image', data: 'base64...', mimeType: 'image/png' },
            ],
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }) as never
    );

    const tool = new MCPStdioTool({
      name: 'multi-content-server',
      command: 'node',
      args: ['server.js'],
    });

    await tool.connect();
    const functions = tool.getFunctions();
    const fn = functions[0];

    const result = await fn.execute({});
    expect(result).toBe('Part 1\nPart 2');
    await tool[Symbol.asyncDispose]();
  });
});
