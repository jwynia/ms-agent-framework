/**
 * Simple Context Provider - Returns static context for every invocation.
 *
 * This module provides a simple implementation of ContextProvider that returns
 * the same static context (instructions, messages, tools) for every invocation.
 * Ideal for providing static instructions or system messages.
 *
 * @module simple-context-provider
 */

import { ContextProvider, AIContext } from './context-provider.js';
import { ChatMessage } from '../types/chat-message.js';
import { AITool } from '../tools/base-tool.js';

/**
 * Simple context provider that returns static context.
 *
 * This provider accepts a static AIContext object and returns it unchanged
 * for every invocation. It's useful for:
 * - Providing static instructions that should apply to all agent interactions
 * - Including fixed system messages in every context
 * - Adding a consistent set of tools to every invocation
 *
 * The provider does not maintain state or modify context based on conversation history.
 * All lifecycle hooks (`threadCreated`, `invoked`) are no-ops.
 *
 * @example
 * ```typescript
 * import { SimpleContextProvider } from '@microsoft/agent-framework-ts';
 *
 * // Create provider with static instructions
 * const provider = new SimpleContextProvider({
 *   instructions: 'Always be helpful and concise.',
 * });
 *
 * // Use with a chat agent
 * const agent = new ChatAgent({
 *   chatClient: client,
 *   contextProviders: [provider],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Create provider with instructions, messages, and tools
 * const provider = new SimpleContextProvider({
 *   instructions: 'You are a helpful coding assistant. Use the provided tools to help users.',
 *   messages: [
 *     {
 *       role: 'system',
 *       content: { type: 'text', text: 'Remember to follow best practices.' }
 *     }
 *   ],
 *   tools: [myTool],
 * });
 *
 * // Every invocation will receive the same context
 * const context = await provider.invoking([]);
 * // context.instructions === 'You are a helpful coding assistant...'
 * // context.messages.length === 1
 * // context.tools.length === 1
 * ```
 *
 * @example
 * ```typescript
 * // Empty provider returns empty context
 * const emptyProvider = new SimpleContextProvider({});
 * const context = await emptyProvider.invoking([]);
 * // context.instructions === undefined
 * // context.messages === []
 * // context.tools === []
 * ```
 */
export class SimpleContextProvider extends ContextProvider {
  private readonly staticContext: AIContext;

  /**
   * Create a new SimpleContextProvider with static context.
   *
   * @param context - The static context to return for every invocation.
   *   Can include instructions, messages, and/or tools.
   *
   * @example
   * ```typescript
   * const provider = new SimpleContextProvider({
   *   instructions: 'Always be helpful.',
   *   messages: [],
   *   tools: [],
   * });
   * ```
   */
  constructor(context: AIContext) {
    super();
    this.staticContext = {
      instructions: context.instructions,
      messages: context.messages || [],
      tools: context.tools || [],
    };
  }

  /**
   * Called just before the model/agent is invoked.
   *
   * Returns the static context provided at construction time, unchanged.
   * Does not analyze or use the provided messages.
   *
   * @param _messages - The most recent messages (not used by this provider)
   * @param _tools - Optional tools (not used by this provider)
   * @returns A Promise resolving to the static AIContext
   *
   * @example
   * ```typescript
   * const provider = new SimpleContextProvider({
   *   instructions: 'Be concise.',
   * });
   *
   * const context1 = await provider.invoking([message1]);
   * const context2 = await provider.invoking([message1, message2]);
   * // Both contexts are identical regardless of input messages
   * ```
   */
  async invoking(_messages: ChatMessage[], _tools?: AITool[]): Promise<AIContext> {
    return {
      instructions: this.staticContext.instructions,
      messages: [...(this.staticContext.messages || [])],
      tools: [...(this.staticContext.tools || [])],
    };
  }

  /**
   * Called just after a new thread is created.
   *
   * This is a no-op for SimpleContextProvider as it doesn't maintain per-thread state.
   *
   * @param _threadId - The ID of the new thread (not used)
   */
  async threadCreated(_threadId: string): Promise<void> {
    // No-op: SimpleContextProvider doesn't maintain per-thread state
  }

  /**
   * Called after the agent has received a response from the underlying inference service.
   *
   * This is a no-op for SimpleContextProvider as it doesn't track responses or update state.
   *
   * @param _response - The response message (not used)
   * @param _context - The context used for invocation (not used)
   */
  async invoked(_response: ChatMessage, _context: AIContext): Promise<void> {
    // No-op: SimpleContextProvider doesn't track responses
  }
}
