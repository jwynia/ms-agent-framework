/**
 * TASK-101c: ChatAgent run() Method Tests
 *
 * Comprehensive test coverage for the ChatAgent's run() method implementation.
 * Tests basic execution, thread management, context integration, options merging, and message history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatAgent } from '../chat-agent.js';
import type { ChatClientProtocol } from '../../chat-client/protocol.js';
import type { ChatMessage } from '../../types/chat-message.js';
import { MessageRole, createUserMessage, createAssistantMessage } from '../../types/chat-message.js';
import { InMemoryMessageStore } from '../../storage/in-memory-store.js';
import type { ContextProvider } from '../../context/context-provider.js';
import type { AIContext } from '../../context/context-provider.js';
import type { AITool } from '../../tools/base-tool.js';
import { ThreadType } from '../../threads/service-thread-types.js';
import type { UsageDetails } from '../chat-agent-types.js';

describe('TASK-101c: ChatAgent run() Method', () => {
  let mockClient: ChatClientProtocol;

  beforeEach(() => {
    // Create a mock chat client
    mockClient = {
      complete: vi.fn(),
      completeStream: vi.fn(),
    } as unknown as ChatClientProtocol;
  });

  describe('Basic Execution', () => {
    it('should execute with string input', async () => {
      const responseMessage = createAssistantMessage('Hello!');
      responseMessage.metadata = { responseId: 'resp-123' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      const response = await agent.run('Hi');

      expect(response.messages).toHaveLength(1);
      expect(response.text).toBe('Hello!');
      expect(mockClient.complete).toHaveBeenCalledTimes(1);
    });

    it('should execute with ChatMessage input', async () => {
      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      const message = createUserMessage('Question');
      const response = await agent.run(message);

      expect(response.text).toBe('Response');
    });

    it('should execute with ChatMessage[] input', async () => {
      const responseMessage = createAssistantMessage('Answer');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      const messages: ChatMessage[] = [
        createUserMessage('Q1'),
        createAssistantMessage('A1'),
        createUserMessage('Q2'),
      ];
      const response = await agent.run(messages);

      expect(response.text).toBe('Answer');
      expect(mockClient.complete).toHaveBeenCalled();
    });

    it('should return response with metadata', async () => {
      const responseMessage = createAssistantMessage('Test');
      const usage: UsageDetails = {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      };
      responseMessage.metadata = {
        responseId: 'resp-456',
        usage,
        rawRepresentation: { raw: 'data' },
      };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      const response = await agent.run('Test');

      expect(response.responseId).toBe('resp-456');
      expect(response.usageDetails).toEqual(usage);
      expect(response.rawRepresentation).toEqual({ raw: 'data' });
    });
  });

  describe('Thread Management', () => {
    it('should create new thread if not provided', async () => {
      const responseMessage = createAssistantMessage('Hi');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      await agent.run('Hello');

      // Thread was created implicitly
      expect(mockClient.complete).toHaveBeenCalled();
    });

    it('should use provided thread', async () => {
      const responseMessage = createAssistantMessage('Hi');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      const thread = agent.getNewThread();

      await agent.run('Hello', { thread });
      await agent.run('How are you?', { thread });

      expect(mockClient.complete).toHaveBeenCalledTimes(2);
    });

    it('should update thread with conversation ID from service', async () => {
      const responseMessage = createAssistantMessage('Hi');
      responseMessage.metadata = { conversationId: 'conv-abc123' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      const thread = agent.getNewThread();

      await agent.run('Hello', { thread });

      expect(thread.conversationId).toBe('conv-abc123');
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
    });

    it('should create local store if no conversation ID and factory provided', async () => {
      const responseMessage = createAssistantMessage('Hi');
      // No conversationId
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });
      const thread = agent.getNewThread();

      await agent.run('Hello', { thread });

      expect(thread.messageStore).toBeDefined();
      expect(thread.threadType).toBe(ThreadType.LOCAL_MANAGED);
    });

    it('should store messages in local thread', async () => {
      const responseMessage = createAssistantMessage('Response');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });
      const thread = agent.getNewThread();

      await agent.run('Question', { thread });

      const messages = await thread.getMessages();
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Instructions and Context', () => {
    it('should include instructions in system message', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: 'You are a helpful assistant.',
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0] as ChatMessage[];

      expect(messages[0].role).toBe(MessageRole.System);
      const systemContent = messages[0].content as { type: string; text: string };
      expect(systemContent.text).toContain('helpful assistant');
    });

    it('should invoke context providers', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Additional context',
        } as AIContext),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('Hello');

      expect(mockProvider.invoking).toHaveBeenCalled();
    });

    it('should include context in system message', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Context info',
        } as AIContext),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: 'You are helpful.',
        contextProviders: [mockProvider],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0] as ChatMessage[];

      expect(messages[0].role).toBe(MessageRole.System);
      const systemContent = messages[0].content as { type: string; text: string };
      expect(systemContent.text).toContain('You are helpful');
      expect(systemContent.text).toContain('Context info');
    });

    it('should handle multiple context providers', async () => {
      const provider1: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Context 1',
        } as AIContext),
      } as unknown as ContextProvider;

      const provider2: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          instructions: 'Context 2',
        } as AIContext),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [provider1, provider2],
      });

      await agent.run('Hello');

      expect(provider1.invoking).toHaveBeenCalled();
      expect(provider2.invoking).toHaveBeenCalled();

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0] as ChatMessage[];
      const systemContent = messages[0].content as { type: string; text: string };
      expect(systemContent.text).toContain('Context 1');
      expect(systemContent.text).toContain('Context 2');
    });

    it('should include context messages in prepared messages', async () => {
      const contextMsg = createUserMessage('Context message');
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({
          messages: [contextMsg],
        } as AIContext),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0] as ChatMessage[];

      // Should have context message included
      const hasContextMessage = messages.some(
        (m) => m.content && typeof m.content === 'object' && 'text' in m.content && m.content.text === 'Context message',
      );
      expect(hasContextMessage).toBe(true);
    });
  });

  describe('Options Merging', () => {
    it('should pass constructor options to chat client', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        temperature: 0.7,
        maxTokens: 100,
        modelId: 'gpt-4',
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;

      expect(options.temperature).toBe(0.7);
      expect(options.maxTokens).toBe(100);
      expect(options.modelId).toBe('gpt-4');
    });

    it('should override constructor options with runtime options', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        temperature: 0.7,
        maxTokens: 100,
      });

      await agent.run('Hello', {
        temperature: 0.9,
        maxTokens: 200,
      });

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;

      expect(options.temperature).toBe(0.9);
      expect(options.maxTokens).toBe(200);
    });

    it('should include tools in options', async () => {
      const mockTool: AITool = { name: 'test_tool', description: 'Test' } as AITool;
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [mockTool],
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;

      expect(options.tools).toEqual([mockTool]);
    });

    it('should combine constructor and runtime tools', async () => {
      // TASK-101e: With MCP support, tools are now combined rather than replaced
      const constructorTool: AITool = { name: 'tool1', description: 'Tool 1' } as AITool;
      const runtimeTool: AITool = { name: 'tool2', description: 'Tool 2' } as AITool;
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: [constructorTool],
      });

      await agent.run('Hello', {
        tools: [runtimeTool],
      });

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;

      // Now tools are combined (constructor + runtime)
      expect(options.tools).toContainEqual(constructorTool);
      expect(options.tools).toContainEqual(runtimeTool);
    });

    it('should merge additional chat options', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        additionalChatOptions: {
          customOption: 'value1',
        },
      });

      await agent.run('Hello', {
        additionalChatOptions: {
          customOption2: 'value2',
        },
      });

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const options = callArgs[1] as Record<string, unknown>;

      expect(options.customOption).toBe('value1');
      expect(options.customOption2).toBe('value2');
    });
  });

  describe('Message History', () => {
    it('should include existing thread messages in context', async () => {
      const responseMessage1 = createAssistantMessage('First');
      const responseMessage2 = createAssistantMessage('Second');

      vi.mocked(mockClient.complete)
        .mockResolvedValueOnce(responseMessage1)
        .mockResolvedValueOnce(responseMessage2);

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });

      const thread = agent.getNewThread();

      // First message
      await agent.run('Hello', { thread });

      // Second message - should include history
      await agent.run('How are you?', { thread });

      const secondCallArgs = vi.mocked(mockClient.complete).mock.calls[1];
      const messages = secondCallArgs[0] as ChatMessage[];

      // Should have: previous user message + previous assistant message + new user message
      const nonSystemMessages = messages.filter((m) => m.role !== MessageRole.System);
      expect(nonSystemMessages.length).toBeGreaterThanOrEqual(3);
    });

    it('should preserve message order with existing history', async () => {
      const responseMessage = createAssistantMessage('Latest');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });

      const thread = agent.getNewThread();

      // Add some history
      await agent.run('First question', { thread });
      await agent.run('Second question', { thread });

      const callArgs = vi.mocked(mockClient.complete).mock.calls[1];
      const messages = callArgs[0] as ChatMessage[];

      // Filter non-system messages
      const conversationMessages = messages.filter((m) => m.role !== MessageRole.System);

      // Verify order: first user -> first assistant -> second user
      expect(conversationMessages.length).toBeGreaterThanOrEqual(3);
      expect(conversationMessages[0].role).toBe(MessageRole.User);
      expect(conversationMessages[1].role).toBe(MessageRole.Assistant);
      expect(conversationMessages[2].role).toBe(MessageRole.User);
    });

    it('should handle service-managed thread transition correctly', async () => {
      const responseMessage = createAssistantMessage('Response');
      responseMessage.metadata = { conversationId: 'conv-123' };
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      const thread = agent.getNewThread();

      await agent.run('Hello', { thread });

      // After first run, thread is now service-managed
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);

      await agent.run('Second', { thread });

      const secondCallArgs = vi.mocked(mockClient.complete).mock.calls[1];
      const messages = secondCallArgs[0] as ChatMessage[];

      // Note: When a thread starts UNDETERMINED, messages are stored in a default InMemoryMessageStore.
      // When it later becomes SERVICE_MANAGED, those messages persist in the store.
      // This is current behavior - the store isn't cleared when thread type changes.
      // Future enhancement: Clear messageStore when transitioning to SERVICE_MANAGED.
      const userMessages = messages.filter((m) => m.role === MessageRole.User);

      // Both messages appear because the first was stored before type was determined
      expect(userMessages.length).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty instructions', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: '',
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0] as ChatMessage[];

      // Should not have system message for empty instructions
      expect(messages[0].role).not.toBe(MessageRole.System);
    });

    it('should handle whitespace-only instructions', async () => {
      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: '   ',
      });

      await agent.run('Hello');

      const callArgs = vi.mocked(mockClient.complete).mock.calls[0];
      const messages = callArgs[0] as ChatMessage[];

      // Should not have system message for whitespace-only instructions
      expect(messages[0].role).not.toBe(MessageRole.System);
    });

    it('should handle context provider returning empty context', async () => {
      const mockProvider: ContextProvider = {
        invoking: vi.fn().mockResolvedValue({} as AIContext),
      } as unknown as ContextProvider;

      const responseMessage = createAssistantMessage('OK');
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [mockProvider],
      });

      await agent.run('Hello');

      expect(mockProvider.invoking).toHaveBeenCalled();
      // Should not throw error
    });

    it('should handle response without metadata', async () => {
      const responseMessage = createAssistantMessage('OK');
      // No metadata
      vi.mocked(mockClient.complete).mockResolvedValue(responseMessage);

      const agent = new ChatAgent({ chatClient: mockClient });
      const response = await agent.run('Hello');

      expect(response.messages).toHaveLength(1);
      expect(response.text).toBe('OK');
      // Should not throw error
    });
  });
});
