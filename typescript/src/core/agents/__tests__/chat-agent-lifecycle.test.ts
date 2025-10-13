/**
 * TASK-106b: ChatAgent Lifecycle Hook Implementation Tests
 *
 * Comprehensive test coverage for the ChatAgent's lifecycle hook implementation.
 * Tests invoking(), invoked(), and threadCreated() lifecycle hooks with error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatAgent } from '../chat-agent.js';
import type { ChatClientProtocol } from '../../chat-client/protocol.js';
import { createUserMessage, createAssistantMessage } from '../../types/chat-message.js';
import { InMemoryMessageStore } from '../../storage/in-memory-store.js';
import type { ContextProvider, AIContext } from '../../context/context-provider.js';
import type { AITool } from '../../tools/base-tool.js';

describe('TASK-106b: ChatAgent Lifecycle Hooks', () => {
  let mockClient: ChatClientProtocol;

  beforeEach(() => {
    // Create a mock chat client
    mockClient = {
      complete: vi.fn(),
      completeStream: vi.fn(),
    } as unknown as ChatClientProtocol;
  });

  describe('invoking() Lifecycle Hook', () => {
    it('should call invoking() before execution', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      expect(mockProvider.invoking).toHaveBeenCalledTimes(1);
      expect(mockProvider.invoking).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.objectContaining({ text: 'test message' }),
          }),
        ]),
        undefined, // No tools
      );
    });

    it('should call invoking() before chat client', async () => {
      let invokingCalled = false;
      let completeCalled = false;

      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockImplementation(async () => {
          invokingCalled = true;
          expect(completeCalled).toBe(false);
          return {} as AIContext;
        }),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockImplementation(async () => {
        completeCalled = true;
        expect(invokingCalled).toBe(true);
        return responseMessage;
      });

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      expect(invokingCalled).toBe(true);
      expect(completeCalled).toBe(true);
    });

    it('should merge context instructions', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Additional instructions from context',
        } as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: 'Base instructions',
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0];

      expect(messages[0].content).toEqual(
        expect.objectContaining({
          text: expect.stringContaining('Base instructions'),
        }),
      );
      expect(messages[0].content).toEqual(
        expect.objectContaining({
          text: expect.stringContaining('Additional instructions from context'),
        }),
      );
    });

    it('should merge context messages', async () => {
      const contextMsg = createUserMessage('Context message');
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          messages: [contextMsg],
        } as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0];

      const hasContextMessage = messages.some(
        (m: any) => m.content?.text === 'Context message',
      );
      expect(hasContextMessage).toBe(true);
    });

    it('should merge context tools', async () => {
      const contextTool: AITool = { name: 'context_tool', description: 'From context' } as AITool;
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          tools: [contextTool],
        } as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const baseTool: AITool = { name: 'base_tool', description: 'Base tool' } as AITool;
      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [baseTool],
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;

      expect(options.tools).toEqual(expect.arrayContaining([baseTool, contextTool]));
    });

    it('should continue execution if invoking() throws', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockRejectedValue(new Error('Invoking failed')),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      // Should not throw
      const response = await agent.run('test message');

      expect(response).toBeDefined();
      expect(mockClient.complete).toHaveBeenCalled();
      expect(mockProvider.invoking).toHaveBeenCalled();
    });

    it('should call invoking() on multiple providers', async () => {
      const provider1: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Context 1',
        } as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const provider2: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Context 2',
        } as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [provider1, provider2],
      });

      await agent.run('test message');

      expect(provider1.invoking).toHaveBeenCalledTimes(1);
      expect(provider2.invoking).toHaveBeenCalledTimes(1);
    });
  });

  describe('invoked() Lifecycle Hook', () => {
    it('should call invoked() after successful execution', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      expect(mockProvider.invoked).toHaveBeenCalledTimes(1);
      expect(mockProvider.invoked).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ text: 'Response' }),
        }),
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.objectContaining({ text: 'test message' }),
            }),
          ]),
        }),
      );
    });

    it('should call invoked() after chat client completes', async () => {
      let completeFinished = false;
      let invokedCalled = false;

      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn().mockImplementation(async () => {
          invokedCalled = true;
          expect(completeFinished).toBe(true);
        }),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockImplementation(async () => {
        completeFinished = true;
        expect(invokedCalled).toBe(false);
        return responseMessage;
      });

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      expect(completeFinished).toBe(true);
      expect(invokedCalled).toBe(true);
    });

    it('should continue execution if invoked() throws', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn().mockRejectedValue(new Error('Invoked failed')),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      // Should not throw
      const response = await agent.run('test message');

      expect(response).toBeDefined();
      expect(mockProvider.invoked).toHaveBeenCalled();
    });

    it('should call invoked() on multiple providers', async () => {
      const provider1: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const provider2: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [provider1, provider2],
      });

      await agent.run('test message');

      expect(provider1.invoked).toHaveBeenCalledTimes(1);
      expect(provider2.invoked).toHaveBeenCalledTimes(1);
    });
  });

  describe('threadCreated() Lifecycle Hook', () => {
    it('should call threadCreated() when service thread is created', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-123' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      expect(mockProvider.threadCreated).toHaveBeenCalledTimes(1);
      expect(mockProvider.threadCreated).toHaveBeenCalledWith('conv-123');
    });

    it('should not call threadCreated() for local threads', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      // No conversationId
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      expect(mockProvider.threadCreated).not.toHaveBeenCalled();
    });

    it('should call threadCreated() only once per thread', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-123' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      const thread = agent.getNewThread();

      await agent.run('first message', { thread });
      await agent.run('second message', { thread });

      // Should only be called once when thread is first determined
      expect(mockProvider.threadCreated).toHaveBeenCalledTimes(1);
      expect(mockProvider.threadCreated).toHaveBeenCalledWith('conv-123');
    });

    it('should continue execution if threadCreated() throws', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn().mockRejectedValue(new Error('Thread created failed')),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-123' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      // Should not throw
      const response = await agent.run('test message');

      expect(response).toBeDefined();
      expect(mockProvider.threadCreated).toHaveBeenCalled();
    });

    it('should call threadCreated() on multiple providers', async () => {
      const provider1: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const provider2: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-123' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [provider1, provider2],
      });

      await agent.run('test message');

      expect(provider1.threadCreated).toHaveBeenCalledTimes(1);
      expect(provider2.threadCreated).toHaveBeenCalledTimes(1);
      expect(provider1.threadCreated).toHaveBeenCalledWith('conv-123');
      expect(provider2.threadCreated).toHaveBeenCalledWith('conv-123');
    });
  });

  describe('Streaming Lifecycle Hooks', () => {
    it('should call lifecycle hooks in runStream()', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-456' };

      vi.mocked(mockClient.completeStream).mockImplementation(async function* () {
        yield {
          type: 'message_delta' as const,
          delta: {
            role: 'assistant' as any,
            content: { type: 'text' as const, text: 'Response' },
            timestamp: new Date(),
          },
        } as any;
        yield {
          type: 'metadata' as const,
          metadata: { conversationId: 'conv-456' },
        } as any;
      } as any);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      const updates = [];
      for await (const update of agent.runStream('test message')) {
        updates.push(update);
      }

      expect(mockProvider.invoking).toHaveBeenCalledTimes(1);
      expect(mockProvider.invoked).toHaveBeenCalledTimes(1);
      expect(mockProvider.threadCreated).toHaveBeenCalledTimes(1);
      expect(mockProvider.threadCreated).toHaveBeenCalledWith('conv-456');
    });

    it('should handle lifecycle errors in runStream()', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockRejectedValue(new Error('Invoking failed')),
        invoked: vi.fn().mockRejectedValue(new Error('Invoked failed')),
        threadCreated: vi.fn().mockRejectedValue(new Error('Thread created failed')),
      } as unknown as ContextProvider;

      vi.mocked(mockClient.completeStream).mockImplementation(async function* () {
        yield {
          type: 'message_delta' as const,
          delta: {
            role: 'assistant' as any,
            content: { type: 'text' as const, text: 'Response' },
            timestamp: new Date(),
          },
        } as any;
        yield {
          type: 'metadata' as const,
          metadata: { conversationId: 'conv-789' },
        } as any;
      } as any);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      // Should not throw despite all lifecycle hooks failing
      const updates = [];
      for await (const update of agent.runStream('test message')) {
        updates.push(update);
      }

      expect(updates.length).toBeGreaterThan(0);
      expect(mockProvider.invoking).toHaveBeenCalled();
      expect(mockProvider.invoked).toHaveBeenCalled();
      expect(mockProvider.threadCreated).toHaveBeenCalled();
    });
  });

  describe('Complete Lifecycle Flow', () => {
    it('should execute all lifecycle hooks in correct order', async () => {
      const callOrder: string[] = [];

      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockImplementation(async () => {
          callOrder.push('invoking');
          return {} as AIContext;
        }),
        invoked: vi.fn().mockImplementation(async () => {
          callOrder.push('invoked');
        }),
        threadCreated: vi.fn().mockImplementation(async () => {
          callOrder.push('threadCreated');
        }),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-complete' };

      vi.mocked(mockClient.complete).mockImplementation(async () => {
        callOrder.push('complete');
        return responseMessage;
      });

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      expect(callOrder).toEqual(['invoking', 'complete', 'threadCreated', 'invoked']);
    });

    it('should pass context between lifecycle hooks', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Context instructions',
          messages: [createUserMessage('Context message')],
        } as AIContext),
        invoked: vi.fn(),
        threadCreated: vi.fn(),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-context' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('test message');

      // Verify invoking was called
      expect(mockProvider.invoking).toHaveBeenCalled();

      // Verify invoked received the response
      expect(mockProvider.invoked).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ text: 'Response' }),
        }),
        expect.any(Object),
      );

      // Verify threadCreated received the conversation ID
      expect(mockProvider.threadCreated).toHaveBeenCalledWith('conv-context');
    });
  });
});
