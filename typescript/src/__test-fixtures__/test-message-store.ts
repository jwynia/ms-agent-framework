/**
 * Test Message Store
 *
 * Enhanced in-memory message store for testing with additional features:
 * - Call tracking for verification
 * - Configurable behavior
 * - Error simulation
 *
 * @module test/fixtures/test-message-store
 */

import { InMemoryMessageStore } from '../../src/core/storage/in-memory-store';
import type { ChatMessage } from '../../src/core/types/chat-message';
import type { ListOptions } from '../../src/core/storage/message-store';

/**
 * Configuration options for TestMessageStore
 */
export interface TestMessageStoreOptions {
  /**
   * If true, throw errors on operations (for error testing).
   */
  shouldError?: boolean;

  /**
   * Error to throw when shouldError is true.
   */
  error?: Error;

  /**
   * Delay in milliseconds before completing operations.
   */
  delay?: number;
}

/**
 * Enhanced message store for testing.
 *
 * Wraps InMemoryMessageStore with additional features useful for testing:
 * - Tracks method calls for verification
 * - Supports error simulation
 * - Supports operation delays
 *
 * @example
 * ```typescript
 * const store = new TestMessageStore();
 * await store.add('thread-1', message);
 *
 * // Verify interactions
 * expect(store.getAddCallCount()).toBe(1);
 * ```
 *
 * @example
 * ```typescript
 * // Simulate errors
 * const store = new TestMessageStore({
 *   shouldError: true,
 *   error: new Error('Storage unavailable')
 * });
 * ```
 */
export class TestMessageStore extends InMemoryMessageStore {
  private addCalls: number = 0;
  private getCalls: number = 0;
  private listCalls: number = 0;
  private clearCalls: number = 0;
  private readonly shouldError: boolean;
  private readonly error: Error;
  private readonly delay: number;

  /**
   * Create a new TestMessageStore.
   *
   * @param options - Configuration options
   */
  constructor(options: TestMessageStoreOptions = {}) {
    super();
    this.shouldError = options.shouldError ?? false;
    this.error = options.error ?? new Error('Test error');
    this.delay = options.delay ?? 0;
  }

  /**
   * Add a message to the store.
   *
   * @param threadId - The thread ID
   * @param message - The message to add
   */
  async add(threadId: string, message: ChatMessage): Promise<void> {
    this.addCalls++;

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.shouldError) {
      throw this.error;
    }

    return super.add(threadId, message);
  }

  /**
   * Get a specific message from the store.
   *
   * @param threadId - The thread ID
   * @param messageId - The message ID
   * @returns The message if found, undefined otherwise
   */
  async get(threadId: string, messageId: string): Promise<ChatMessage | undefined> {
    this.getCalls++;

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.shouldError) {
      throw this.error;
    }

    return super.get(threadId, messageId);
  }

  /**
   * List messages from the store.
   *
   * @param threadId - The thread ID
   * @param options - List options
   * @returns Array of messages
   */
  async list(threadId: string, options?: ListOptions): Promise<ChatMessage[]> {
    this.listCalls++;

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.shouldError) {
      throw this.error;
    }

    return super.list(threadId, options);
  }

  /**
   * Clear all messages from a thread.
   *
   * @param threadId - The thread ID
   */
  async clear(threadId: string): Promise<void> {
    this.clearCalls++;

    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    if (this.shouldError) {
      throw this.error;
    }

    return super.clear(threadId);
  }

  /**
   * Get the number of add() calls.
   *
   * @returns Number of calls
   */
  getAddCallCount(): number {
    return this.addCalls;
  }

  /**
   * Get the number of get() calls.
   *
   * @returns Number of calls
   */
  getGetCallCount(): number {
    return this.getCalls;
  }

  /**
   * Get the number of list() calls.
   *
   * @returns Number of calls
   */
  getListCallCount(): number {
    return this.listCalls;
  }

  /**
   * Get the number of clear() calls.
   *
   * @returns Number of calls
   */
  getClearCallCount(): number {
    return this.clearCalls;
  }

  /**
   * Reset all call counters.
   */
  resetCallCounts(): void {
    this.addCalls = 0;
    this.getCalls = 0;
    this.listCalls = 0;
    this.clearCalls = 0;
  }
}
