/**
 * Test Helper Functions
 *
 * Utility functions for creating test data, assertions, and common test operations.
 *
 * @module test/fixtures/test-helpers
 */

import type { ChatMessage } from '../../src/core/types/chat-message';
import { MessageRole, createUserMessage, createAssistantMessage } from '../../src/core/types/chat-message';
import type { AgentMiddleware } from '../../src/middleware/types';
import type { ContextProvider, AIContext } from '../../src/core/context/context-provider';
import type { AITool } from '../../src/core/tools/base-tool';

/**
 * Create a test conversation with alternating user and assistant messages.
 *
 * @param count - Number of message pairs to create
 * @returns Array of ChatMessage objects
 *
 * @example
 * ```typescript
 * const messages = createTestConversation(3);
 * // Returns: [user, assistant, user, assistant, user, assistant]
 * ```
 */
export function createTestConversation(count: number): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    messages.push(createUserMessage(`User message ${i + 1}`));
    messages.push(createAssistantMessage(`Assistant message ${i + 1}`));
  }
  return messages;
}

/**
 * Create a mock middleware that tracks calls.
 *
 * @param name - Name of the middleware (for tracking)
 * @param calls - Array to push call records to
 * @returns AgentMiddleware instance
 *
 * @example
 * ```typescript
 * const calls: string[] = [];
 * const middleware = createTrackingMiddleware('m1', calls);
 *
 * // After execution:
 * expect(calls).toContain('m1-invoking');
 * expect(calls).toContain('m1-invoked');
 * ```
 */
export function createTrackingMiddleware(name: string, calls: string[]): AgentMiddleware {
  return async (context, next) => {
    calls.push(`${name}-invoking`);
    await next();
    calls.push(`${name}-invoked`);
  };
}

/**
 * Create a mock middleware that modifies context.
 *
 * @param modifier - Function to modify the context
 * @returns AgentMiddleware instance
 *
 * @example
 * ```typescript
 * const middleware = createModifyingMiddleware((context) => {
 *   context.metadata.timestamp = Date.now();
 * });
 * ```
 */
export function createModifyingMiddleware(
  modifier: (context: Parameters<AgentMiddleware>[0]) => void | Promise<void>,
): AgentMiddleware {
  return async (context, next) => {
    await modifier(context);
    await next();
  };
}

/**
 * Create a mock context provider that returns fixed context.
 *
 * @param context - Context to return from invoking()
 * @returns ContextProvider instance
 *
 * @example
 * ```typescript
 * const provider = createMockContextProvider({
 *   instructions: 'Additional context'
 * });
 * ```
 */
export function createMockContextProvider(context: Partial<AIContext>): ContextProvider {
  return {
    async invoking() {
      return context as AIContext;
    },
    async invoked() {
      // No-op
    },
    async threadCreated() {
      // No-op
    },
  };
}

/**
 * Create a mock context provider that tracks calls.
 *
 * @param context - Context to return from invoking()
 * @param calls - Object to track call counts
 * @returns ContextProvider instance
 *
 * @example
 * ```typescript
 * const calls = { invoking: 0, invoked: 0, threadCreated: 0 };
 * const provider = createTrackingContextProvider({ instructions: 'Test' }, calls);
 *
 * // After execution:
 * expect(calls.invoking).toBe(1);
 * ```
 */
export function createTrackingContextProvider(
  context: Partial<AIContext>,
  calls: { invoking: number; invoked: number; threadCreated: number },
): ContextProvider {
  return {
    async invoking() {
      calls.invoking++;
      return context as AIContext;
    },
    async invoked() {
      calls.invoked++;
    },
    async threadCreated() {
      calls.threadCreated++;
    },
  };
}

/**
 * Create a mock tool for testing.
 *
 * @param name - Name of the tool
 * @param description - Description of the tool
 * @param handler - Optional handler function
 * @returns AITool instance
 *
 * @example
 * ```typescript
 * const tool = createMockTool('calculator', 'Performs calculations', async (args) => {
 *   return { result: args.a + args.b };
 * });
 * ```
 */
export function createMockTool(
  name: string,
  description: string,
  handler?: (args: Record<string, unknown>) => Promise<unknown>,
): AITool {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    execute: handler || (async () => ({ result: 'mock result' })),
  } as AITool;
}

/**
 * Wait for a specified duration.
 *
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the delay
 *
 * @example
 * ```typescript
 * await sleep(100);
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Collect all updates from a stream into an array.
 *
 * @param stream - AsyncIterable to collect from
 * @returns Promise resolving to array of all items
 *
 * @example
 * ```typescript
 * const updates = await collectStreamUpdates(agent.runStream('Hello'));
 * expect(updates.length).toBeGreaterThan(0);
 * ```
 */
export async function collectStreamUpdates<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const updates: T[] = [];
  for await (const update of stream) {
    updates.push(update);
  }
  return updates;
}

/**
 * Extract text content from a ChatMessage.
 *
 * @param message - The message to extract text from
 * @returns The text content or empty string
 *
 * @example
 * ```typescript
 * const text = getTextContent(message);
 * expect(text).toBe('Hello');
 * ```
 */
export function getTextContent(message: ChatMessage): string {
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  } else if (content && typeof content === 'object' && 'text' in content) {
    return content.text as string;
  }
  return '';
}

/**
 * Assert that middleware was called in the correct order.
 *
 * Verifies that:
 * 1. All middleware "invoking" hooks are called in order
 * 2. All middleware "invoked" hooks are called in reverse order
 *
 * @param calls - Array of call records from tracking middleware
 * @param middlewareNames - Array of middleware names in expected order
 *
 * @example
 * ```typescript
 * const calls: string[] = [];
 * // ... execute with middleware ...
 * assertMiddlewareOrder(calls, ['m1', 'm2', 'm3']);
 * ```
 */
export function assertMiddlewareOrder(calls: string[], middlewareNames: string[]): void {
  const invokingCalls = calls.filter((c) => c.endsWith('-invoking'));
  const invokedCalls = calls.filter((c) => c.endsWith('-invoked'));

  // Check invoking order (forward)
  for (let i = 0; i < middlewareNames.length; i++) {
    const expected = `${middlewareNames[i]}-invoking`;
    if (invokingCalls[i] !== expected) {
      throw new Error(`Expected invoking call ${i} to be "${expected}", got "${invokingCalls[i]}"`);
    }
  }

  // Check invoked order (reverse)
  const reversedNames = [...middlewareNames].reverse();
  for (let i = 0; i < reversedNames.length; i++) {
    const expected = `${reversedNames[i]}-invoked`;
    if (invokedCalls[i] !== expected) {
      throw new Error(`Expected invoked call ${i} to be "${expected}", got "${invokedCalls[i]}"`);
    }
  }
}

/**
 * Create a deterministic conversation ID for testing.
 *
 * @param index - Index or identifier
 * @returns Conversation ID string
 *
 * @example
 * ```typescript
 * const id = createTestConversationId(1);
 * // Returns: 'test-conv-1'
 * ```
 */
export function createTestConversationId(index: number | string): string {
  return `test-conv-${index}`;
}

/**
 * Create a deterministic response ID for testing.
 *
 * @param index - Index or identifier
 * @returns Response ID string
 *
 * @example
 * ```typescript
 * const id = createTestResponseId(1);
 * // Returns: 'test-resp-1'
 * ```
 */
export function createTestResponseId(index: number | string): string {
  return `test-resp-${index}`;
}
