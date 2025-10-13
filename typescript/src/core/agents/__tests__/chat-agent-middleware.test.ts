/**
 * Tests for ChatAgent middleware integration.
 *
 * @module agents/__tests__/chat-agent-middleware
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ChatAgent } from '../chat-agent.js';
import type { ChatClientProtocol } from '../../chat-client/protocol.js';
import type { AgentMiddleware } from '../../../middleware/types.js';
import { AgentRunResponse, AgentRunResponseUpdate } from '../chat-agent-types.js';
import type { ChatMessage } from '../../types/chat-message.js';

describe('ChatAgent Middleware Integration', () => {
  let mockClient: ChatClientProtocol;

  beforeEach(() => {
    mockClient = {
      complete: vi.fn(async () => ({
        role: 'assistant',
        content: { type: 'text', text: 'Mock response' },
        timestamp: new Date(),
      })),
      completeStream: vi.fn(async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: 'assistant',
            content: { type: 'text', text: 'Mock ' },
            timestamp: new Date(),
          },
        };
        yield {
          type: 'message_delta',
          delta: {
            role: 'assistant',
            content: { type: 'text', text: 'stream' },
            timestamp: new Date(),
          },
        };
        yield {
          type: 'metadata',
          metadata: {
            responseId: 'resp_123',
          },
        };
      }),
      prepareMessages: (messages: ChatMessage[]) => messages,
    } as unknown as ChatClientProtocol;
  });

  describe('run() method middleware', () => {
    test('middleware is invoked for run() method', async () => {
      let invokingCalled = false;
      let invokedCalled = false;

      const middleware: AgentMiddleware = async (context, next) => {
        invokingCalled = true;
        expect(context.agent).toBeDefined();
        expect(context.messages).toBeDefined();

        await next();

        invokedCalled = true;
        expect((context as any).result).toBeDefined();
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      await agent.run('test');

      expect(invokingCalled).toBe(true);
      expect(invokedCalled).toBe(true);
    });

    test('middleware can modify messages before execution', async () => {
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

      mockClient.complete = vi.fn(async (messages) => {
        capturedMessages = messages as ChatMessage[];
        return {
          role: 'assistant',
          content: { type: 'text', text: 'Response' },
          timestamp: new Date(),
        };
      });

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      await agent.run('Hello');

      // Should have system message + user message
      expect(capturedMessages.length).toBeGreaterThan(1);
      expect(capturedMessages.some((m) => m.role === 'system')).toBe(true);
    });

    test('middleware can short-circuit execution', async () => {
      const cachedResponse = new AgentRunResponse({
        messages: [
          {
            role: 'assistant',
            content: { type: 'text', text: 'Cached response' },
            timestamp: new Date(),
          },
        ],
      });

      const middleware: AgentMiddleware = async (context, next) => {
        // Set result without calling next()
        (context as any).result = cachedResponse;
        // Don't call next()
      };

      const completeSpy = vi.spyOn(mockClient, 'complete');

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      const result = await agent.run('test');

      expect(completeSpy).not.toHaveBeenCalled();
      expect(result.text).toBe('Cached response');
    });

    test('middleware can observe and modify result', async () => {
      let observedText = '';

      const middleware: AgentMiddleware = async (context, next) => {
        await next();

        const result = (context as any).result as AgentRunResponse;
        observedText = result.text;

        // Could modify result here if needed
        // (context as any).result = new AgentRunResponse({ ... });
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      await agent.run('test');

      expect(observedText).toBe('Mock response');
    });

    test('middleware can access metadata', async () => {
      const middleware1: AgentMiddleware = async (context, next) => {
        context.metadata.startTime = Date.now();
        await next();
      };

      const middleware2: AgentMiddleware = async (context, next) => {
        expect(typeof context.metadata.startTime).toBe('number');
        context.metadata.processed = true;
        await next();
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware1, middleware2],
      });

      await agent.run('test');
    });

    test('multiple middleware execute in order', async () => {
      const callOrder: string[] = [];

      const mw1: AgentMiddleware = async (context, next) => {
        callOrder.push('mw1-before');
        await next();
        callOrder.push('mw1-after');
      };

      const mw2: AgentMiddleware = async (context, next) => {
        callOrder.push('mw2-before');
        await next();
        callOrder.push('mw2-after');
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [mw1, mw2],
      });

      await agent.run('test');

      expect(callOrder).toEqual(['mw1-before', 'mw2-before', 'mw2-after', 'mw1-after']);
    });

    test('middleware errors propagate correctly', async () => {
      const middleware: AgentMiddleware = async (context, next) => {
        throw new Error('Middleware error');
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      await expect(agent.run('test')).rejects.toThrow('Middleware error');
    });

    test('single middleware (not array) works correctly', async () => {
      let called = false;

      const middleware: AgentMiddleware = async (context, next) => {
        called = true;
        await next();
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware, // Not an array
      });

      await agent.run('test');

      expect(called).toBe(true);
    });
  });

  describe('runStream() method middleware', () => {
    test('middleware is invoked for runStream() method', async () => {
      let invokingCalled = false;

      const middleware: AgentMiddleware = async (context, next) => {
        invokingCalled = true;
        expect(context.agent).toBeDefined();
        expect(context.messages).toBeDefined();
        await next();
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      // Consume the stream
      for await (const update of agent.runStream('test')) {
        // Just consume
      }

      expect(invokingCalled).toBe(true);
    });

    test('middleware can modify messages before streaming', async () => {
      let capturedMessages: ChatMessage[] = [];

      const middleware: AgentMiddleware = async (context, next) => {
        context.messages.unshift({
          role: 'system',
          content: { type: 'text', text: 'System prompt' },
          timestamp: new Date(),
        });
        await next();
      };

      mockClient.completeStream = vi.fn(async function* (messages) {
        capturedMessages = messages as ChatMessage[];
        yield {
          type: 'message_delta',
          delta: {
            role: 'assistant',
            content: { type: 'text', text: 'Response' },
            timestamp: new Date(),
          },
        };
      });

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      for await (const update of agent.runStream('Hello')) {
        // Consume
      }

      expect(capturedMessages.some((m) => m.role === 'system')).toBe(true);
    });

    test('middleware can short-circuit streaming', async () => {
      const cachedResponse = new AgentRunResponse({
        messages: [
          {
            role: 'assistant',
            content: { type: 'text', text: 'Cached' },
            timestamp: new Date(),
          },
        ],
      });

      const middleware: AgentMiddleware = async (context, next) => {
        (context as any).result = cachedResponse;
        // Don't call next()
      };

      const streamSpy = vi.spyOn(mockClient, 'completeStream');

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      const updates: AgentRunResponseUpdate[] = [];
      for await (const update of agent.runStream('test')) {
        updates.push(update);
      }

      expect(streamSpy).not.toHaveBeenCalled();
      expect(updates.length).toBeGreaterThan(0);
    });

    test('multiple middleware work with streaming', async () => {
      const callOrder: string[] = [];

      const mw1: AgentMiddleware = async (context, next) => {
        callOrder.push('mw1-before');
        await next();
        callOrder.push('mw1-after');
      };

      const mw2: AgentMiddleware = async (context, next) => {
        callOrder.push('mw2-before');
        await next();
        callOrder.push('mw2-after');
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [mw1, mw2],
      });

      for await (const update of agent.runStream('test')) {
        // Consume
      }

      expect(callOrder).toContain('mw1-before');
      expect(callOrder).toContain('mw2-before');
    });

    test('all stream updates are yielded with middleware', async () => {
      const middleware: AgentMiddleware = async (context, next) => {
        context.metadata.tracked = true;
        await next();
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      const updates: AgentRunResponseUpdate[] = [];
      for await (const update of agent.runStream('test')) {
        updates.push(update);
      }

      expect(updates.length).toBeGreaterThan(0);
    });
  });

  describe('Practical middleware scenarios', () => {
    test('caching middleware prevents duplicate API calls', async () => {
      let apiCallCount = 0;

      class CachingMiddleware implements AgentMiddleware {
        private cache = new Map<string, AgentRunResponse>();

        async call(context: any, next: () => Promise<void>): Promise<void> {
          // Create cache key from message content only (not timestamps)
          const key = JSON.stringify(
            context.messages.map((m: ChatMessage) => ({
              role: m.role,
              content: m.content,
            })),
          );

          if (this.cache.has(key)) {
            context.result = this.cache.get(key);
            return;
          }

          await next();

          if (context.result) {
            this.cache.set(key, context.result);
          }
        }
      }

      const cachingMw = new CachingMiddleware();
      const middleware: AgentMiddleware = (ctx, next) => cachingMw.call(ctx, next);

      mockClient.complete = vi.fn(async () => {
        apiCallCount++;
        return {
          role: 'assistant',
          content: { type: 'text', text: `Response ${apiCallCount}` },
          timestamp: new Date(),
        };
      });

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [middleware],
      });

      // First call
      const response1 = await agent.run('Hello');
      expect(apiCallCount).toBe(1);

      // Second call with same message - should use cache
      const response2 = await agent.run('Hello');
      expect(apiCallCount).toBe(1); // Still 1, not incremented

      // Responses should match
      expect(response1.text).toBe(response2.text);

      // Different message - should call API
      await agent.run('Different message');
      expect(apiCallCount).toBe(2);
    });

    test('logging middleware tracks execution details', async () => {
      const logs: Array<{ event: string; details: any }> = [];

      const loggingMiddleware: AgentMiddleware = async (context, next) => {
        logs.push({
          event: 'invoked',
          details: {
            agent: context.agent.info.name,
            messageCount: context.messages.length,
          },
        });

        const startTime = Date.now();

        await next();

        const duration = Date.now() - startTime;
        logs.push({
          event: 'completed',
          details: {
            duration,
            hasResult: !!(context as any).result,
          },
        });
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        name: 'TestAgent',
        middleware: [loggingMiddleware],
      });

      await agent.run('test');

      expect(logs.length).toBe(2);
      expect(logs[0].event).toBe('invoked');
      expect(logs[0].details.agent).toBe('TestAgent');
      expect(logs[1].event).toBe('completed');
      expect(typeof logs[1].details.duration).toBe('number');
    });

    test('retry middleware handles transient failures', async () => {
      let attemptCount = 0;

      const retryMiddleware: AgentMiddleware = async (context, next) => {
        const maxAttempts = 3;
        let lastError: Error | undefined;

        for (let i = 0; i < maxAttempts; i++) {
          try {
            await next();
            return; // Success
          } catch (error) {
            lastError = error as Error;
            attemptCount = i + 1;
            if (i === maxAttempts - 1) {
              throw error; // Last attempt failed
            }
            // Wait before retry (simplified, no actual delay in test)
          }
        }
      };

      let callCount = 0;
      mockClient.complete = vi.fn(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Transient error');
        }
        return {
          role: 'assistant',
          content: { type: 'text', text: 'Success' },
          timestamp: new Date(),
        };
      });

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [retryMiddleware],
      });

      const result = await agent.run('test');

      expect(callCount).toBe(2); // Failed once, succeeded on second try
      expect(result.text).toBe('Success');
    });

    test('validation middleware can reject invalid inputs', async () => {
      const validationMiddleware: AgentMiddleware = async (context, next) => {
        // Check for empty messages
        const hasContent = context.messages.some((msg) => {
          if ('text' in msg.content && msg.content.text) {
            return msg.content.text.trim().length > 0;
          }
          return false;
        });

        if (!hasContent) {
          throw new Error('Empty message not allowed');
        }

        await next();
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [validationMiddleware],
      });

      // Valid input
      await expect(agent.run('Valid message')).resolves.toBeDefined();

      // Invalid input (empty)
      await expect(agent.run({ role: 'user', content: { type: 'text', text: '' }, timestamp: new Date() })).rejects.toThrow('Empty message not allowed');
    });

    test('rate limiting middleware (conceptual)', async () => {
      const rateLimiter = {
        count: 0,
        limit: 3,
        reset: () => {
          rateLimiter.count = 0;
        },
      };

      const rateLimitMiddleware: AgentMiddleware = async (context, next) => {
        if (rateLimiter.count >= rateLimiter.limit) {
          throw new Error('Rate limit exceeded');
        }

        rateLimiter.count++;
        await next();
      };

      const agent = new ChatAgent({
        chatClient: mockClient,
        middleware: [rateLimitMiddleware],
      });

      // First 3 calls should succeed
      await agent.run('test 1');
      await agent.run('test 2');
      await agent.run('test 3');

      // 4th call should fail
      await expect(agent.run('test 4')).rejects.toThrow('Rate limit exceeded');

      // Reset and try again
      rateLimiter.reset();
      await expect(agent.run('test 5')).resolves.toBeDefined();
    });
  });
});
