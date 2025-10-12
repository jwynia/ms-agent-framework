/**
 * Tests for middleware type definitions.
 *
 * @module middleware/__tests__/types
 */

import { describe, it, expect, vi } from 'vitest';
import type { Middleware, AgentMiddleware, FunctionMiddleware, AgentContext, FunctionContext } from '../types.js';
import type { NextFunction } from '../types.js';
import type { AgentProtocol } from '../../core/agents/base-agent.js';
import type { ChatMessage } from '../../core/types/chat-message.js';
import { MessageRole } from '../../core/types/chat-message.js';
import type { AISettings } from '../../core/types/agent-info.js';

/**
 * Create a mock agent for testing.
 */
function createMockAgent(): AgentProtocol {
  return {
    info: {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent',
    },
    chatClient: {} as any,
    tools: [],
    invoke: vi.fn(),
    invokeStream: vi.fn(),
  };
}

/**
 * Create a mock message for testing.
 */
function createMockMessage(text: string): ChatMessage {
  return {
    role: MessageRole.User,
    content: { type: 'text', text },
    timestamp: new Date(),
  };
}

describe('Middleware Types', () => {
  describe('AgentContext', () => {
    it('should have required properties', () => {
      const agent = createMockAgent();
      const messages: ChatMessage[] = [createMockMessage('test')];
      const options: AISettings = { temperature: 0.7 };

      const context: AgentContext = {
        agent,
        messages,
        options,
        metadata: {},
      };

      expect(context.agent).toBe(agent);
      expect(context.messages).toBe(messages);
      expect(context.options).toBe(options);
      expect(context.metadata).toEqual({});
    });

    it('should allow messages to be modified', () => {
      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [createMockMessage('first')],
        metadata: {},
      };

      context.messages.push(createMockMessage('second'));
      expect(context.messages).toHaveLength(2);
    });

    it('should allow options to be modified', () => {
      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        options: { temperature: 0.5 },
        metadata: {},
      };

      context.options = { temperature: 0.9 };
      expect(context.options.temperature).toBe(0.9);
    });

    it('should allow metadata to be populated', () => {
      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      context.metadata.startTime = Date.now();
      context.metadata.userId = 'user123';

      expect(context.metadata.startTime).toBeDefined();
      expect(context.metadata.userId).toBe('user123');
    });

    it('should work with optional options', () => {
      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      expect(context.options).toBeUndefined();
    });
  });

  describe('FunctionContext', () => {
    it('should have required properties', () => {
      const agent = createMockAgent();
      const args = { x: 10, y: 20 };

      const context: FunctionContext = {
        functionName: 'add',
        args,
        agent,
        metadata: {},
      };

      expect(context.functionName).toBe('add');
      expect(context.args).toBe(args);
      expect(context.agent).toBe(agent);
      expect(context.metadata).toEqual({});
    });

    it('should allow args to be modified', () => {
      const context: FunctionContext = {
        functionName: 'calculate',
        args: { x: 5 },
        agent: createMockAgent(),
        metadata: {},
      };

      context.args.y = 10;
      expect(context.args).toEqual({ x: 5, y: 10 });
    });

    it('should allow metadata to be populated', () => {
      const context: FunctionContext = {
        functionName: 'test',
        args: {},
        agent: createMockAgent(),
        metadata: {},
      };

      context.metadata.callId = 'call-123';
      context.metadata.retryCount = 0;

      expect(context.metadata.callId).toBe('call-123');
      expect(context.metadata.retryCount).toBe(0);
    });
  });

  describe('Middleware<AgentContext>', () => {
    it('should accept valid middleware function', async () => {
      const middleware: Middleware<AgentContext> = async (context, next) => {
        await next();
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await middleware(context, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('should allow middleware to modify context before next()', async () => {
      const middleware: Middleware<AgentContext> = async (context, next) => {
        context.messages.push(createMockMessage('injected'));
        await next();
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await middleware(context, nextFn);

      expect(context.messages).toHaveLength(1);
      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('should allow middleware to perform actions after next()', async () => {
      const executionOrder: string[] = [];

      const middleware: Middleware<AgentContext> = async (context, next) => {
        executionOrder.push('before');
        await next();
        executionOrder.push('after');
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction<AgentContext> = vi.fn(async () => {
        executionOrder.push('next');
      });

      await middleware(context, nextFn);

      expect(executionOrder).toEqual(['before', 'next', 'after']);
    });

    it('should allow middleware to short-circuit by not calling next()', async () => {
      const middleware: Middleware<AgentContext> = async (context, next) => {
        if (context.metadata.skip) {
          return; // Don't call next()
        }
        await next();
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: { skip: true },
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await middleware(context, nextFn);

      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should allow middleware to use metadata for communication', async () => {
      const middleware1: Middleware<AgentContext> = async (context, next) => {
        context.metadata.startTime = Date.now();
        await next();
      };

      const middleware2: Middleware<AgentContext> = async (context, next) => {
        expect(context.metadata.startTime).toBeDefined();
        await next();
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);

      await middleware1(context, async () => {
        await middleware2(context, nextFn);
      });

      expect(nextFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Middleware<FunctionContext>', () => {
    it('should accept valid middleware function', async () => {
      const middleware: Middleware<FunctionContext> = async (context, next) => {
        await next();
      };

      const context: FunctionContext = {
        functionName: 'test',
        args: {},
        agent: createMockAgent(),
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await middleware(context, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('should allow middleware to validate arguments', async () => {
      const middleware: Middleware<FunctionContext> = async (context, next) => {
        if (!context.args.required) {
          throw new Error('Missing required argument');
        }
        await next();
      };

      const context: FunctionContext = {
        functionName: 'test',
        args: {},
        agent: createMockAgent(),
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);

      await expect(middleware(context, nextFn)).rejects.toThrow('Missing required argument');
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should allow middleware to transform arguments', async () => {
      const middleware: Middleware<FunctionContext> = async (context, next) => {
        // Transform string numbers to actual numbers
        Object.keys(context.args).forEach((key) => {
          if (typeof context.args[key] === 'string') {
            const parsed = parseFloat(context.args[key] as string);
            if (!isNaN(parsed)) {
              context.args[key] = parsed;
            }
          }
        });
        await next();
      };

      const context: FunctionContext = {
        functionName: 'add',
        args: { x: '5', y: '10' },
        agent: createMockAgent(),
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await middleware(context, nextFn);

      expect(context.args.x).toBe(5);
      expect(context.args.y).toBe(10);
      expect(nextFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('AgentMiddleware type alias', () => {
    it('should be compatible with Middleware<AgentContext>', async () => {
      const agentMiddleware: AgentMiddleware = async (context, next) => {
        // Can access agent-specific properties
        expect(context.agent).toBeDefined();
        expect(context.messages).toBeDefined();
        await next();
      };

      const genericMiddleware: Middleware<AgentContext> = agentMiddleware;

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await genericMiddleware(context, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('should provide better type inference for agent operations', async () => {
      const loggingMiddleware: AgentMiddleware = async (context, next) => {
        // TypeScript should infer context as AgentContext
        const agentName = context.agent.info.name;
        const messageCount = context.messages.length;

        context.metadata.log = `Agent ${agentName} processing ${messageCount} messages`;
        await next();
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [createMockMessage('test')],
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await loggingMiddleware(context, nextFn);

      expect(context.metadata.log).toBe('Agent Test Agent processing 1 messages');
    });
  });

  describe('FunctionMiddleware type alias', () => {
    it('should be compatible with Middleware<FunctionContext>', async () => {
      const functionMiddleware: FunctionMiddleware = async (context, next) => {
        // Can access function-specific properties
        expect(context.functionName).toBeDefined();
        expect(context.args).toBeDefined();
        await next();
      };

      const genericMiddleware: Middleware<FunctionContext> = functionMiddleware;

      const context: FunctionContext = {
        functionName: 'test',
        args: {},
        agent: createMockAgent(),
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await genericMiddleware(context, nextFn);

      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('should provide better type inference for function operations', async () => {
      const timingMiddleware: FunctionMiddleware = async (context, next) => {
        // TypeScript should infer context as FunctionContext
        const start = Date.now();
        context.metadata.startTime = start;

        await next();

        const duration = Date.now() - start;
        context.metadata.duration = duration;
      };

      const context: FunctionContext = {
        functionName: 'calculate',
        args: { x: 1, y: 2 },
        agent: createMockAgent(),
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await timingMiddleware(context, nextFn);

      expect(context.metadata.startTime).toBeDefined();
      expect(context.metadata.duration).toBeDefined();
    });
  });

  describe('Middleware chaining', () => {
    it('should support multiple middleware in a chain', async () => {
      const executionOrder: string[] = [];

      const middleware1: AgentMiddleware = async (context, next) => {
        executionOrder.push('m1-before');
        await next();
        executionOrder.push('m1-after');
      };

      const middleware2: AgentMiddleware = async (context, next) => {
        executionOrder.push('m2-before');
        await next();
        executionOrder.push('m2-after');
      };

      const middleware3: AgentMiddleware = async (context, next) => {
        executionOrder.push('m3-before');
        await next();
        executionOrder.push('m3-after');
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      // Simulate middleware chain
      await middleware1(context, async () => {
        await middleware2(context, async () => {
          await middleware3(context, async () => {
            executionOrder.push('handler');
          });
        });
      });

      expect(executionOrder).toEqual([
        'm1-before',
        'm2-before',
        'm3-before',
        'handler',
        'm3-after',
        'm2-after',
        'm1-after',
      ]);
    });

    it('should stop execution when middleware does not call next()', async () => {
      const executionOrder: string[] = [];

      const middleware1: AgentMiddleware = async (context, next) => {
        executionOrder.push('m1-before');
        await next();
        executionOrder.push('m1-after');
      };

      const middleware2: AgentMiddleware = async (context, next) => {
        executionOrder.push('m2-before');
        // Don't call next() - short circuit
        executionOrder.push('m2-after');
      };

      const middleware3: AgentMiddleware = async (context, next) => {
        executionOrder.push('m3-before');
        await next();
        executionOrder.push('m3-after');
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      // Simulate middleware chain
      await middleware1(context, async () => {
        await middleware2(context, async () => {
          await middleware3(context, async () => {
            executionOrder.push('handler');
          });
        });
      });

      // Only m1 and m2 should execute, m3 and handler should not
      expect(executionOrder).toEqual(['m1-before', 'm2-before', 'm2-after', 'm1-after']);
    });
  });

  describe('Custom context types', () => {
    interface CustomContext {
      readonly customField: string;
      mutableField: number;
      readonly metadata: Record<string, unknown>;
    }

    it('should support custom context types with generic Middleware', async () => {
      const customMiddleware: Middleware<CustomContext> = async (context, next) => {
        expect(context.customField).toBe('test');
        context.mutableField += 1;
        await next();
      };

      const context: CustomContext = {
        customField: 'test',
        mutableField: 0,
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);
      await customMiddleware(context, nextFn);

      expect(context.mutableField).toBe(1);
      expect(nextFn).toHaveBeenCalledTimes(1);
    });

    it('should enforce readonly constraints on custom contexts', () => {
      interface ReadonlyContext {
        readonly value: string;
        readonly metadata: Record<string, unknown>;
      }

      const middleware: Middleware<ReadonlyContext> = async (context, next) => {
        // This should cause a TypeScript error if uncommented:
        // context.value = 'new value';

        // But metadata properties can be added:
        context.metadata.test = 'value';
        await next();
      };

      expect(middleware).toBeDefined();
    });
  });

  describe('Error handling in middleware', () => {
    it('should propagate errors from middleware', async () => {
      const middleware: AgentMiddleware = async (context, next) => {
        throw new Error('Middleware error');
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction = vi.fn().mockResolvedValue(undefined);

      await expect(middleware(context, nextFn)).rejects.toThrow('Middleware error');
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should propagate errors from next()', async () => {
      const middleware: AgentMiddleware = async (context, next) => {
        await next();
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction<AgentContext> = vi.fn().mockRejectedValue(new Error('Next error'));

      await expect(middleware(context, nextFn)).rejects.toThrow('Next error');
    });

    it('should allow middleware to catch and handle errors', async () => {
      const middleware: AgentMiddleware = async (context, next) => {
        try {
          await next();
        } catch (error) {
          context.metadata.error = error;
          // Error handled, don't rethrow
        }
      };

      const context: AgentContext = {
        agent: createMockAgent(),
        messages: [],
        metadata: {},
      };

      const nextFn: NextFunction<AgentContext> = vi.fn().mockRejectedValue(new Error('Test error'));

      await middleware(context, nextFn);

      expect(context.metadata.error).toBeInstanceOf(Error);
    });
  });
});
