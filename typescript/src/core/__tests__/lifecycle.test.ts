/**
 * Tests for Lifecycle Hook Interfaces
 *
 * Validates that lifecycle hook interfaces work correctly and support
 * both synchronous and asynchronous implementations.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  LifecycleHooks,
  AgentInvocationContext,
  AgentRunResponse,
  LifecycleProvider,
  hasLifecycleHooks,
  isLifecycleProvider,
} from '../lifecycle';
import { createUserMessage, createAssistantMessage, MessageRole } from '../types/chat-message';
import { AgentThread } from '../agents/agent-thread';

// Mock agent for testing
const mockAgent = {
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

describe('AgentInvocationContext', () => {
  it('should have correct structure', () => {
    const messages = [createUserMessage('Hello')];
    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages,
      options: { temperature: 0.7 },
      timestamp: new Date(),
    };

    expect(context.agent).toBe(mockAgent);
    expect(context.messages).toBe(messages);
    expect(context.options?.temperature).toBe(0.7);
    expect(context.timestamp).toBeInstanceOf(Date);
  });

  it('should allow options to be optional', () => {
    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Hello')],
      timestamp: new Date(),
    };

    expect(context.options).toBeUndefined();
  });
});

describe('AgentRunResponse', () => {
  it('should be a valid ChatMessage', () => {
    const response: AgentRunResponse = createAssistantMessage('Hello back!');

    expect(response.role).toBe(MessageRole.Assistant);
    expect(response.content).toEqual({ type: 'text', text: 'Hello back!' });
  });
});

describe('LifecycleHooks interface', () => {
  it('should allow async implementations', async () => {
    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };
    const response = createAssistantMessage('Response');

    const hooks: LifecycleHooks = {
      async invoking(ctx) {
        expect(ctx).toBe(context);
      },
      async invoked(ctx, resp) {
        expect(ctx).toBe(context);
        expect(resp).toBe(response);
      },
      async threadCreated(thread) {
        expect(thread).toBeInstanceOf(AgentThread);
      },
    };

    // Verify hooks can be called
    await hooks.invoking?.(context);
    await hooks.invoked?.(context, response);
    await hooks.threadCreated?.(new AgentThread());
  });

  it('should allow sync implementations', () => {
    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };
    const response = createAssistantMessage('Response');

    const hooks: LifecycleHooks = {
      invoking(ctx) {
        expect(ctx).toBe(context);
      },
      invoked(ctx, resp) {
        expect(ctx).toBe(context);
        expect(resp).toBe(response);
      },
      threadCreated(thread) {
        expect(thread).toBeInstanceOf(AgentThread);
      },
    };

    // Verify hooks can be called
    hooks.invoking?.(context);
    hooks.invoked?.(context, response);
    hooks.threadCreated?.(new AgentThread());
  });

  it('should allow partial implementations', () => {
    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };

    // Only invoking
    const hooks1: LifecycleHooks = {
      invoking: () => {},
    };
    expect(hooks1.invoking).toBeDefined();
    expect(hooks1.invoked).toBeUndefined();
    expect(hooks1.threadCreated).toBeUndefined();

    // Only invoked
    const hooks2: LifecycleHooks = {
      invoked: () => {},
    };
    expect(hooks2.invoking).toBeUndefined();
    expect(hooks2.invoked).toBeDefined();
    expect(hooks2.threadCreated).toBeUndefined();

    // Only threadCreated
    const hooks3: LifecycleHooks = {
      threadCreated: () => {},
    };
    expect(hooks3.invoking).toBeUndefined();
    expect(hooks3.invoked).toBeUndefined();
    expect(hooks3.threadCreated).toBeDefined();

    // Two hooks
    const hooks4: LifecycleHooks = {
      invoking: () => {},
      invoked: () => {},
    };
    expect(hooks4.invoking).toBeDefined();
    expect(hooks4.invoked).toBeDefined();
    expect(hooks4.threadCreated).toBeUndefined();
  });

  it('should allow empty implementations', () => {
    const hooks: LifecycleHooks = {};
    expect(hooks.invoking).toBeUndefined();
    expect(hooks.invoked).toBeUndefined();
    expect(hooks.threadCreated).toBeUndefined();
  });

  it('should work with real implementation', async () => {
    const invokingCalls: AgentInvocationContext[] = [];
    const invokedCalls: Array<{ context: AgentInvocationContext; response: AgentRunResponse }> = [];
    const threadCalls: AgentThread[] = [];

    class TestHooks implements LifecycleHooks {
      async invoking(context: AgentInvocationContext): Promise<void> {
        invokingCalls.push(context);
      }

      async invoked(context: AgentInvocationContext, response: AgentRunResponse): Promise<void> {
        invokedCalls.push({ context, response });
      }

      async threadCreated(thread: AgentThread): Promise<void> {
        threadCalls.push(thread);
      }
    }

    const hooks = new TestHooks();
    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };
    const response = createAssistantMessage('Response');
    const thread = new AgentThread();

    await hooks.invoking(context);
    await hooks.invoked(context, response);
    await hooks.threadCreated(thread);

    expect(invokingCalls).toHaveLength(1);
    expect(invokingCalls[0]).toBe(context);
    expect(invokedCalls).toHaveLength(1);
    expect(invokedCalls[0].context).toBe(context);
    expect(invokedCalls[0].response).toBe(response);
    expect(threadCalls).toHaveLength(1);
    expect(threadCalls[0]).toBe(thread);
  });
});

describe('LifecycleProvider interface', () => {
  it('should allow providers with hooks property', () => {
    const provider: LifecycleProvider = {
      hooks: {
        invoking: () => {},
        invoked: () => {},
      },
    };

    expect(provider.hooks).toBeDefined();
    expect(provider.hooks?.invoking).toBeDefined();
    expect(provider.hooks?.invoked).toBeDefined();
  });

  it('should allow providers without hooks', () => {
    const provider: LifecycleProvider = {
      hooks: undefined,
    };

    expect(provider.hooks).toBeUndefined();
  });

  it('should work with readonly hooks', () => {
    class MyProvider implements LifecycleProvider {
      readonly hooks: LifecycleHooks = {
        async invoking(context) {
          expect(context.agent).toBe(mockAgent);
        },
      };
    }

    const provider = new MyProvider();
    expect(provider.hooks).toBeDefined();
    expect(provider.hooks.invoking).toBeDefined();
  });
});

describe('hasLifecycleHooks type guard', () => {
  it('should return true for objects with invoking', () => {
    const obj = {
      invoking: () => {},
    };
    expect(hasLifecycleHooks(obj)).toBe(true);
  });

  it('should return true for objects with invoked', () => {
    const obj = {
      invoked: () => {},
    };
    expect(hasLifecycleHooks(obj)).toBe(true);
  });

  it('should return true for objects with threadCreated', () => {
    const obj = {
      threadCreated: () => {},
    };
    expect(hasLifecycleHooks(obj)).toBe(true);
  });

  it('should return true for objects with multiple hooks', () => {
    const obj = {
      invoking: () => {},
      invoked: () => {},
      threadCreated: () => {},
    };
    expect(hasLifecycleHooks(obj)).toBe(true);
  });

  it('should return false for objects without any hooks', () => {
    const obj = {
      someOtherMethod: () => {},
    };
    expect(hasLifecycleHooks(obj)).toBe(false);
  });

  it('should return false for null', () => {
    expect(hasLifecycleHooks(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(hasLifecycleHooks(undefined)).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(hasLifecycleHooks(42)).toBe(false);
    expect(hasLifecycleHooks('string')).toBe(false);
    expect(hasLifecycleHooks(true)).toBe(false);
  });

  it('should return false for objects with non-function hook properties', () => {
    const obj = {
      invoking: 'not a function',
      invoked: 123,
    };
    expect(hasLifecycleHooks(obj)).toBe(false);
  });

  it('should narrow type correctly', async () => {
    const obj: unknown = {
      invoking: async (ctx: AgentInvocationContext) => {
        return;
      },
    };

    if (hasLifecycleHooks(obj)) {
      // TypeScript should know obj is LifecycleHooks
      const context: AgentInvocationContext = {
        agent: mockAgent,
        messages: [createUserMessage('Test')],
        timestamp: new Date(),
      };
      await obj.invoking?.(context);
    }
  });
});

describe('isLifecycleProvider type guard', () => {
  it('should return true for objects with hooks property', () => {
    const obj = {
      hooks: {
        invoking: () => {},
      },
    };
    expect(isLifecycleProvider(obj)).toBe(true);
  });

  it('should return false for objects with undefined hooks', () => {
    const obj = {
      hooks: undefined,
    };
    expect(isLifecycleProvider(obj)).toBe(false);
  });

  it('should return false for objects with non-lifecycle hooks', () => {
    const obj = {
      hooks: {
        someOtherMethod: () => {},
      },
    };
    expect(isLifecycleProvider(obj)).toBe(false);
  });

  it('should return false for null', () => {
    expect(isLifecycleProvider(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isLifecycleProvider(undefined)).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isLifecycleProvider(42)).toBe(false);
    expect(isLifecycleProvider('string')).toBe(false);
  });

  it('should narrow type correctly', async () => {
    const obj: unknown = {
      hooks: {
        invoking: async (ctx: AgentInvocationContext) => {
          return;
        },
      },
    };

    if (isLifecycleProvider(obj)) {
      // TypeScript should know obj is LifecycleProvider
      const context: AgentInvocationContext = {
        agent: mockAgent,
        messages: [createUserMessage('Test')],
        timestamp: new Date(),
      };
      await obj.hooks?.invoking?.(context);
    }
  });
});

describe('Integration scenarios', () => {
  it('should support context provider with lifecycle hooks', async () => {
    const calls: string[] = [];

    class LoggingProvider implements LifecycleHooks {
      async invoking(context: AgentInvocationContext): Promise<void> {
        calls.push(`invoking:${context.agent.info.name}`);
      }

      async invoked(context: AgentInvocationContext, response: AgentRunResponse): Promise<void> {
        calls.push(`invoked:${response.role}`);
      }

      async threadCreated(thread: AgentThread): Promise<void> {
        calls.push(`thread:${thread.threadId}`);
      }
    }

    const provider = new LoggingProvider();
    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Hello')],
      timestamp: new Date(),
    };
    const response = createAssistantMessage('Hi!');
    const thread = new AgentThread();

    await provider.invoking(context);
    await provider.invoked(context, response);
    await provider.threadCreated(thread);

    expect(calls).toEqual([
      'invoking:Test Agent',
      'invoked:assistant',
      `thread:${thread.threadId}`,
    ]);
  });

  it('should support optional chaining for optional hooks', async () => {
    const provider: LifecycleHooks = {
      invoking: () => {},
      // invoked not implemented
    };

    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };
    const response = createAssistantMessage('Response');

    // Should not throw
    await provider.invoking?.(context);
    await provider.invoked?.(context, response); // undefined, no-op
    await provider.threadCreated?.(new AgentThread()); // undefined, no-op
  });

  it('should support mixed sync/async hooks', async () => {
    const calls: string[] = [];

    const hooks: LifecycleHooks = {
      invoking(context) {
        // Sync
        calls.push('invoking-sync');
      },
      async invoked(context, response) {
        // Async
        await Promise.resolve();
        calls.push('invoked-async');
      },
      threadCreated(thread) {
        // Sync
        calls.push('thread-sync');
      },
    };

    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };
    const response = createAssistantMessage('Response');
    const thread = new AgentThread();

    await hooks.invoking?.(context);
    await hooks.invoked?.(context, response);
    await hooks.threadCreated?.(thread);

    expect(calls).toEqual(['invoking-sync', 'invoked-async', 'thread-sync']);
  });

  it('should handle errors in hooks gracefully', async () => {
    const hooks: LifecycleHooks = {
      async invoking() {
        throw new Error('Invoking error');
      },
      async invoked() {
        throw new Error('Invoked error');
      },
      async threadCreated() {
        throw new Error('Thread error');
      },
    };

    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };
    const response = createAssistantMessage('Response');
    const thread = new AgentThread();

    // Hooks themselves don't handle errors - that's the caller's responsibility
    await expect(hooks.invoking?.(context)).rejects.toThrow('Invoking error');
    await expect(hooks.invoked?.(context, response)).rejects.toThrow('Invoked error');
    await expect(hooks.threadCreated?.(thread)).rejects.toThrow('Thread error');
  });

  it('should work with multiple providers', async () => {
    const calls: string[] = [];

    const provider1: LifecycleHooks = {
      async invoking() {
        calls.push('provider1:invoking');
      },
    };

    const provider2: LifecycleHooks = {
      async invoking() {
        calls.push('provider2:invoking');
      },
    };

    const context: AgentInvocationContext = {
      agent: mockAgent,
      messages: [createUserMessage('Test')],
      timestamp: new Date(),
    };

    const providers = [provider1, provider2];
    for (const provider of providers) {
      await provider.invoking?.(context);
    }

    expect(calls).toEqual(['provider1:invoking', 'provider2:invoking']);
  });
});

describe('Type safety', () => {
  it('should enforce correct parameter types', () => {
    const hooks: LifecycleHooks = {
      // @ts-expect-error - missing required context parameter
      invoking: () => {},
    };
  });

  it('should enforce correct return types', () => {
    const hooks: LifecycleHooks = {
      // @ts-expect-error - cannot return non-void/Promise<void>
      invoking: (context: AgentInvocationContext) => 'string',
    };
  });

  it('should allow both Promise<void> and void returns', () => {
    const hooks1: LifecycleHooks = {
      invoking: () => {},
    };

    const hooks2: LifecycleHooks = {
      invoking: async () => {},
    };

    const hooks3: LifecycleHooks = {
      invoking: () => Promise.resolve(),
    };

    expect(hooks1).toBeDefined();
    expect(hooks2).toBeDefined();
    expect(hooks3).toBeDefined();
  });
});
