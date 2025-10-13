/**
 * Enhanced Mock Chat Client for Integration Testing
 *
 * This module provides a comprehensive mock implementation of ChatClientProtocol
 * with configurable behavior for integration tests. It supports:
 * - Canned responses (single or multiple)
 * - Service-managed threads with conversation IDs
 * - Streaming responses
 * - Usage tracking
 * - Configurable delays
 * - Error simulation
 *
 * @module test/fixtures/mock-chat-client
 */

import type { ChatMessage } from '../../src/core/types/chat-message';
import { MessageRole, createAssistantMessage } from '../../src/core/types/chat-message';
import type { ChatClientProtocol } from '../../src/core/chat-client/protocol';
import type { ChatCompletionOptions, StreamEvent } from '../../src/core/chat-client/types';

/**
 * Configuration options for MockChatClient
 */
export interface MockChatClientOptions {
  /**
   * Array of canned responses to return in sequence.
   * When exhausted, repeats the last response.
   */
  responses?: Array<{
    text: string;
    conversationId?: string;
    responseId?: string;
    error?: Error;
  }>;

  /**
   * Whether this client supports conversation IDs (service-managed threads).
   * If true and conversationId not provided in response, generates one automatically.
   */
  supportsConversationId?: boolean;

  /**
   * Default conversation ID to use if supportsConversationId is true.
   */
  defaultConversationId?: string;

  /**
   * Delay in milliseconds before returning responses (simulates network latency).
   */
  delay?: number;

  /**
   * Whether to include usage information in responses.
   */
  includeUsage?: boolean;

  /**
   * Whether to include metadata events in streams.
   */
  includeMetadata?: boolean;
}

/**
 * Enhanced MockChatClient for integration testing.
 *
 * Provides a configurable mock implementation that can simulate various
 * chat client behaviors including service-managed threads, streaming,
 * and error conditions.
 *
 * @example
 * ```typescript
 * // Simple mock with single response
 * const client = new MockChatClient({
 *   responses: [{ text: 'Hello!' }]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Mock with service-managed thread support
 * const client = new MockChatClient({
 *   supportsConversationId: true,
 *   responses: [
 *     { text: 'Nice to meet you!', conversationId: 'conv-123' },
 *     { text: 'I remember you said your name is Alice.' }
 *   ]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Mock with error simulation
 * const client = new MockChatClient({
 *   responses: [
 *     { text: 'Success' },
 *     { text: '', error: new Error('API Error') }
 *   ]
 * });
 * ```
 */
export class MockChatClient implements ChatClientProtocol {
  private responses: Array<{
    text: string;
    conversationId?: string;
    responseId?: string;
    error?: Error;
  }>;
  private currentIndex: number = 0;
  private readonly supportsConversationId: boolean;
  private readonly defaultConversationId?: string;
  private readonly delay: number;
  private readonly includeUsage: boolean;
  private readonly includeMetadata: boolean;
  private callCount: number = 0;

  /**
   * Create a new MockChatClient.
   *
   * @param options - Configuration options
   */
  constructor(options: MockChatClientOptions = {}) {
    this.responses = options.responses || [{ text: 'Mock response' }];
    this.supportsConversationId = options.supportsConversationId ?? false;
    this.defaultConversationId = options.defaultConversationId;
    this.delay = options.delay ?? 0;
    this.includeUsage = options.includeUsage ?? true;
    this.includeMetadata = options.includeMetadata ?? true;
  }

  /**
   * Get the next response configuration.
   *
   * @returns The next response or the last response if exhausted
   */
  private getNextResponse() {
    if (this.currentIndex >= this.responses.length) {
      // Repeat last response
      return this.responses[this.responses.length - 1];
    }
    const response = this.responses[this.currentIndex];
    this.currentIndex++;
    return response;
  }

  /**
   * Complete a chat conversation with a mock response.
   *
   * Returns configured responses in sequence. Supports conversation IDs,
   * delays, and error simulation.
   *
   * @param messages - Input messages
   * @param options - Completion options
   * @returns Assistant message with mock response
   */
  async complete(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatMessage> {
    void messages; // Avoid unused warning

    this.callCount++;

    // Apply delay if configured
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    // Get next response
    const responseConfig = this.getNextResponse();

    // Simulate error if configured
    if (responseConfig.error) {
      throw responseConfig.error;
    }

    // Create response message
    const response = createAssistantMessage(responseConfig.text);

    // Build metadata
    const metadata: Record<string, unknown> = {};

    // Add conversation ID if supported
    if (this.supportsConversationId) {
      const conversationId =
        responseConfig.conversationId ||
        options?.conversationId ||
        this.defaultConversationId ||
        `conv-${Date.now()}`;
      metadata.conversationId = conversationId;
    }

    // Add response ID
    const responseId = responseConfig.responseId || `resp-${this.callCount}`;
    metadata.responseId = responseId;

    // Add usage information
    if (this.includeUsage) {
      const promptTokens = this.estimateTokenCount(messages);
      const completionTokens = Math.ceil(responseConfig.text.length / 4);
      metadata.usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      };
    }

    response.metadata = metadata;

    return response;
  }

  /**
   * Stream a chat completion with mock events.
   *
   * Yields message deltas that spell out the response word by word,
   * followed by optional usage and metadata events.
   *
   * @param messages - Input messages
   * @param options - Completion options
   * @returns AsyncIterable yielding StreamEvent objects
   */
  async *completeStream(messages: ChatMessage[], options?: ChatCompletionOptions): AsyncIterable<StreamEvent> {
    void messages; // Avoid unused warning

    this.callCount++;

    // Apply delay if configured
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay));
    }

    // Get next response
    const responseConfig = this.getNextResponse();

    // Simulate error if configured
    if (responseConfig.error) {
      throw responseConfig.error;
    }

    // Split response into words and emit deltas
    const words = responseConfig.text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const text = i === 0 ? words[i] : ` ${words[i]}`;
      yield {
        type: 'message_delta',
        delta: {
          role: MessageRole.Assistant,
          content: { type: 'text', text },
        },
      };

      // Small delay between words to simulate streaming
      if (this.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.delay / words.length));
      }
    }

    // Emit usage event if enabled
    if (this.includeUsage) {
      const promptTokens = this.estimateTokenCount(messages);
      const completionTokens = Math.ceil(responseConfig.text.length / 4);
      yield {
        type: 'usage',
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    }

    // Emit metadata event if enabled
    if (this.includeMetadata) {
      const metadata: Record<string, unknown> = {
        provider: 'mock',
        modelId: 'mock-model-v1',
        finishReason: 'stop',
      };

      // Add conversation ID if supported
      if (this.supportsConversationId) {
        const conversationId =
          responseConfig.conversationId ||
          options?.conversationId ||
          this.defaultConversationId ||
          `conv-${Date.now()}`;
        metadata.conversationId = conversationId;
      }

      // Add response ID
      metadata.responseId = responseConfig.responseId || `resp-${this.callCount}`;

      yield {
        type: 'metadata',
        metadata,
      };
    }
  }

  /**
   * Estimate token count for messages (rough approximation).
   *
   * Uses a simple heuristic of ~4 characters per token.
   *
   * @param messages - Messages to count tokens for
   * @returns Estimated token count
   */
  private estimateTokenCount(messages: ChatMessage[]): number {
    const totalChars = messages.reduce((sum, msg) => {
      const content = msg.content;
      if (typeof content === 'string') {
        return sum + content.length;
      } else if (content && typeof content === 'object' && 'text' in content) {
        return sum + (content.text as string).length;
      }
      return sum;
    }, 0);
    // Rough estimate: ~4 characters per token
    return Math.ceil(totalChars / 4);
  }

  /**
   * Get the number of times complete() or completeStream() was called.
   *
   * Useful for test assertions.
   *
   * @returns Number of calls
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * Reset the client state (call count and response index).
   *
   * Useful for test setup/teardown.
   */
  reset(): void {
    this.callCount = 0;
    this.currentIndex = 0;
  }
}
