/**
 * Tests for Function Invoking Chat Client
 *
 * Tests for the useFunctionInvocation decorator that enables automatic function calling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { useFunctionInvocation, DEFAULT_MAX_ITERATIONS } from '../function-invoking-client';
import type { ChatClientProtocol } from '../../chat-client/protocol';
import type { ChatMessage, MessageRole } from '../../types/chat-message';
import type { ChatCompletionOptions, StreamEvent } from '../../chat-client/types';
import type { AITool } from '../base-tool';
import { createUserMessage } from '../../types/chat-message';

describe('Function Invoking Chat Client', () => {
  let mockTool: AITool;
  let BaseMockClient: new () => ChatClientProtocol;

  beforeEach(() => {
    mockTool = {
      name: 'test_tool',
      description: 'A test tool',
      schema: z.object({
        x: z.number(),
      }),
      execute: vi.fn().mockResolvedValue({ result: 'success' }),
    };

    // Create a mock chat client class
    class MockClient implements ChatClientProtocol {
      async complete(_messages: ChatMessage[], _options?: ChatCompletionOptions): Promise<ChatMessage> {
        return {
          role: 'assistant' as MessageRole,
          content: { type: 'text' as const, text: 'Mock response' },
          timestamp: new Date(),
        };
      }

      async *completeStream(_messages: ChatMessage[], _options?: ChatCompletionOptions): AsyncIterable<StreamEvent> {
        yield {
          type: 'message_delta',
          delta: {
            role: 'assistant' as MessageRole,
            content: { type: 'text' as const, text: 'Mock stream' },
          },
        };
      }
    }

    BaseMockClient = MockClient;
  });

  describe('useFunctionInvocation decorator', () => {
    it('should not double-decorate a client', () => {
      const DecoratedClient1 = useFunctionInvocation(BaseMockClient);
      const DecoratedClient2 = useFunctionInvocation(DecoratedClient1);

      expect(DecoratedClient1).toBe(DecoratedClient2);
    });

    it('should detect and execute function calls', async () => {
      class MockClientWithFunctionCall implements ChatClientProtocol {
        async complete(messages: ChatMessage[], _options?: ChatCompletionOptions): Promise<ChatMessage> {
          // First call: return function call
          if (messages.length === 1) {
            return {
              role: 'assistant' as MessageRole,
              content: {
                type: 'function_call' as const,
                callId: 'call_123',
                name: 'test_tool',
                arguments: '{"x": 5}',
              },
              timestamp: new Date(),
            };
          }

          // Second call: return text after function execution
          return {
            role: 'assistant' as MessageRole,
            content: { type: 'text' as const, text: 'Function executed successfully' },
            timestamp: new Date(),
          };
        }

        async *completeStream(): AsyncIterable<StreamEvent> {
          yield {
            type: 'message_delta',
            delta: { role: 'assistant' as MessageRole, content: { type: 'text' as const, text: 'Stream' } },
          };
        }
      }

      const DecoratedClient = useFunctionInvocation(MockClientWithFunctionCall);
      const client = new DecoratedClient();

      const response = await client.complete([createUserMessage('Test')], { tools: [mockTool] });

      expect(mockTool.execute).toHaveBeenCalledWith({ x: 5 });
      expect(response.content).toEqual({ type: 'text', text: 'Function executed successfully' });
    });

    it('should handle multiple function calls in one response', async () => {
      const tool2: AITool = {
        name: 'tool2',
        description: 'Second tool',
        schema: z.object({ y: z.string() }),
        execute: vi.fn().mockResolvedValue({ result: 'tool2 success' }),
      };

      class MockClientWithMultipleCalls implements ChatClientProtocol {
        async complete(messages: ChatMessage[], _options?: ChatCompletionOptions): Promise<ChatMessage> {
          if (messages.length === 1) {
            return {
              role: 'assistant' as MessageRole,
              content: [
                {
                  type: 'function_call' as const,
                  callId: 'call_1',
                  name: 'test_tool',
                  arguments: '{"x": 5}',
                },
                {
                  type: 'function_call' as const,
                  callId: 'call_2',
                  name: 'tool2',
                  arguments: '{"y": "hello"}',
                },
              ],
              timestamp: new Date(),
            };
          }

          return {
            role: 'assistant' as MessageRole,
            content: { type: 'text' as const, text: 'Both functions executed' },
            timestamp: new Date(),
          };
        }

        async *completeStream(): AsyncIterable<StreamEvent> {
          yield {
            type: 'message_delta',
            delta: { role: 'assistant' as MessageRole, content: { type: 'text' as const, text: 'Stream' } },
          };
        }
      }

      const DecoratedClient = useFunctionInvocation(MockClientWithMultipleCalls);
      const client = new DecoratedClient();

      const response = await client.complete([createUserMessage('Test')], { tools: [mockTool, tool2] });

      expect(mockTool.execute).toHaveBeenCalledWith({ x: 5 });
      expect(tool2.execute).toHaveBeenCalledWith({ y: 'hello' });
      expect(response.content).toEqual({ type: 'text', text: 'Both functions executed' });
    });

    it('should respect max iterations limit', async () => {
      let callCount = 0;

      class MockClientInfiniteLoop implements ChatClientProtocol {
        async complete(_messages: ChatMessage[], _options?: ChatCompletionOptions): Promise<ChatMessage> {
          callCount++;

          // Always return a function call (creates infinite loop)
          return {
            role: 'assistant' as MessageRole,
            content: {
              type: 'function_call' as const,
              callId: `call_${callCount}`,
              name: 'test_tool',
              arguments: '{"x": 5}',
            },
            timestamp: new Date(),
          };
        }

        async *completeStream(): AsyncIterable<StreamEvent> {
          yield {
            type: 'message_delta',
            delta: { role: 'assistant' as MessageRole, content: { type: 'text' as const, text: 'Stream' } },
          };
        }
      }

      const DecoratedClient = useFunctionInvocation(MockClientInfiniteLoop);
      const client = new DecoratedClient();

      await client.complete([createUserMessage('Test')], { tools: [mockTool] });

      // Should call max_iterations times, then one final call with no tools
      expect(callCount).toBe(DEFAULT_MAX_ITERATIONS + 1);
    });

    it('should handle approval-required tools', async () => {
      mockTool.metadata = { approvalMode: 'always_require' };

      class MockClientWithApproval implements ChatClientProtocol {
        async complete(_messages: ChatMessage[], _options?: ChatCompletionOptions): Promise<ChatMessage> {
          return {
            role: 'assistant' as MessageRole,
            content: {
              type: 'function_call' as const,
              callId: 'call_123',
              name: 'test_tool',
              arguments: '{"x": 5}',
            },
            timestamp: new Date(),
          };
        }

        async *completeStream(): AsyncIterable<StreamEvent> {
          yield {
            type: 'message_delta',
            delta: { role: 'assistant' as MessageRole, content: { type: 'text' as const, text: 'Stream' } },
          };
        }
      }

      const DecoratedClient = useFunctionInvocation(MockClientWithApproval);
      const client = new DecoratedClient();

      const response = await client.complete([createUserMessage('Test')], { tools: [mockTool] });

      expect(mockTool.execute).not.toHaveBeenCalled();
      const contents = Array.isArray(response.content) ? response.content : [response.content];
      const approvalRequest = contents.find((c) => c.type === 'function_approval_request');
      expect(approvalRequest).toBeDefined();
    });

    it('should handle service-managed threads', async () => {
      let callCount = 0;

      class MockClientWithServiceThread implements ChatClientProtocol {
        async complete(messages: ChatMessage[], _options?: ChatCompletionOptions): Promise<ChatMessage> {
          callCount++;

          if (callCount === 1) {
            return {
              role: 'assistant' as MessageRole,
              content: {
                type: 'function_call' as const,
                callId: 'call_123',
                name: 'test_tool',
                arguments: '{"x": 5}',
              },
              timestamp: new Date(),
              metadata: { serviceThreadId: 'thread_123' },
            };
          }

          // On second call, messages should be cleared (service-managed)
          expect(messages.length).toBe(1); // Only the tool result message
          expect(messages[0].role).toBe('tool');

          return {
            role: 'assistant' as MessageRole,
            content: { type: 'text' as const, text: 'Final response' },
            timestamp: new Date(),
          };
        }

        async *completeStream(): AsyncIterable<StreamEvent> {
          yield {
            type: 'message_delta',
            delta: { role: 'assistant' as MessageRole, content: { type: 'text' as const, text: 'Stream' } },
          };
        }
      }

      const DecoratedClient = useFunctionInvocation(MockClientWithServiceThread);
      const client = new DecoratedClient();

      const response = await client.complete([createUserMessage('Test')], { tools: [mockTool] });

      expect(mockTool.execute).toHaveBeenCalled();
      expect(response.content).toEqual({ type: 'text', text: 'Final response' });
    });

    it('should return immediately when no tools are provided', async () => {
      const DecoratedClient = useFunctionInvocation(BaseMockClient);
      const client = new DecoratedClient();

      const response = await client.complete([createUserMessage('Test')]);

      expect(response.content).toEqual({ type: 'text', text: 'Mock response' });
    });

    it('should handle streaming with function calls', async () => {
      class MockStreamingClient implements ChatClientProtocol {
        async complete(_messages: ChatMessage[], _options?: ChatCompletionOptions): Promise<ChatMessage> {
          return {
            role: 'assistant' as MessageRole,
            content: { type: 'text' as const, text: 'Complete' },
            timestamp: new Date(),
          };
        }

        async *completeStream(messages: ChatMessage[], _options?: ChatCompletionOptions): AsyncIterable<StreamEvent> {
          // First stream: return function call
          if (messages.length === 1) {
            yield {
              type: 'message_delta',
              delta: {
                role: 'assistant' as MessageRole,
                content: {
                  type: 'function_call' as const,
                  callId: 'call_123',
                  name: 'test_tool',
                  arguments: '{"x": 5}',
                },
              },
            };
          } else {
            // Second stream: return text after function execution
            yield {
              type: 'message_delta',
              delta: {
                role: 'assistant' as MessageRole,
                content: { type: 'text' as const, text: 'Function executed in stream' },
              },
            };
          }
        }
      }

      const DecoratedClient = useFunctionInvocation(MockStreamingClient);
      const client = new DecoratedClient();

      const events: StreamEvent[] = [];
      for await (const event of client.completeStream([createUserMessage('Test')], { tools: [mockTool] })) {
        events.push(event);
      }

      expect(mockTool.execute).toHaveBeenCalledWith({ x: 5 });

      // Should have function call delta, function result delta, and final text delta
      expect(events.length).toBeGreaterThan(0);

      const functionResults = events.filter((e) => {
        if (e.type === 'message_delta') {
          const content = e.delta.content;
          return content && (content as any).type === 'function_result';
        }
        return false;
      });
      expect(functionResults.length).toBeGreaterThan(0);
    });
  });
});
