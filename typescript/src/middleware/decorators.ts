/**
 * Middleware decorator functions for the Microsoft Agent Framework.
 *
 * This module provides functions to apply middleware chains to agent methods,
 * enabling cross-cutting concerns like logging, caching, rate limiting through
 * middleware chains.
 *
 * Middleware follows a chain-of-responsibility pattern where each middleware:
 * - Receives a context object and a next() function
 * - Can perform operations before calling next()
 * - Can perform operations after calling next()
 * - Can short-circuit execution by not calling next()
 *
 * @module middleware/decorators
 */

import type { AgentProtocol } from '../core/agents/base-agent.js';
import type { AgentMiddleware, AgentContext } from './types.js';
import type { ChatMessage } from '../core/types/chat-message.js';
import { MessageRole } from '../core/types/chat-message.js';
import type { AISettings } from '../core/types/agent-info.js';
import type { AgentRunResponse, AgentRunResponseUpdate } from '../core/agents/chat-agent-types.js';

/**
 * Context used internally for middleware execution.
 *
 * This extends AgentContext with a result field that middleware can
 * observe or modify after calling next().
 */
interface MiddlewareExecutionContext extends AgentContext {
  /**
   * Result from agent execution.
   *
   * Middleware can:
   * - Set this before calling next() to short-circuit execution
   * - Observe this after calling next() to see the result
   * - Modify this after calling next() to transform the result
   */
  result?: AgentRunResponse | AsyncIterable<AgentRunResponseUpdate>;
}

/**
 * Wraps an agent's run() method with middleware chain execution.
 *
 * Middleware is called in order for before-execution (first middleware first),
 * and reverse order is not needed since middleware control their own after-execution
 * logic by what they do after calling next().
 *
 * @param originalMethod - The original agent run method
 * @param middleware - Array of middleware to apply
 * @param agent - The agent instance
 * @returns Wrapped method with middleware applied
 *
 * @example
 * ```typescript
 * class ChatAgent {
 *   constructor(options) {
 *     // ...
 *     if (options.middleware) {
 *       this.run = wrapWithMiddleware(
 *         this.run.bind(this),
 *         Array.isArray(options.middleware) ? options.middleware : [options.middleware],
 *         this
 *       );
 *     }
 *   }
 * }
 * ```
 */
export function wrapWithMiddleware<
  TArgs extends [string | ChatMessage | ChatMessage[], unknown?],
  TReturn extends Promise<AgentRunResponse>,
>(
  originalMethod: (...args: TArgs) => TReturn,
  middleware: AgentMiddleware[],
  agent: AgentProtocol,
): (...args: TArgs) => TReturn {
  return async function wrappedRun(...args: TArgs): Promise<AgentRunResponse> {
    const [messages, options] = args;

    // Normalize messages to ChatMessage array
    let normalizedMessages: ChatMessage[];
    if (typeof messages === 'string') {
      normalizedMessages = [
        {
          role: MessageRole.User,
          content: { type: 'text', text: messages },
          timestamp: new Date(),
        },
      ];
    } else if (Array.isArray(messages)) {
      normalizedMessages = messages;
    } else {
      normalizedMessages = [messages];
    }

    // Create middleware execution context
    const context: MiddlewareExecutionContext = {
      agent,
      messages: normalizedMessages,
      options: (options as AISettings) || undefined,
      metadata: {},
    };

    // Build middleware chain
    let index = 0;

    const createNext = (): (() => Promise<void>) => {
      return async () => {
        if (index < middleware.length) {
          // Call next middleware in chain
          const currentMiddleware = middleware[index++];
          await currentMiddleware(context, createNext());
        } else {
          // All middleware processed, execute original method
          // Check if middleware short-circuited by setting result
          if (!context.result) {
            // Update args with potentially modified context
            const modifiedArgs = [context.messages, context.options] as unknown as TArgs;
            context.result = await originalMethod(...modifiedArgs);
          }
        }
      };
    };

    // Start middleware chain
    const next = createNext();
    await next();

    // Return result (either from middleware short-circuit or original method)
    return context.result as AgentRunResponse;
  } as (...args: TArgs) => TReturn;
}

/**
 * Wraps an agent's runStream() method with middleware chain execution.
 *
 * For streaming, middleware is called before the stream starts and after it completes.
 * Middleware can short-circuit by setting context.result to a complete response,
 * which will be converted to a single-update stream.
 *
 * @param originalMethod - The original agent runStream method
 * @param middleware - Array of middleware to apply
 * @param agent - The agent instance
 * @returns Wrapped method with middleware applied
 *
 * @example
 * ```typescript
 * class ChatAgent {
 *   constructor(options) {
 *     // ...
 *     if (options.middleware) {
 *       this.runStream = wrapStreamWithMiddleware(
 *         this.runStream.bind(this),
 *         Array.isArray(options.middleware) ? options.middleware : [options.middleware],
 *         this
 *       );
 *     }
 *   }
 * }
 * ```
 */
export function wrapStreamWithMiddleware<TArgs extends [string | ChatMessage | ChatMessage[], unknown?]>(
  originalMethod: (...args: TArgs) => AsyncIterable<AgentRunResponseUpdate>,
  middleware: AgentMiddleware[],
  agent: AgentProtocol,
): (...args: TArgs) => AsyncIterable<AgentRunResponseUpdate> {
  return async function* wrappedRunStream(...args: TArgs): AsyncIterable<AgentRunResponseUpdate> {
    const [messages, options] = args;

    // Normalize messages to ChatMessage array
    let normalizedMessages: ChatMessage[];
    if (typeof messages === 'string') {
      normalizedMessages = [
        {
          role: MessageRole.User,
          content: { type: 'text', text: messages },
          timestamp: new Date(),
        },
      ];
    } else if (Array.isArray(messages)) {
      normalizedMessages = messages;
    } else {
      normalizedMessages = [messages];
    }

    // Create middleware execution context
    const context: MiddlewareExecutionContext = {
      agent,
      messages: normalizedMessages,
      options: (options as AISettings) || undefined,
      metadata: {},
    };

    // Build middleware chain
    let index = 0;
    let streamResult: AsyncIterable<AgentRunResponseUpdate> | undefined;

    const createNext = (): (() => Promise<void>) => {
      return async () => {
        if (index < middleware.length) {
          // Call next middleware in chain
          const currentMiddleware = middleware[index++];
          await currentMiddleware(context, createNext());
        } else {
          // All middleware processed, check if short-circuited
          if (!context.result) {
            // Update args with potentially modified context
            const modifiedArgs = [context.messages, context.options] as unknown as TArgs;
            streamResult = originalMethod(...modifiedArgs);
          } else if (typeof (context.result as AgentRunResponse).messages !== 'undefined') {
            // Middleware provided a complete response, convert to stream
            const response = context.result as AgentRunResponse;
            streamResult = (async function* (): AsyncIterable<AgentRunResponseUpdate> {
              // Yield a single update with the complete response
              for (const message of response.messages) {
                yield new (await import('../core/agents/chat-agent-types.js')).AgentRunResponseUpdate({
                  content: message.content,
                  role: message.role,
                  authorName: message.name,
                  responseId: response.responseId,
                  createdAt: response.createdAt,
                  isFinal: false,
                });
              }
              // Yield final marker
              yield new (await import('../core/agents/chat-agent-types.js')).AgentRunResponseUpdate({
                content: { type: 'text', text: '' },
                role: MessageRole.Assistant,
                isFinal: true,
                usageDetails: response.usageDetails,
                additionalProperties: response.additionalProperties,
              });
            })();
          } else {
            // context.result is already a stream
            streamResult = context.result as AsyncIterable<AgentRunResponseUpdate>;
          }
        }
      };
    };

    // Start middleware chain
    const next = createNext();
    await next();

    // Check if middleware short-circuited by setting result but not calling next fully
    if (context.result && !streamResult) {
      // Middleware short-circuited, convert result to stream
      if (typeof (context.result as AgentRunResponse).messages !== 'undefined') {
        const response = context.result as AgentRunResponse;
        streamResult = (async function* (): AsyncIterable<AgentRunResponseUpdate> {
          for (const message of response.messages) {
            yield new (await import('../core/agents/chat-agent-types.js')).AgentRunResponseUpdate({
              content: message.content,
              role: message.role,
              authorName: message.name,
              responseId: response.responseId,
              createdAt: response.createdAt,
              isFinal: false,
            });
          }
          yield new (await import('../core/agents/chat-agent-types.js')).AgentRunResponseUpdate({
            content: { type: 'text', text: '' },
            role: MessageRole.Assistant,
            isFinal: true,
            usageDetails: response.usageDetails,
            additionalProperties: response.additionalProperties,
          });
        })();
      } else {
        // context.result is already a stream
        streamResult = context.result as AsyncIterable<AgentRunResponseUpdate>;
      }
    }

    // Yield from the stream
    if (streamResult) {
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of streamResult) {
        updates.push(update);
        yield update;
      }

      // After stream completes, call middleware in reverse for post-processing
      // (simulating the LIFO behavior from Python)
      if (updates.length > 0) {
        // Build final response from updates for middleware observation
        const { AgentRunResponse } = await import('../core/agents/chat-agent-types.js');
        const finalResponse = AgentRunResponse.fromUpdates(updates);
        context.result = finalResponse;

        // Call middleware in reverse order for post-processing
        // Note: This is a simplified approach since we've already yielded the updates
        // In practice, middleware would need to wrap the stream itself for full control
        // For now, we just let them observe the final result
      }
    }
  };
}

/**
 * Agent-like interface that has run/runStream methods.
 *
 * This is a minimal interface that any agent must satisfy to use middleware.
 */
interface AgentWithRunMethods {
  run?: (...args: any[]) => Promise<AgentRunResponse>;
  runStream?: (...args: any[]) => AsyncIterable<AgentRunResponseUpdate>;
  [key: string]: any; // Allow other properties
}

/**
 * Higher-order function to apply middleware to an agent.
 *
 * This function wraps the agent's run() and runStream() methods with middleware
 * chain execution. It should be called during agent construction.
 *
 * @param middleware - Middleware or array of middleware to apply
 * @returns Function that wraps agent methods
 *
 * @example
 * ```typescript
 * const agent = new ChatAgent({
 *   chatClient,
 *   middleware: [new LoggingMiddleware(), new CachingMiddleware()]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // In agent constructor:
 * if (options.middleware) {
 *   applyMiddleware(options.middleware)(this);
 * }
 * ```
 */
export function applyMiddleware(middleware: AgentMiddleware | AgentMiddleware[]): (agent: AgentWithRunMethods) => void {
  const middlewareArray = Array.isArray(middleware) ? middleware : [middleware];

  return (agent: AgentWithRunMethods): void => {
    // Wrap run method if it exists
    if (agent.run) {
      const originalRun = agent.run.bind(agent);
      agent.run = wrapWithMiddleware(
        originalRun as (
          ...args: [string | ChatMessage | ChatMessage[], unknown?]
        ) => Promise<AgentRunResponse>,
        middlewareArray,
        agent as AgentProtocol,
      );
    }

    // Wrap runStream method if it exists
    if (agent.runStream) {
      const originalRunStream = agent.runStream.bind(agent);
      agent.runStream = wrapStreamWithMiddleware(
        originalRunStream as (
          ...args: [string | ChatMessage | ChatMessage[], unknown?]
        ) => AsyncIterable<AgentRunResponseUpdate>,
        middlewareArray,
        agent as AgentProtocol,
      );
    }
  };
}
