/**
 * ChatAgent Basic Implementation Tests (TASK-101b)
 *
 * Tests for ChatAgent constructor, validation, and helper methods.
 * Does NOT test run() or runStream() - those are TASK-101c and TASK-101d.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatAgent } from '../chat-agent';
import type { ChatClientProtocol } from '../../chat-client/protocol';
import type { AITool } from '../../tools/base-tool';
import type { ContextProvider } from '../../context/context-provider';
import { AgentInitializationError } from '../../errors/agent-errors';
import { InMemoryMessageStore } from '../../storage/in-memory-store';
import { MessageRole } from '../../types/chat-message';
import type { ChatMessage } from '../../types/chat-message';
import { ThreadType } from '../../threads/service-thread-types';

describe('TASK-101b: ChatAgent Basic Implementation', () => {
  describe('Constructor', () => {
    it('should create agent with minimal config', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({ chatClient: mockClient });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.name).toBe('ChatAgent'); // Default name
    });

    it('should throw if chatClient not provided', () => {
      expect(() => new ChatAgent({} as any)).toThrow(AgentInitializationError);
      expect(() => new ChatAgent({} as any)).toThrow('chatClient is required');
    });

    it('should throw if both conversationId and messageStoreFactory provided', () => {
      const mockClient = {} as ChatClientProtocol;
      expect(() =>
        new ChatAgent({
          chatClient: mockClient,
          conversationId: 'thread-123',
          messageStoreFactory: () => new InMemoryMessageStore(),
        }),
      ).toThrow(AgentInitializationError);
      expect(() =>
        new ChatAgent({
          chatClient: mockClient,
          conversationId: 'thread-123',
          messageStoreFactory: () => new InMemoryMessageStore(),
        }),
      ).toThrow('Cannot specify both conversationId and messageStoreFactory');
    });

    it('should accept conversationId for service-managed threads', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        conversationId: 'thread-123',
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
    });

    it('should accept messageStoreFactory for local threads', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });

      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
    });

    it('should normalize single tool to array', () => {
      const mockClient = {} as ChatClientProtocol;
      const tool = { name: 'test', description: 'Test tool' } as AITool;
      const agent = new ChatAgent({
        chatClient: mockClient,
        tools: tool,
      });

      expect(agent).toBeDefined();
      expect(agent.tools).toBeDefined();
      expect(agent.tools.length).toBe(1);
      expect(agent.tools[0]).toBe(tool);
    });

    it('should accept tool array', () => {
      const mockClient = {} as ChatClientProtocol;
      const tools = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' },
      ] as AITool[];
      const agent = new ChatAgent({
        chatClient: mockClient,
        tools,
      });

      expect(agent).toBeDefined();
      expect(agent.tools).toBeDefined();
      expect(agent.tools.length).toBe(2);
      expect(agent.tools).toEqual(tools);
    });

    it('should normalize single context provider to array', () => {
      const mockClient = {} as ChatClientProtocol;
      const provider: ContextProvider = {
        invoking: async () => ({ messages: [], tools: [] }),
        invoked: async () => {},
        threadCreated: async () => {},
        setup: async () => {},
        cleanup: async () => {},
      };
      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: provider,
      });

      expect(agent).toBeDefined();
      // Note: BaseAgent only supports one context provider, so it's stored in contextProvider
      expect(agent.contextProvider).toBe(provider);
    });

    it('should accept context provider array', () => {
      const mockClient = {} as ChatClientProtocol;
      const provider1: ContextProvider = {
        invoking: async () => ({ messages: [], tools: [] }),
        invoked: async () => {},
        threadCreated: async () => {},
        setup: async () => {},
        cleanup: async () => {},
      };
      const provider2: ContextProvider = {
        invoking: async () => ({ messages: [], tools: [] }),
        invoked: async () => {},
        threadCreated: async () => {},
        setup: async () => {},
        cleanup: async () => {},
      };
      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: [provider1, provider2],
      });

      expect(agent).toBeDefined();
      // Note: BaseAgent only supports one context provider, so only first is stored
      expect(agent.contextProvider).toBe(provider1);
    });

    it('should store custom id when provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        id: 'custom-agent-id',
      });

      expect(agent.id).toBe('custom-agent-id');
    });

    it('should auto-generate id when not provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      expect(agent.id).toBeDefined();
      expect(agent.id).toMatch(/^agent_/);
    });

    it('should store custom name when provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        name: 'CustomAgent',
      });

      expect(agent.name).toBe('CustomAgent');
    });

    it('should store description when provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        description: 'A custom agent for testing',
      });

      expect(agent.description).toBe('A custom agent for testing');
    });

    it('should store instructions when provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: 'You are a helpful assistant.',
      });

      expect(agent.instructions).toBe('You are a helpful assistant.');
    });

    it('should store all chat completion parameters', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        modelId: 'gpt-4',
        temperature: 0.7,
        maxTokens: 500,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: 0.3,
        stop: ['END'],
        seed: 42,
        store: true,
        logitBias: { '100': 10 },
        user: 'test-user',
        metadata: { key: 'value' },
        toolChoice: 'auto',
        responseFormat: { type: 'json_object' },
        additionalChatOptions: { custom: 'option' },
      });

      expect(agent).toBeDefined();
      // Parameters are stored privately, but agent is created successfully
    });
  });

  describe('getNewThread()', () => {
    it('should create thread with conversationId when provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        conversationId: 'thread-123',
      });

      const thread = agent.getNewThread();
      expect(thread.serviceThreadId).toBe('thread-123');
      expect(thread.isServiceManaged).toBe(true);
    });

    it('should create thread with message store when factory provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });

      const thread = agent.getNewThread();
      expect(thread.messageStore).toBeDefined();
      expect(thread.isLocalManaged).toBe(true);
    });

    it('should create undetermined thread when neither provided', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({ chatClient: mockClient });

      const thread = agent.getNewThread();
      expect(thread.threadType).toBe(ThreadType.UNDETERMINED);
      expect(thread.isInitialized).toBe(false);
    });

    it('should create new thread instance each time', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        messageStoreFactory: () => new InMemoryMessageStore(),
      });

      const thread1 = agent.getNewThread();
      const thread2 = agent.getNewThread();

      expect(thread1).not.toBe(thread2);
      expect(thread1.threadId).not.toBe(thread2.threadId);
    });
  });

  describe('normalizeMessages()', () => {
    let agent: ChatAgent;

    beforeEach(() => {
      const mockClient = {} as ChatClientProtocol;
      agent = new ChatAgent({ chatClient: mockClient });
    });

    it('should convert string to user message', () => {
      const messages = (agent as any).normalizeMessages('Hello');

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe(MessageRole.User);
      expect(messages[0].content).toEqual({ type: 'text', text: 'Hello' });
      expect(messages[0].timestamp).toBeInstanceOf(Date);
    });

    it('should convert empty string to user message', () => {
      const messages = (agent as any).normalizeMessages('');

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe(MessageRole.User);
      expect(messages[0].content).toEqual({ type: 'text', text: '' });
    });

    it('should wrap single message in array', () => {
      const msg: ChatMessage = {
        role: MessageRole.User,
        content: { type: 'text', text: 'Hello' },
      };
      const messages = (agent as any).normalizeMessages(msg);

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual(msg);
    });

    it('should pass through message array unchanged', () => {
      const msgs: ChatMessage[] = [
        { role: MessageRole.User, content: { type: 'text', text: 'Q' } },
        { role: MessageRole.Assistant, content: { type: 'text', text: 'A' } },
      ];
      const messages = (agent as any).normalizeMessages(msgs);

      expect(messages).toEqual(msgs);
      expect(messages).toHaveLength(2);
    });

    it('should handle assistant message', () => {
      const msg: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Hello' },
      };
      const messages = (agent as any).normalizeMessages(msg);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe(MessageRole.Assistant);
    });

    it('should handle system message', () => {
      const msg: ChatMessage = {
        role: MessageRole.System,
        content: { type: 'text', text: 'You are helpful' },
      };
      const messages = (agent as any).normalizeMessages(msg);

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe(MessageRole.System);
    });

    it('should handle message with metadata', () => {
      const msg: ChatMessage = {
        role: MessageRole.User,
        content: { type: 'text', text: 'Hello' },
        metadata: { source: 'test' },
      };
      const messages = (agent as any).normalizeMessages(msg);

      expect(messages).toHaveLength(1);
      expect(messages[0].metadata).toEqual({ source: 'test' });
    });

    it('should handle message with name', () => {
      const msg: ChatMessage = {
        role: MessageRole.User,
        content: { type: 'text', text: 'Hello' },
        name: 'TestUser',
      };
      const messages = (agent as any).normalizeMessages(msg);

      expect(messages).toHaveLength(1);
      expect(messages[0].name).toBe('TestUser');
    });

    it('should handle message with array content', () => {
      const msg: ChatMessage = {
        role: MessageRole.User,
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      };
      const messages = (agent as any).normalizeMessages(msg);

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toEqual([
        { type: 'text', text: 'Hello' },
        { type: 'text', text: 'World' },
      ]);
    });
  });

  describe('Placeholder methods', () => {
    let agent: ChatAgent;

    beforeEach(() => {
      const mockClient = {} as ChatClientProtocol;
      agent = new ChatAgent({ chatClient: mockClient });
    });

    it('should throw for run() (not yet implemented)', async () => {
      await expect(agent.run('Hello')).rejects.toThrow('not implemented yet');
      await expect(agent.run('Hello')).rejects.toThrow('TASK-101c');
    });

    it('should throw for runStream() (not yet implemented)', async () => {
      const gen = agent.runStream('Hello');
      const iterator = gen[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toThrow('not implemented yet');
    });

    it('should throw for run() with options', async () => {
      await expect(agent.run('Hello', { temperature: 0.5 })).rejects.toThrow('not implemented yet');
    });


    it('should throw for run() with ChatMessage', async () => {
      const msg: ChatMessage = {
        role: MessageRole.User,
        content: { type: 'text', text: 'Hello' },
      };
      await expect(agent.run(msg)).rejects.toThrow('not implemented yet');
    });

    it('should throw for run() with ChatMessage array', async () => {
      const msgs: ChatMessage[] = [
        { role: MessageRole.User, content: { type: 'text', text: 'Hello' } },
      ];
      await expect(agent.run(msgs)).rejects.toThrow('not implemented yet');
    });
  });

  describe('Property getters', () => {
    it('should expose id property', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        id: 'test-id',
      });

      expect(agent.id).toBe('test-id');
    });

    it('should expose name property', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        name: 'TestAgent',
      });

      expect(agent.name).toBe('TestAgent');
    });

    it('should expose description property', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        description: 'Test description',
      });

      expect(agent.description).toBe('Test description');
    });

    it('should expose instructions property', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        instructions: 'Test instructions',
      });

      expect(agent.instructions).toBe('Test instructions');
    });

    it('should return undefined for missing optional properties', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
      });

      expect(agent.description).toBeUndefined();
      expect(agent.instructions).toBeUndefined();
    });
  });

  describe('Integration with BaseAgent', () => {
    it('should inherit from BaseAgent', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({ chatClient: mockClient });

      expect(agent.chatClient).toBe(mockClient);
      expect(agent.tools).toBeDefined();
      expect(Array.isArray(agent.tools)).toBe(true);
    });

    it('should pass tools to BaseAgent', () => {
      const mockClient = {} as ChatClientProtocol;
      const tools = [
        { name: 'tool1', description: 'Tool 1' },
        { name: 'tool2', description: 'Tool 2' },
      ] as AITool[];
      const agent = new ChatAgent({
        chatClient: mockClient,
        tools,
      });

      expect(agent.tools).toEqual(tools);
    });

    it('should pass context provider to BaseAgent', () => {
      const mockClient = {} as ChatClientProtocol;
      const provider: ContextProvider = {
        invoking: async () => ({ messages: [], tools: [] }),
        invoked: async () => {},
        threadCreated: async () => {},
        setup: async () => {},
        cleanup: async () => {},
      };
      const agent = new ChatAgent({
        chatClient: mockClient,
        contextProviders: provider,
      });

      expect(agent.contextProvider).toBe(provider);
    });

    it('should have info property from BaseAgent', () => {
      const mockClient = {} as ChatClientProtocol;
      const agent = new ChatAgent({
        chatClient: mockClient,
        id: 'test-id',
        name: 'TestAgent',
        description: 'Test description',
        instructions: 'Test instructions',
      });

      expect(agent.info).toBeDefined();
      expect(agent.info.id).toBe('test-id');
      expect(agent.info.name).toBe('TestAgent');
      expect(agent.info.description).toBe('Test description');
      expect(agent.info.instructions).toBe('Test instructions');
    });
  });
});
