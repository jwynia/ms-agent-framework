/**
 * Function Invoking Chat Client
 *
 * Decorator that enables automatic function calling for chat clients.
 * Wraps the complete() and completeStream() methods to detect, execute, and handle
 * function calls automatically with support for multiple iterations and approval workflows.
 *
 * @module tools/function-invoking-client
 */

import type { ChatClientProtocol } from '../chat-client/protocol.js';
import type { ChatMessage, MessageRole, Content } from '../types/chat-message.js';
import type { ChatCompletionOptions, StreamEvent } from '../chat-client/types.js';
import type { AITool } from './base-tool.js';
import { executeFunctionCalls } from './execution-engine.js';
import { getFunctionCalls } from '../types/chat-message.js';

/**
 * Default maximum number of iterations for function calling loop.
 * Prevents infinite loops when functions keep calling more functions.
 */
export const DEFAULT_MAX_ITERATIONS = 10;

/**
 * Marker symbol to track decorated chat clients.
 * Used to prevent double-decoration.
 */
const FUNCTION_INVOKING_CLIENT_MARKER = Symbol('__function_invoking_chat_client__');

/**
 * Extract tools from options if available.
 *
 * @param options - Chat completion options
 * @returns Array of tools or undefined
 */
function extractTools(options?: ChatCompletionOptions): AITool[] | undefined {
  return options?.tools;
}

/**
 * Update service thread ID in options if provided.
 *
 * @param options - Chat completion options to update
 * @param serviceThreadId - Thread ID to set
 */
function updateServiceThreadId(options: ChatCompletionOptions, serviceThreadId?: string): void {
  if (serviceThreadId) {
    options.serviceThreadId = serviceThreadId;
  }
}

/**
 * Collect function approval responses from messages.
 *
 * @param messages - Array of chat messages
 * @returns Map of approval ID to approval response content
 */
type ApprovalResponseContent = Extract<Content, { type: 'function_approval_response' }>;

function collectApprovalResponses(messages: ChatMessage[]): Map<string, ApprovalResponseContent> {
  const approvalMap = new Map<string, ApprovalResponseContent>();

  for (const message of messages) {
    const contents = Array.isArray(message.content) ? message.content : [message.content];
    for (const content of contents) {
      if (content.type === 'function_approval_response') {
        approvalMap.set(content.id, content);
      }
    }
  }

  return approvalMap;
}

/**
 * Class decorator that enables automatic function calling for a chat client.
 *
 * This decorator wraps the complete() and completeStream() methods to automatically:
 * 1. Detect function calls in assistant messages
 * 2. Execute the requested functions with argument validation
 * 3. Append function results as tool messages
 * 4. Re-invoke the chat client with results
 * 5. Repeat until no more function calls or max iterations reached
 * 6. Handle approval-required tools via FunctionApprovalRequestContent
 *
 * The decorator implements a failsafe mechanism: after max iterations, it forces
 * toolChoice to 'none' to get a final response without function calls.
 *
 * @param ChatClientClass - Chat client class to decorate
 * @returns Decorated chat client class with function invocation enabled
 *
 * @example
 * ```typescript
 * import { useFunctionInvocation } from '@microsoft/agent-framework';
 *
 * @useFunctionInvocation
 * class MyCustomClient implements ChatClientProtocol {
 *   async complete(messages: ChatMessage[], options?: ChatCompletionOptions): Promise<ChatMessage> {
 *     // Original implementation
 *   }
 *
 *   async *completeStream(messages: ChatMessage[], options?: ChatCompletionOptions): AsyncIterable<StreamEvent> {
 *     // Original implementation
 *   }
 * }
 *
 * // The client now automatically handles function calls
 * const client = new MyCustomClient();
 * const response = await client.complete(
 *   [createUserMessage('What is the weather in Seattle?')],
 *   { tools: [weatherTool] }
 * );
 * // Function is automatically called and result included in response
 * ```
 */
export function useFunctionInvocation<T extends new (...args: unknown[]) => ChatClientProtocol>(
  ChatClientClass: T
): T {
  // Check if already decorated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((ChatClientClass as any)[FUNCTION_INVOKING_CLIENT_MARKER]) {
    return ChatClientClass;
  }

  // Store original methods
  const originalComplete = ChatClientClass.prototype.complete;
  const originalCompleteStream = ChatClientClass.prototype.completeStream;

  // Wrap complete() method
  ChatClientClass.prototype.complete = async function (
    this: ChatClientProtocol,
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): Promise<ChatMessage> {
    const maxIterations = (options?.metadata?.maxIterations as number) ?? DEFAULT_MAX_ITERATIONS;
    let preparedMessages = [...messages];
    const allMessages: ChatMessage[] = [];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Check for approval responses and execute them
      const approvalResponses = collectApprovalResponses(preparedMessages);
      if (approvalResponses.size > 0) {
        const tools = extractTools(options);
        if (tools) {
          const approvedResponses = Array.from(approvalResponses.values()).filter((resp) => resp.approved);
          if (approvedResponses.length > 0) {
            const metadata = options?.metadata as Record<string, unknown> | undefined;
            const results = await executeFunctionCalls(approvedResponses, tools, metadata);

            // Replace approval responses with results
            preparedMessages = preparedMessages.map((msg) => {
              const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
              const newContents = contents.map((content) => {
                if (content.type === 'function_approval_response') {
                  const result = results.find(
                    (r) => r.type === 'function_result' && r.callId === content.functionCall.callId
                  );
                  return result || content;
                }
                return content;
              });

              return {
                ...msg,
                content: newContents.length === 1 ? newContents[0] : newContents,
                role: newContents.some((c) => c.type === 'function_result') ? ('tool' as MessageRole) : msg.role,
              };
            });
          }
        }
      }

      // Call original complete method
      const response = await originalComplete.call(this, preparedMessages, options);

      // Extract function calls from response
      const functionCalls = getFunctionCalls(response);

      // Check if service thread ID was provided
      const responseServiceThreadId = (response.metadata?.serviceThreadId as string | undefined);
      if (responseServiceThreadId && options) {
        updateServiceThreadId(options, responseServiceThreadId);
        preparedMessages = [];
      }

      // If no function calls, we're done
      const tools = extractTools(options);
      if (functionCalls.length === 0 || !tools) {
        // Add all accumulated messages to the response
        if (allMessages.length > 0) {
          return {
            ...response,
            metadata: {
              ...response.metadata,
              previousMessages: allMessages,
            },
          };
        }
        return response;
      }

      // Execute function calls
      const customArgs = options?.metadata as Record<string, unknown> | undefined;
      const results = await executeFunctionCalls(functionCalls, tools, customArgs);

      // Check if any results are approval requests
      const hasApprovalRequests = results.some((r) => r.type === 'function_approval_request');
      if (hasApprovalRequests) {
        // Add approval requests to the assistant message
        const approvalContents = results.filter((r) => r.type === 'function_approval_request');
        const existingContents = Array.isArray(response.content) ? response.content : [response.content];

        return {
          ...response,
          content: [...existingContents, ...approvalContents],
        };
      }

      // Create tool message with results
      const toolMessage: ChatMessage = {
        role: 'tool' as MessageRole,
        content: results,
        timestamp: new Date(),
      };

      // Track all messages
      allMessages.push(response, toolMessage);

      // Update messages for next iteration
      if (responseServiceThreadId) {
        // Service-managed: only send the tool message
        preparedMessages = [toolMessage];
      } else {
        // Client-managed: append response and results
        preparedMessages = [...preparedMessages, response, toolMessage];
      }
    }

    // Failsafe: max iterations reached, force no tools
    const finalResponse = await originalComplete.call(this, preparedMessages, {
      ...options,
      tools: undefined,
      metadata: {
        ...options?.metadata,
        toolChoice: 'none',
      },
    });

    // Include all previous messages in metadata
    if (allMessages.length > 0) {
      return {
        ...finalResponse,
        metadata: {
          ...finalResponse.metadata,
          previousMessages: allMessages,
        },
      };
    }

    return finalResponse;
  };

  // Wrap completeStream() method
  ChatClientClass.prototype.completeStream = async function* (
    this: ChatClientProtocol,
    messages: ChatMessage[],
    options?: ChatCompletionOptions
  ): AsyncIterable<StreamEvent> {
    const maxIterations = (options?.metadata?.maxIterations as number) ?? DEFAULT_MAX_ITERATIONS;
    let preparedMessages = [...messages];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Check for approval responses and execute them
      const approvalResponses = collectApprovalResponses(preparedMessages);
      if (approvalResponses.size > 0) {
        const tools = extractTools(options);
        if (tools) {
          const approvedResponses = Array.from(approvalResponses.values()).filter((resp) => resp.approved);
          if (approvedResponses.length > 0) {
            const metadata = options?.metadata as Record<string, unknown> | undefined;
            const results = await executeFunctionCalls(approvedResponses, tools, metadata);

            // Replace approval responses with results
            preparedMessages = preparedMessages.map((msg) => {
              const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
              const newContents = contents.map((content) => {
                if (content.type === 'function_approval_response') {
                  const result = results.find(
                    (r) => r.type === 'function_result' && r.callId === content.functionCall.callId
                  );
                  return result || content;
                }
                return content;
              });

              return {
                ...msg,
                content: newContents.length === 1 ? newContents[0] : newContents,
                role: newContents.some((c) => c.type === 'function_result') ? ('tool' as MessageRole) : msg.role,
              };
            });
          }
        }
      }

      // Collect all events from stream
      const events: StreamEvent[] = [];
      for await (const event of originalCompleteStream.call(this, preparedMessages, options)) {
        events.push(event);
        yield event;
      }

      // Reconstruct message from events
      const deltaEvents = events.filter((e) => e.type === 'message_delta');
      if (deltaEvents.length === 0) {
        return;
      }

      // Merge all deltas into a complete message
      let fullMessage: ChatMessage = {
        role: 'assistant' as MessageRole,
        content: [],
        timestamp: new Date(),
      };

      for (const event of deltaEvents) {
        if (event.type === 'message_delta') {
          const delta = event.delta;
          if (delta.content) {
            const deltaContents = Array.isArray(delta.content) ? delta.content : [delta.content];
            const existingContents = Array.isArray(fullMessage.content) ? fullMessage.content : [fullMessage.content];
            fullMessage.content = [...existingContents, ...deltaContents];
          }
          if (delta.role) {
            fullMessage.role = delta.role;
          }
        }
      }

      // Extract function calls
      const functionCalls = getFunctionCalls(fullMessage);

      // Check for service thread ID
      const metadataEvent = events.find((e) => e.type === 'metadata');
      const serviceThreadId = metadataEvent?.metadata?.serviceThreadId as string | undefined;
      if (serviceThreadId && options) {
        updateServiceThreadId(options, serviceThreadId);
        preparedMessages = [];
      }

      // If no function calls, we're done
      const tools = extractTools(options);
      if (functionCalls.length === 0 || !tools) {
        return;
      }

      // Execute function calls
      const customArgs = options?.metadata as Record<string, unknown> | undefined;
      const results = await executeFunctionCalls(functionCalls, tools, customArgs);

      // Check for approval requests
      const hasApprovalRequests = results.some((r) => r.type === 'function_approval_request');
      if (hasApprovalRequests) {
        // Yield approval requests as part of assistant message
        const approvalContents = results.filter((r) => r.type === 'function_approval_request');
        for (const content of approvalContents) {
          yield {
            type: 'message_delta',
            delta: {
              role: 'assistant' as MessageRole,
              content: content,
            },
          };
        }
        return;
      }

      // Yield function results as tool message
      for (const result of results) {
        yield {
          type: 'message_delta',
          delta: {
            role: 'tool' as MessageRole,
            content: result,
          },
        };
      }

      // Create tool message for next iteration
      const toolMessage: ChatMessage = {
        role: 'tool' as MessageRole,
        content: results,
        timestamp: new Date(),
      };

      // Update messages for next iteration
      if (serviceThreadId) {
        preparedMessages = [toolMessage];
      } else {
        preparedMessages = [...preparedMessages, fullMessage, toolMessage];
      }
    }

    // Failsafe: max iterations reached, force no tools
    for await (const event of originalCompleteStream.call(this, preparedMessages, {
      ...options,
      tools: undefined,
      metadata: {
        ...options?.metadata,
        toolChoice: 'none',
      },
    })) {
      yield event;
    }
  };

  // Mark as decorated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ChatClientClass as any)[FUNCTION_INVOKING_CLIENT_MARKER] = true;

  return ChatClientClass;
}
