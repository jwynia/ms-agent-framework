/**
 * Tests for middleware decorator functions.
 *
 * @module middleware/__tests__/decorators
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { wrapWithMiddleware, wrapStreamWithMiddleware, applyMiddleware } from '../decorators.js';
import type { AgentMiddleware, AgentContext } from '../types.js';
import type { AgentProtocol } from '../../core/agents/base-agent.js';
import { AgentRunResponse, AgentRunResponseUpdate } from '../../core/agents/chat-agent-types.js';
import type { ChatMessage } from '../../core/types/chat-message.js';

describe('wrapWithMiddleware', () => {
  let mockAgent: AgentProtocol;
  let callOrder: string[];

  beforeEach(() => {
    callOrder = [];
    mockAgent = {
      info: {
        id: 'test-agent',
        name: 'Test Agent',
      },
      run: vi.fn(),
      runStream: vi.fn(),
    } as unknown as AgentProtocol;
  });

  test('calls middleware in correct order', async () => {
    const middleware1: AgentMiddleware = async (context, next) => {
      callOrder.push('mw1-before');
      await next();
      callOrder.push('mw1-after');
    };

    const middleware2: AgentMiddleware = async (context, next) => {
      callOrder.push('mw2-before');
      await next();
      callOrder.push('mw2-after');
    };

    const originalMethod = async (messages: ChatMessage[]) => {
      callOrder.push('original-method');
      return new AgentRunResponse({ messages: [] });
    };

    const wrapped = wrapWithMiddleware(originalMethod, [middleware1, middleware2], mockAgent);

    await wrapped('test');

    expect(callOrder).toEqual([
      'mw1-before', // First middleware before
      'mw2-before', // Second middleware before
      'original-method', // Original method
      'mw2-after', // Second middleware after (middleware controls its own after logic)
      'mw1-after', // First middleware after
    ]);
  });

  test('middleware can modify context messages', async () => {
    let capturedMessages: ChatMessage[] = [];

    const middleware: AgentMiddleware = async (context, next) => {
      // Add a system message
      context.messages.unshift({
        role: 'system',
        content: { type: 'text', text: 'You are a helpful assistant' },
        timestamp: new Date(),
      });
      await next();
    };

    const originalMethod = async (messages: ChatMessage[]) => {
      capturedMessages = messages;
      return new AgentRunResponse({ messages: [] });
    };

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    await wrapped('test');

    expect(capturedMessages.length).toBe(2);
    expect(capturedMessages[0].role).toBe('system');
    expect(capturedMessages[1].role).toBe('user');
  });

  test('middleware can access and modify metadata', async () => {
    const middleware1: AgentMiddleware = async (context, next) => {
      context.metadata.customField = 'added-by-mw1';
      context.metadata.timestamp = Date.now();
      await next();
    };

    const middleware2: AgentMiddleware = async (context, next) => {
      expect(context.metadata.customField).toBe('added-by-mw1');
      expect(typeof context.metadata.timestamp).toBe('number');
      context.metadata.processed = true;
      await next();
    };

    const originalMethod = async () => new AgentRunResponse({ messages: [] });

    const wrapped = wrapWithMiddleware(originalMethod, [middleware1, middleware2], mockAgent);

    await wrapped('test');
  });

  test('middleware can short-circuit execution', async () => {
    let originalCalled = false;

    const middleware: AgentMiddleware = async (context, next) => {
      // Set result without calling next() to short-circuit
      (context as any).result = new AgentRunResponse({
        messages: [
          {
            role: 'assistant',
            content: { type: 'text', text: 'cached response' },
            timestamp: new Date(),
          },
        ],
      });
      // Don't call next()
    };

    const originalMethod = async () => {
      originalCalled = true;
      return new AgentRunResponse({ messages: [] });
    };

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    const result = await wrapped('test');

    expect(originalCalled).toBe(false);
    expect(result.messages[0].content).toEqual({ type: 'text', text: 'cached response' });
  });

  test('middleware can observe result after execution', async () => {
    let observedResult: AgentRunResponse | undefined;

    const middleware: AgentMiddleware = async (context, next) => {
      await next();
      observedResult = (context as any).result;
    };

    const originalMethod = async () =>
      new AgentRunResponse({
        messages: [
          {
            role: 'assistant',
            content: { type: 'text', text: 'response' },
            timestamp: new Date(),
          },
        ],
        responseId: 'resp_123',
      });

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    await wrapped('test');

    expect(observedResult).toBeDefined();
    expect(observedResult?.responseId).toBe('resp_123');
  });

  test('middleware errors propagate', async () => {
    const middleware: AgentMiddleware = async (context, next) => {
      throw new Error('Middleware error');
    };

    const originalMethod = async () => new AgentRunResponse({ messages: [] });

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    await expect(wrapped('test')).rejects.toThrow('Middleware error');
  });

  test('handles string input correctly', async () => {
    let capturedMessages: ChatMessage[] = [];

    const middleware: AgentMiddleware = async (context, next) => {
      capturedMessages = context.messages;
      await next();
    };

    const originalMethod = async (messages: ChatMessage[]) => new AgentRunResponse({ messages: [] });

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    await wrapped('Hello world');

    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0].role).toBe('user');
    expect(capturedMessages[0].content).toEqual({ type: 'text', text: 'Hello world' });
  });

  test('handles ChatMessage array input', async () => {
    let capturedMessages: ChatMessage[] = [];

    const middleware: AgentMiddleware = async (context, next) => {
      capturedMessages = context.messages;
      await next();
    };

    const originalMethod = async (messages: ChatMessage[]) => new AgentRunResponse({ messages: [] });

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    const inputMessages: ChatMessage[] = [
      { role: 'user', content: { type: 'text', text: 'msg1' }, timestamp: new Date() },
      { role: 'assistant', content: { type: 'text', text: 'msg2' }, timestamp: new Date() },
    ];

    await wrapped(inputMessages);

    expect(capturedMessages.length).toBe(2);
    expect(capturedMessages).toEqual(inputMessages);
  });

  test('handles single ChatMessage input', async () => {
    let capturedMessages: ChatMessage[] = [];

    const middleware: AgentMiddleware = async (context, next) => {
      capturedMessages = context.messages;
      await next();
    };

    const originalMethod = async (messages: ChatMessage[]) => new AgentRunResponse({ messages: [] });

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    const inputMessage: ChatMessage = {
      role: 'user',
      content: { type: 'text', text: 'single message' },
      timestamp: new Date(),
    };

    await wrapped(inputMessage);

    expect(capturedMessages.length).toBe(1);
    expect(capturedMessages[0]).toEqual(inputMessage);
  });
});

describe('wrapStreamWithMiddleware', () => {
  let mockAgent: AgentProtocol;

  beforeEach(() => {
    mockAgent = {
      info: {
        id: 'test-agent',
        name: 'Test Agent',
      },
      run: vi.fn(),
      runStream: vi.fn(),
    } as unknown as AgentProtocol;
  });

  test('middleware is called before streaming starts', async () => {
    let middlewareCalled = false;

    const middleware: AgentMiddleware = async (context, next) => {
      middlewareCalled = true;
      await next();
    };

    const originalMethod = async function* () {
      yield new AgentRunResponseUpdate({
        content: { type: 'text', text: 'chunk' },
        role: 'assistant',
      });
    };

    const wrapped = wrapStreamWithMiddleware(originalMethod, [middleware], mockAgent);

    // Start streaming
    const stream = wrapped('test');

    // Consume first update
    const iterator = stream[Symbol.asyncIterator]();
    await iterator.next();

    expect(middlewareCalled).toBe(true);
  });

  test('middleware can modify messages before streaming', async () => {
    let capturedMessages: ChatMessage[] = [];

    const middleware: AgentMiddleware = async (context, next) => {
      context.messages.push({
        role: 'system',
        content: { type: 'text', text: 'Added by middleware' },
        timestamp: new Date(),
      });
      capturedMessages = context.messages;
      await next();
    };

    const originalMethod = async function* (messages: ChatMessage[]) {
      expect(messages.length).toBe(2); // Original + added by middleware
      yield new AgentRunResponseUpdate({
        content: { type: 'text', text: 'response' },
        role: 'assistant',
      });
    };

    const wrapped = wrapStreamWithMiddleware(originalMethod, [middleware], mockAgent);

    // Consume stream
    for await (const update of wrapped('test')) {
      // Just consume
    }

    expect(capturedMessages.length).toBe(2);
  });

  test('middleware can short-circuit streaming with complete response', async () => {
    const cachedResponse = new AgentRunResponse({
      messages: [
        {
          role: 'assistant',
          content: { type: 'text', text: 'cached' },
          timestamp: new Date(),
        },
      ],
      responseId: 'cached_123',
    });

    const middleware: AgentMiddleware = async (context, next) => {
      // Set result without calling next()
      (context as any).result = cachedResponse;
      // Don't call next() to short-circuit
    };

    let originalCalled = false;
    const originalMethod = async function* () {
      originalCalled = true;
      yield new AgentRunResponseUpdate({
        content: { type: 'text', text: 'original' },
        role: 'assistant',
      });
    };

    const wrapped = wrapStreamWithMiddleware(originalMethod, [middleware], mockAgent);

    // Consume stream
    const updates: AgentRunResponseUpdate[] = [];
    for await (const update of wrapped('test')) {
      updates.push(update);
    }

    expect(originalCalled).toBe(false);
    expect(updates.length).toBeGreaterThan(0);
    // Should have converted the response to stream updates
  });

  test('yields all updates from original stream', async () => {
    const middleware: AgentMiddleware = async (context, next) => {
      await next();
    };

    const originalMethod = async function* () {
      yield new AgentRunResponseUpdate({
        content: { type: 'text', text: 'chunk1' },
        role: 'assistant',
      });
      yield new AgentRunResponseUpdate({
        content: { type: 'text', text: 'chunk2' },
        role: 'assistant',
      });
      yield new AgentRunResponseUpdate({
        content: { type: 'text', text: 'chunk3' },
        role: 'assistant',
        isFinal: true,
      });
    };

    const wrapped = wrapStreamWithMiddleware(originalMethod, [middleware], mockAgent);

    const updates: AgentRunResponseUpdate[] = [];
    for await (const update of wrapped('test')) {
      updates.push(update);
    }

    expect(updates.length).toBe(3);
    expect(updates[2].isFinal).toBe(true);
  });
});

describe('applyMiddleware', () => {
  let mockAgent: AgentProtocol;

  beforeEach(() => {
    mockAgent = {
      info: {
        id: 'test-agent',
        name: 'Test Agent',
      },
      run: async () => new AgentRunResponse({ messages: [] }),
      runStream: async function* () {
        yield new AgentRunResponseUpdate({
          content: { type: 'text', text: 'test' },
          role: 'assistant',
        });
      },
    } as unknown as AgentProtocol;
  });

  test('wraps run method when middleware is applied', () => {
    const originalRun = mockAgent.run;

    const middleware: AgentMiddleware = async (context, next) => {
      await next();
    };

    applyMiddleware([middleware])(mockAgent);

    expect(mockAgent.run).not.toBe(originalRun);
  });

  test('wraps runStream method when middleware is applied', () => {
    const originalRunStream = mockAgent.runStream;

    const middleware: AgentMiddleware = async (context, next) => {
      await next();
    };

    applyMiddleware([middleware])(mockAgent);

    expect(mockAgent.runStream).not.toBe(originalRunStream);
  });

  test('handles single middleware (not array)', () => {
    const middleware: AgentMiddleware = async (context, next) => {
      await next();
    };

    expect(() => {
      applyMiddleware(middleware)(mockAgent);
    }).not.toThrow();
  });

  test('wrapped methods still function correctly', async () => {
    const middleware: AgentMiddleware = async (context, next) => {
      context.metadata.processed = true;
      await next();
    };

    applyMiddleware([middleware])(mockAgent);

    const result = await mockAgent.run!('test');
    expect(result).toBeInstanceOf(AgentRunResponse);
  });

  test('wrapped stream methods still function correctly', async () => {
    const middleware: AgentMiddleware = async (context, next) => {
      context.metadata.processed = true;
      await next();
    };

    applyMiddleware([middleware])(mockAgent);

    const updates: AgentRunResponseUpdate[] = [];
    for await (const update of mockAgent.runStream!('test')) {
      updates.push(update);
    }

    expect(updates.length).toBeGreaterThan(0);
  });
});

describe('Middleware integration scenarios', () => {
  test('caching middleware prevents duplicate calls', async () => {
    let executionCount = 0;

    class CachingMiddleware implements AgentMiddleware {
      private cache = new Map<string, AgentRunResponse>();

      async call(context: AgentContext, next: () => Promise<void>): Promise<void> {
        // Create cache key from message content only (not timestamps)
        const key = JSON.stringify(
          context.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        );

        if (this.cache.has(key)) {
          (context as any).result = this.cache.get(key);
          // Don't call next() - short-circuit
          return;
        }

        await next();

        const result = (context as any).result as AgentRunResponse;
        if (result) {
          this.cache.set(key, result);
        }
      }
    }

    const cachingMiddleware = new CachingMiddleware();
    const middleware: AgentMiddleware = (context, next) => cachingMiddleware.call(context, next);

    const originalMethod = async () => {
      executionCount++;
      return new AgentRunResponse({
        messages: [
          {
            role: 'assistant',
            content: { type: 'text', text: `Response ${executionCount}` },
            timestamp: new Date(),
          },
        ],
      });
    };

    const mockAgent = {
      info: { id: 'test', name: 'Test' },
    } as AgentProtocol;

    const wrapped = wrapWithMiddleware(originalMethod, [middleware], mockAgent);

    // First call - should execute
    const result1 = await wrapped('Hello');
    expect(executionCount).toBe(1);
    expect(result1.text).toBe('Response 1');

    // Second call with same message - should use cache
    const result2 = await wrapped('Hello');
    expect(executionCount).toBe(1); // Still 1, not incremented
    expect(result2.text).toBe('Response 1'); // Same cached response

    // Different message - should execute
    const result3 = await wrapped('Different');
    expect(executionCount).toBe(2);
    expect(result3.text).toBe('Response 2');
  });

  test('logging middleware tracks execution', async () => {
    const logs: string[] = [];

    const loggingMiddleware: AgentMiddleware = async (context, next) => {
      logs.push(`Before: ${context.messages.length} messages`);
      const startTime = Date.now();

      await next();

      const duration = Date.now() - startTime;
      logs.push(`After: completed in ${duration}ms`);
    };

    const originalMethod = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new AgentRunResponse({ messages: [] });
    };

    const mockAgent = {
      info: { id: 'test', name: 'Test' },
    } as AgentProtocol;

    const wrapped = wrapWithMiddleware(originalMethod, [loggingMiddleware], mockAgent);

    await wrapped('test');

    expect(logs.length).toBe(2);
    expect(logs[0]).toContain('Before:');
    expect(logs[1]).toContain('After:');
    expect(logs[1]).toContain('completed in');
  });

  test('multiple middleware work together', async () => {
    const operations: string[] = [];

    const middleware1: AgentMiddleware = async (context, next) => {
      operations.push('mw1-before');
      context.metadata.mw1 = true;
      await next();
      operations.push('mw1-after');
    };

    const middleware2: AgentMiddleware = async (context, next) => {
      operations.push('mw2-before');
      expect(context.metadata.mw1).toBe(true);
      context.metadata.mw2 = true;
      await next();
      operations.push('mw2-after');
    };

    const middleware3: AgentMiddleware = async (context, next) => {
      operations.push('mw3-before');
      expect(context.metadata.mw1).toBe(true);
      expect(context.metadata.mw2).toBe(true);
      await next();
      operations.push('mw3-after');
    };

    const originalMethod = async () => {
      operations.push('execute');
      return new AgentRunResponse({ messages: [] });
    };

    const mockAgent = {
      info: { id: 'test', name: 'Test' },
    } as AgentProtocol;

    const wrapped = wrapWithMiddleware(originalMethod, [middleware1, middleware2, middleware3], mockAgent);

    await wrapped('test');

    expect(operations).toEqual([
      'mw1-before',
      'mw2-before',
      'mw3-before',
      'execute',
      'mw3-after',
      'mw2-after',
      'mw1-after',
    ]);
  });
});
