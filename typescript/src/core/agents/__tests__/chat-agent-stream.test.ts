/**
 * TASK-101d: ChatAgent runStream() Method Tests
 *
 * Comprehensive test coverage for the ChatAgent's runStream() method implementation.
 * Tests streaming responses, update properties, thread management, and message history.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatAgent } from '../chat-agent.js';
import type { ChatClientProtocol } from '../../chat-client/protocol.js';
import type { ChatMessage } from '../../types/chat-message.js';
import { MessageRole, createUserMessage, createAssistantMessage } from '../../types/chat-message.js';
import { InMemoryMessageStore } from '../../storage/in-memory-store.js';
import { ThreadType } from '../../threads/service-thread-types.js';
import type { UsageDetails, AgentRunResponseUpdate } from '../chat-agent-types.js';
import type { StreamEvent } from '../../chat-client/types.js';

describe('TASK-101d: ChatAgent runStream() Method', () => {
  let mockClient: ChatClientProtocol;

  beforeEach(() => {
    // Create a mock chat client
    mockClient = {
      complete: vi.fn(),
      completeStream: vi.fn(),
    } as unknown as ChatClientProtocol;
  });

  describe('Basic Streaming', () => {
    it('should yield updates as they arrive', async () => {
      // Mock streaming response with multiple chunks
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Hello' },
          },
        } as StreamEvent;
        yield {
          type: 'message_delta',
          delta: {
            content: { type: 'text', text: ' world' },
          },
        } as StreamEvent;
        yield {
          type: 'message_delta',
          delta: {
            content: { type: 'text', text: '!' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Hi')) {
        updates.push(update);
      }

      // Should have 3 content updates + 1 final update
      expect(updates).toHaveLength(4);
      expect(updates[0].text).toBe('Hello');
      expect(updates[1].text).toBe(' world');
      expect(updates[2].text).toBe('!');
      expect(updates[3].isFinal).toBe(true);
    });

    it('should work with string input', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Response' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Question')) {
        updates.push(update);
      }

      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0].text).toBe('Response');
    });

    it('should work with ChatMessage input', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Answer' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const message = createUserMessage('Q');
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream(message)) {
        updates.push(update);
      }

      expect(updates.length).toBeGreaterThan(0);
    });

    it('should work with ChatMessage array input', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Response' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const messages: ChatMessage[] = [
        createUserMessage('Question 1'),
        createAssistantMessage('Answer 1'),
        createUserMessage('Question 2'),
      ];
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream(messages)) {
        updates.push(update);
      }

      expect(updates.length).toBeGreaterThan(0);
    });
  });

  describe('Thread Management', () => {
    it('should create new thread if not provided', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Hi' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });

      for await (const update of agent.runStream('Hello')) {
        // Just consume updates
      }

      expect(mockClient.completeStream).toHaveBeenCalled();
    });

    it('should use provided thread', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Hi' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const thread = agent.getNewThread();

      for await (const update of agent.runStream('Hello', { thread })) {
        // Consume
      }

      for await (const update of agent.runStream('Again', { thread })) {
        // Consume
      }

      expect(mockClient.completeStream).toHaveBeenCalledTimes(2);
    });

    it('should update thread with conversation ID after streaming', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Hi' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
            conversationId: 'conv-stream-123',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const thread = agent.getNewThread();

      for await (const update of agent.runStream('Hello', { thread })) {
        // Conversation ID might not be set yet during streaming
      }

      // After streaming completes, thread should be updated
      expect(thread.conversationId).toBe('conv-stream-123');
      expect(thread.threadType).toBe(ThreadType.SERVICE_MANAGED);
    });

    it('should create local store if no conversation ID and factory provided', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Hi' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });
      const thread = agent.getNewThread();

      for await (const update of agent.runStream('Hello', { thread })) {
        // Consume
      }

      expect(thread.messageStore).toBeDefined();
      expect(thread.threadType).toBe(ThreadType.LOCAL_MANAGED);
    });
  });

  describe('Context and Instructions', () => {
    it('should include instructions in system message', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'OK' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: 'Be helpful',
      });

      for await (const update of agent.runStream('Hello')) {
        // Consume
      }

      const callArgs = vi.mocked(mockClient.completeStream).mock.calls[0];
      const messages = callArgs[0] as ChatMessage[];

      expect(messages[0].role).toBe(MessageRole.System);
      const systemContent = messages[0].content as { type: string; text: string };
      expect(systemContent.text).toContain('Be helpful');
    });
  });

  describe('Update Properties', () => {
    it('should preserve update metadata', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Test' },
            name: 'TestAgent',
            timestamp: new Date('2024-01-01'),
          },
        } as StreamEvent;
        yield {
          type: 'usage',
          usage: {
            promptTokens: 5,
            completionTokens: 10,
            totalTokens: 15,
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
            responseId: 'resp-123',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Test')) {
        updates.push(update);
      }

      // First update should have name and timestamp
      expect(updates[0].authorName).toBe('TestAgent');
      expect(updates[0].createdAt).toEqual(new Date('2024-01-01'));

      // Final update should have usage and response ID
      const finalUpdate = updates[updates.length - 1];
      expect(finalUpdate.isFinal).toBe(true);
      expect(finalUpdate.usageDetails?.totalTokens).toBe(15);
    });

    it('should mark final update correctly', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Part 1' },
          },
        } as StreamEvent;
        yield {
          type: 'message_delta',
          delta: {
            content: { type: 'text', text: 'Part 2' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Test')) {
        updates.push(update);
      }

      // All but last should be non-final
      for (let i = 0; i < updates.length - 1; i++) {
        expect(updates[i].isFinal).toBe(false);
      }

      // Last should be final
      expect(updates[updates.length - 1].isFinal).toBe(true);
    });

    it('should handle response ID from metadata', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Test' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
            responseId: 'resp-456',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Test')) {
        updates.push(update);
      }

      // Response ID should be in final update
      const finalUpdate = updates[updates.length - 1];
      expect(finalUpdate.responseId).toBe('resp-456');
    });
  });

  describe('Message History', () => {
    it('should preserve message history across stream calls', async () => {
      const mockStream1 = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'First' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      const mockStream2 = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Second' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream)
        .mockReturnValueOnce(mockStream1())
        .mockReturnValueOnce(mockStream2());

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });

      const thread = agent.getNewThread();

      // First call
      for await (const update of agent.runStream('Hello', { thread })) {
        // Consume
      }

      // Second call - should include history
      for await (const update of agent.runStream('Again', { thread })) {
        // Consume
      }

      const secondCallArgs = vi.mocked(mockClient.completeStream).mock.calls[1];
      const messages = secondCallArgs[0] as ChatMessage[];

      // Should have previous messages in context
      const nonSystemMessages = messages.filter((m) => m.role !== MessageRole.System);
      expect(nonSystemMessages.length).toBeGreaterThan(1);
    });

    it('should store messages in thread after streaming completes', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Response' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });

      const thread = agent.getNewThread();

      for await (const update of agent.runStream('Question', { thread })) {
        // Consume
      }

      const messages = await thread.getMessages();
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from chat client', async () => {
      const mockStream = async function* () {
        throw new Error('Streaming failed');
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });

      await expect(async () => {
        for await (const update of agent.runStream('Test')) {
          // Should not reach here
        }
      }).rejects.toThrow('Streaming failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle stream with no message deltas', async () => {
      const mockStream = async function* () {
        yield {
          type: 'usage',
          usage: {
            promptTokens: 5,
            completionTokens: 0,
            totalTokens: 5,
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Test')) {
        updates.push(update);
      }

      // Should have at least the final update
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[updates.length - 1].isFinal).toBe(true);
    });

    it('should handle stream with only message deltas (no metadata)', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Content' },
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Test')) {
        updates.push(update);
      }

      // Should have content updates + final marker
      expect(updates.length).toBeGreaterThan(1);
      expect(updates[0].text).toBe('Content');
      expect(updates[updates.length - 1].isFinal).toBe(true);
    });

    it('should handle usage event before metadata', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Test' },
          },
        } as StreamEvent;
        yield {
          type: 'usage',
          usage: {
            promptTokens: 5,
            completionTokens: 10,
            totalTokens: 15,
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Test')) {
        updates.push(update);
      }

      // Final update should have usage details
      const finalUpdate = updates[updates.length - 1];
      expect(finalUpdate.usageDetails?.totalTokens).toBe(15);
    });
  });

  describe('Text Extraction', () => {
    it('should extract text correctly from updates', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: 'Hello' },
          },
        } as StreamEvent;
        yield {
          type: 'message_delta',
          delta: {
            content: { type: 'text', text: ' World' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      let fullText = '';

      for await (const update of agent.runStream('Test')) {
        if (!update.isFinal) {
          fullText += update.text;
        }
      }

      expect(fullText).toBe('Hello World');
    });

    it('should handle empty text updates', async () => {
      const mockStream = async function* () {
        yield {
          type: 'message_delta',
          delta: {
            role: MessageRole.Assistant,
            content: { type: 'text', text: '' },
          },
        } as StreamEvent;
        yield {
          type: 'metadata',
          metadata: {
            provider: 'test',
            modelId: 'test-model',
          },
        } as StreamEvent;
      };

      vi.mocked(mockClient.completeStream).mockReturnValue(mockStream());

      const agent = new ChatAgent({ chatClient: mockClient });
      const updates: AgentRunResponseUpdate[] = [];

      for await (const update of agent.runStream('Test')) {
        updates.push(update);
      }

      expect(updates[0].text).toBe('');
    });
  });
});
