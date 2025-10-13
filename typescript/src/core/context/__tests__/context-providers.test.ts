/**
 * Tests for concrete ContextProvider implementations:
 * - SimpleContextProvider
 * - RAGContextProvider
 * - SessionContextProvider
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleContextProvider } from '../simple-context-provider.js';
import {
  RAGContextProvider,
  VectorStore,
  VectorSearchResult,
} from '../rag-context-provider.js';
import {
  SessionContextProvider,
  SessionData,
} from '../session-context-provider.js';
import { AIContext, DEFAULT_CONTEXT_PROMPT } from '../context-provider.js';
import { ChatMessage, MessageRole, createUserMessage } from '../../types/chat-message.js';
import { createTool } from '../../tools/base-tool.js';
import { z } from 'zod';

// Mock vector store for testing
class MockVectorStore implements VectorStore {
  public searchCalls: Array<{ query: string; topK: number }> = [];
  private results: VectorSearchResult[] = [];

  setResults(results: VectorSearchResult[]): void {
    this.results = results;
  }

  async search(query: string, topK: number): Promise<VectorSearchResult[]> {
    this.searchCalls.push({ query, topK });
    return this.results.slice(0, topK);
  }
}

describe('SimpleContextProvider', () => {
  describe('constructor', () => {
    it('creates provider with instructions only', () => {
      const provider = new SimpleContextProvider({
        instructions: 'Always be helpful.',
      });
      expect(provider).toBeInstanceOf(SimpleContextProvider);
    });

    it('creates provider with full context', () => {
      const tool = createTool('test', 'Test', z.object({}), async () => 'result');
      const provider = new SimpleContextProvider({
        instructions: 'Instructions',
        messages: [createUserMessage('Context message')],
        tools: [tool],
      });
      expect(provider).toBeInstanceOf(SimpleContextProvider);
    });

    it('creates provider with empty context', () => {
      const provider = new SimpleContextProvider({});
      expect(provider).toBeInstanceOf(SimpleContextProvider);
    });
  });

  describe('invoking', () => {
    it('returns static context unchanged', async () => {
      const provider = new SimpleContextProvider({
        instructions: 'Be concise.',
      });

      const context1 = await provider.invoking([createUserMessage('First')]);
      const context2 = await provider.invoking([createUserMessage('Second')]);

      expect(context1.instructions).toBe('Be concise.');
      expect(context2.instructions).toBe('Be concise.');
    });

    it('returns instructions from static context', async () => {
      const provider = new SimpleContextProvider({
        instructions: 'Always be helpful and concise.',
      });

      const context = await provider.invoking([]);
      expect(context.instructions).toBe('Always be helpful and concise.');
      expect(context.messages).toEqual([]);
      expect(context.tools).toEqual([]);
    });

    it('returns messages from static context', async () => {
      const messages = [
        createUserMessage('Static message 1'),
        createUserMessage('Static message 2'),
      ];
      const provider = new SimpleContextProvider({
        messages,
      });

      const context = await provider.invoking([]);
      expect(context.messages).toHaveLength(2);
      expect(context.messages?.[0].content).toEqual({ type: 'text', text: 'Static message 1' });
      expect(context.messages?.[1].content).toEqual({ type: 'text', text: 'Static message 2' });
    });

    it('returns tools from static context', async () => {
      const tool1 = createTool('tool1', 'Tool 1', z.object({}), async () => 'result1');
      const tool2 = createTool('tool2', 'Tool 2', z.object({}), async () => 'result2');
      const provider = new SimpleContextProvider({
        tools: [tool1, tool2],
      });

      const context = await provider.invoking([]);
      expect(context.tools).toHaveLength(2);
      expect(context.tools?.[0].name).toBe('tool1');
      expect(context.tools?.[1].name).toBe('tool2');
    });

    it('returns empty arrays when not provided in constructor', async () => {
      const provider = new SimpleContextProvider({
        instructions: 'Only instructions',
      });

      const context = await provider.invoking([]);
      expect(context.instructions).toBe('Only instructions');
      expect(context.messages).toEqual([]);
      expect(context.tools).toEqual([]);
    });

    it('does not use provided messages parameter', async () => {
      const provider = new SimpleContextProvider({
        instructions: 'Static',
      });

      const inputMessages = [
        createUserMessage('Input 1'),
        createUserMessage('Input 2'),
        createUserMessage('Input 3'),
      ];

      const context = await provider.invoking(inputMessages);
      expect(context.instructions).toBe('Static');
      // Should not include input messages
      expect(context.messages).toEqual([]);
    });

    it('returns copies of arrays to prevent mutation', async () => {
      const originalMessage = createUserMessage('Original');
      const provider = new SimpleContextProvider({
        messages: [originalMessage],
      });

      const context1 = await provider.invoking([]);
      const context2 = await provider.invoking([]);

      // Should be different array instances
      expect(context1.messages).not.toBe(context2.messages);
      // But have the same content
      expect(context1.messages?.[0]).toEqual(context2.messages?.[0]);
    });
  });

  describe('lifecycle hooks', () => {
    it('threadCreated is a no-op', async () => {
      const provider = new SimpleContextProvider({
        instructions: 'Test',
      });

      // Should not throw
      await expect(provider.threadCreated('thread-123')).resolves.toBeUndefined();
    });

    it('invoked is a no-op', async () => {
      const provider = new SimpleContextProvider({
        instructions: 'Test',
      });

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };
      const context: AIContext = { instructions: 'Test' };

      // Should not throw
      await expect(provider.invoked(response, context)).resolves.toBeUndefined();
    });
  });
});

describe('RAGContextProvider', () => {
  let mockVectorStore: MockVectorStore;

  beforeEach(() => {
    mockVectorStore = new MockVectorStore();
  });

  describe('constructor', () => {
    it('creates provider with default topK', () => {
      const provider = new RAGContextProvider(mockVectorStore);
      expect(provider).toBeInstanceOf(RAGContextProvider);
    });

    it('creates provider with custom topK', () => {
      const provider = new RAGContextProvider(mockVectorStore, 10);
      expect(provider).toBeInstanceOf(RAGContextProvider);
    });

    it('creates provider with custom formatter', () => {
      const formatter = (results: VectorSearchResult[]) => {
        return results.map((r) => r.content).join(' | ');
      };
      const provider = new RAGContextProvider(mockVectorStore, 5, {
        formatResults: formatter,
      });
      expect(provider).toBeInstanceOf(RAGContextProvider);
    });
  });

  describe('invoking', () => {
    it('queries vector store with last message text', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);
      const messages = [createUserMessage('What is TypeScript?')];

      await provider.invoking(messages);

      expect(mockVectorStore.searchCalls).toHaveLength(1);
      expect(mockVectorStore.searchCalls[0].query).toBe('What is TypeScript?');
      expect(mockVectorStore.searchCalls[0].topK).toBe(5);
    });

    it('formats search results as context instructions', async () => {
      mockVectorStore.setResults([
        { content: 'TypeScript is a superset of JavaScript', score: 0.95, metadata: {} },
        { content: 'It adds static typing to JavaScript', score: 0.92, metadata: {} },
      ]);

      const provider = new RAGContextProvider(mockVectorStore, 5);
      const messages = [createUserMessage('What is TypeScript?')];

      const context = await provider.invoking(messages);

      expect(context.instructions).toContain(DEFAULT_CONTEXT_PROMPT);
      expect(context.instructions).toContain('TypeScript is a superset of JavaScript');
      expect(context.instructions).toContain('It adds static typing to JavaScript');
    });

    it('respects topK limit', async () => {
      mockVectorStore.setResults([
        { content: 'Result 1', score: 0.9, metadata: {} },
        { content: 'Result 2', score: 0.8, metadata: {} },
        { content: 'Result 3', score: 0.7, metadata: {} },
        { content: 'Result 4', score: 0.6, metadata: {} },
        { content: 'Result 5', score: 0.5, metadata: {} },
      ]);

      const provider = new RAGContextProvider(mockVectorStore, 3);
      const messages = [createUserMessage('Query')];

      const context = await provider.invoking(messages);

      expect(mockVectorStore.searchCalls[0].topK).toBe(3);
      expect(context.instructions).toContain('Result 1');
      expect(context.instructions).toContain('Result 2');
      expect(context.instructions).toContain('Result 3');
    });

    it('uses custom formatter when provided', async () => {
      mockVectorStore.setResults([
        { content: 'Doc 1', score: 0.9, metadata: { source: 'wiki' } },
        { content: 'Doc 2', score: 0.8, metadata: { source: 'manual' } },
      ]);

      const formatter = (results: VectorSearchResult[]) => {
        return results.map((r) => `[${r.metadata?.source}] ${r.content}`).join('\n');
      };

      const provider = new RAGContextProvider(mockVectorStore, 5, {
        formatResults: formatter,
      });
      const messages = [createUserMessage('Query')];

      const context = await provider.invoking(messages);

      expect(context.instructions).toBe('[wiki] Doc 1\n[manual] Doc 2');
    });

    it('returns empty context when no messages provided', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);

      const context = await provider.invoking([]);

      expect(mockVectorStore.searchCalls).toHaveLength(0);
      expect(context.instructions).toBeUndefined();
      expect(context.messages).toEqual([]);
      expect(context.tools).toEqual([]);
    });

    it('returns empty context when no search results', async () => {
      mockVectorStore.setResults([]);

      const provider = new RAGContextProvider(mockVectorStore, 5);
      const messages = [createUserMessage('Query')];

      const context = await provider.invoking(messages);

      expect(context.instructions).toBeUndefined();
    });

    it('extracts text from structured message content', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);
      const messages: ChatMessage[] = [
        {
          role: MessageRole.User,
          content: { type: 'text', text: 'Structured message content' },
        },
      ];

      await provider.invoking(messages);

      expect(mockVectorStore.searchCalls[0].query).toBe('Structured message content');
    });

    it('extracts text from legacy string content', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);
      const messages: ChatMessage[] = [
        {
          role: MessageRole.User,
          content: 'Legacy string content' as any,
        },
      ];

      await provider.invoking(messages);

      expect(mockVectorStore.searchCalls[0].query).toBe('Legacy string content');
    });

    it('handles array content with multiple parts', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);
      const messages: ChatMessage[] = [
        {
          role: MessageRole.User,
          content: [
            { type: 'text', text: 'First text part' },
            { type: 'image', url: 'http://example.com/image.jpg' },
          ] as any,
        },
      ];

      await provider.invoking(messages);

      // Should extract first text part
      expect(mockVectorStore.searchCalls[0].query).toBe('First text part');
    });

    it('handles empty message content gracefully', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);
      const messages: ChatMessage[] = [
        {
          role: MessageRole.User,
          content: { type: 'text', text: '' },
        },
      ];

      const context = await provider.invoking(messages);

      expect(mockVectorStore.searchCalls).toHaveLength(0);
      expect(context.instructions).toBeUndefined();
    });
  });

  describe('lifecycle hooks', () => {
    it('threadCreated is a no-op by default', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);

      // Should not throw
      await expect(provider.threadCreated('thread-123')).resolves.toBeUndefined();
    });

    it('invoked is a no-op by default', async () => {
      const provider = new RAGContextProvider(mockVectorStore, 5);

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };
      const context: AIContext = { instructions: 'Test' };

      // Should not throw
      await expect(provider.invoked(response, context)).resolves.toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles vector store errors gracefully', async () => {
      class ErrorVectorStore implements VectorStore {
        async search(): Promise<VectorSearchResult[]> {
          throw new Error('Vector store unavailable');
        }
      }

      const provider = new RAGContextProvider(new ErrorVectorStore(), 5);
      const messages = [createUserMessage('Query')];

      await expect(provider.invoking(messages)).rejects.toThrow('Vector store unavailable');
    });

    it('handles very large topK values', async () => {
      mockVectorStore.setResults([
        { content: 'Result 1', score: 0.9, metadata: {} },
        { content: 'Result 2', score: 0.8, metadata: {} },
      ]);

      const provider = new RAGContextProvider(mockVectorStore, 1000);
      const messages = [createUserMessage('Query')];

      const context = await provider.invoking(messages);

      expect(mockVectorStore.searchCalls[0].topK).toBe(1000);
      // Only 2 results available
      expect(context.instructions).toContain('Result 1');
      expect(context.instructions).toContain('Result 2');
    });
  });
});

describe('SessionContextProvider', () => {
  describe('constructor', () => {
    it('creates provider with default options', () => {
      const provider = new SessionContextProvider();
      expect(provider).toBeInstanceOf(SessionContextProvider);
    });

    it('creates provider with custom options', () => {
      const provider = new SessionContextProvider({
        includeCreatedAt: false,
        includeLastActivity: true,
        includeMetadata: true,
      });
      expect(provider).toBeInstanceOf(SessionContextProvider);
    });

    it('creates provider with custom formatter', () => {
      const formatter = (session: SessionData) => {
        return `Custom session: ${session.createdAt.toISOString()}`;
      };
      const provider = new SessionContextProvider({
        formatInstructions: formatter,
      });
      expect(provider).toBeInstanceOf(SessionContextProvider);
    });
  });

  describe('threadCreated', () => {
    it('initializes session data for new thread', async () => {
      const provider = new SessionContextProvider();

      await provider.threadCreated('thread-123');

      const session = provider.getSession('thread-123');
      expect(session).toBeDefined();
      expect(session?.createdAt).toBeInstanceOf(Date);
      expect(session?.metadata).toEqual({});
    });

    it('sets thread as current thread', async () => {
      const provider = new SessionContextProvider();

      await provider.threadCreated('thread-456');

      expect(provider.getCurrentThread()).toBe('thread-456');
    });

    it('does not overwrite existing session', async () => {
      const provider = new SessionContextProvider();

      await provider.threadCreated('thread-123');
      const firstSession = provider.getSession('thread-123');
      const firstCreatedAt = firstSession?.createdAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await provider.threadCreated('thread-123');
      const secondSession = provider.getSession('thread-123');

      // Should be the same timestamp (not recreated)
      expect(secondSession?.createdAt).toEqual(firstCreatedAt);
    });
  });

  describe('invoking', () => {
    it('returns session information as instructions', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      const context = await provider.invoking([]);

      expect(context.instructions).toBeDefined();
      expect(context.instructions).toContain('Session started at:');
      expect(context.messages).toEqual([]);
      expect(context.tools).toEqual([]);
    });

    it('includes creation timestamp when enabled', async () => {
      const provider = new SessionContextProvider({
        includeCreatedAt: true,
      });
      await provider.threadCreated('thread-123');

      const context = await provider.invoking([]);

      expect(context.instructions).toContain('Session started at:');
    });

    it('excludes creation timestamp when disabled', async () => {
      const provider = new SessionContextProvider({
        includeCreatedAt: false,
        includeLastActivity: false,
      });
      await provider.threadCreated('thread-123');

      const context = await provider.invoking([]);

      expect(context.instructions).not.toContain('Session started at:');
    });

    it('includes last activity when available', async () => {
      const provider = new SessionContextProvider({
        includeLastActivity: true,
      });
      await provider.threadCreated('thread-123');

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };
      await provider.invoked(response, {});

      const context = await provider.invoking([]);

      expect(context.instructions).toContain('Last activity:');
    });

    it('includes metadata when enabled', async () => {
      const provider = new SessionContextProvider({
        includeMetadata: true,
      });
      await provider.threadCreated('thread-123');
      provider.setMetadata('thread-123', 'userLanguage', 'en-US');

      const context = await provider.invoking([]);

      expect(context.instructions).toContain('Session metadata:');
      expect(context.instructions).toContain('userLanguage');
    });

    it('returns empty context when no current thread', async () => {
      const provider = new SessionContextProvider();

      const context = await provider.invoking([]);

      expect(context.instructions).toBeUndefined();
      expect(context.messages).toEqual([]);
      expect(context.tools).toEqual([]);
    });

    it('returns empty context when thread not initialized', async () => {
      const provider = new SessionContextProvider();
      provider.setCurrentThread('nonexistent-thread');

      const context = await provider.invoking([]);

      expect(context.instructions).toBeUndefined();
    });

    it('uses custom formatter when provided', async () => {
      const formatter = (session: SessionData, threadId: string) => {
        const duration = Date.now() - session.createdAt.getTime();
        return `Thread ${threadId} active for ${duration}ms`;
      };

      const provider = new SessionContextProvider({
        formatInstructions: formatter,
      });
      await provider.threadCreated('thread-123');

      const context = await provider.invoking([]);

      expect(context.instructions).toContain('Thread thread-123 active for');
      expect(context.instructions).toContain('ms');
    });
  });

  describe('invoked', () => {
    it('updates last activity timestamp', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      const sessionBefore = provider.getSession('thread-123');
      expect(sessionBefore?.lastActivity).toBeUndefined();

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };
      await provider.invoked(response, {});

      const sessionAfter = provider.getSession('thread-123');
      expect(sessionAfter?.lastActivity).toBeInstanceOf(Date);
    });

    it('updates activity on multiple invocations', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };

      await provider.invoked(response, {});
      const firstActivity = provider.getSession('thread-123')?.lastActivity;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await provider.invoked(response, {});
      const secondActivity = provider.getSession('thread-123')?.lastActivity;

      // Second activity should be later
      expect(secondActivity!.getTime()).toBeGreaterThan(firstActivity!.getTime());
    });

    it('does nothing when no current thread', async () => {
      const provider = new SessionContextProvider();

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };

      // Should not throw
      await expect(provider.invoked(response, {})).resolves.toBeUndefined();
    });

    it('does nothing when thread not initialized', async () => {
      const provider = new SessionContextProvider();
      provider.setCurrentThread('nonexistent-thread');

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };

      // Should not throw
      await expect(provider.invoked(response, {})).resolves.toBeUndefined();
    });
  });

  describe('session management', () => {
    it('getSession returns session data', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      const session = provider.getSession('thread-123');

      expect(session).toBeDefined();
      expect(session?.createdAt).toBeInstanceOf(Date);
      expect(session?.metadata).toEqual({});
    });

    it('getSession returns undefined for nonexistent thread', () => {
      const provider = new SessionContextProvider();

      const session = provider.getSession('nonexistent');

      expect(session).toBeUndefined();
    });

    it('getAllSessions returns all sessions', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await provider.threadCreated('thread-2');
      await provider.threadCreated('thread-3');

      const allSessions = provider.getAllSessions();

      expect(allSessions.size).toBe(3);
      expect(allSessions.has('thread-1')).toBe(true);
      expect(allSessions.has('thread-2')).toBe(true);
      expect(allSessions.has('thread-3')).toBe(true);
    });

    it('getAllSessions returns empty map when no sessions', () => {
      const provider = new SessionContextProvider();

      const allSessions = provider.getAllSessions();

      expect(allSessions.size).toBe(0);
    });
  });

  describe('metadata management', () => {
    it('setMetadata stores metadata', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      provider.setMetadata('thread-123', 'userLanguage', 'en-US');

      const value = provider.getMetadata('thread-123', 'userLanguage');
      expect(value).toBe('en-US');
    });

    it('setMetadata supports various value types', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      provider.setMetadata('thread-123', 'stringValue', 'test');
      provider.setMetadata('thread-123', 'numberValue', 42);
      provider.setMetadata('thread-123', 'boolValue', true);
      provider.setMetadata('thread-123', 'objectValue', { key: 'value' });
      provider.setMetadata('thread-123', 'arrayValue', [1, 2, 3]);

      expect(provider.getMetadata('thread-123', 'stringValue')).toBe('test');
      expect(provider.getMetadata('thread-123', 'numberValue')).toBe(42);
      expect(provider.getMetadata('thread-123', 'boolValue')).toBe(true);
      expect(provider.getMetadata('thread-123', 'objectValue')).toEqual({ key: 'value' });
      expect(provider.getMetadata('thread-123', 'arrayValue')).toEqual([1, 2, 3]);
    });

    it('setMetadata overwrites existing values', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      provider.setMetadata('thread-123', 'key', 'value1');
      provider.setMetadata('thread-123', 'key', 'value2');

      const value = provider.getMetadata('thread-123', 'key');
      expect(value).toBe('value2');
    });

    it('getMetadata returns undefined for nonexistent key', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      const value = provider.getMetadata('thread-123', 'nonexistent');

      expect(value).toBeUndefined();
    });

    it('getMetadata returns undefined for nonexistent thread', () => {
      const provider = new SessionContextProvider();

      const value = provider.getMetadata('nonexistent', 'key');

      expect(value).toBeUndefined();
    });

    it('setMetadata does nothing for nonexistent thread', () => {
      const provider = new SessionContextProvider();

      // Should not throw
      provider.setMetadata('nonexistent', 'key', 'value');

      const value = provider.getMetadata('nonexistent', 'key');
      expect(value).toBeUndefined();
    });
  });

  describe('thread management', () => {
    it('setCurrentThread changes current thread', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await provider.threadCreated('thread-2');

      provider.setCurrentThread('thread-1');
      expect(provider.getCurrentThread()).toBe('thread-1');

      provider.setCurrentThread('thread-2');
      expect(provider.getCurrentThread()).toBe('thread-2');
    });

    it('getCurrentThread returns null initially', () => {
      const provider = new SessionContextProvider();

      expect(provider.getCurrentThread()).toBeNull();
    });

    it('clearSession removes session data', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      provider.clearSession('thread-123');

      const session = provider.getSession('thread-123');
      expect(session).toBeUndefined();
    });

    it('clearSession clears current thread if it matches', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-123');

      expect(provider.getCurrentThread()).toBe('thread-123');

      provider.clearSession('thread-123');

      expect(provider.getCurrentThread()).toBeNull();
    });

    it('clearSession does not clear current thread if it does not match', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await provider.threadCreated('thread-2');
      provider.setCurrentThread('thread-1');

      provider.clearSession('thread-2');

      expect(provider.getCurrentThread()).toBe('thread-1');
    });

    it('clearAllSessions removes all sessions', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await provider.threadCreated('thread-2');
      await provider.threadCreated('thread-3');

      provider.clearAllSessions();

      const allSessions = provider.getAllSessions();
      expect(allSessions.size).toBe(0);
      expect(provider.getCurrentThread()).toBeNull();
    });
  });

  describe('per-thread isolation', () => {
    it('maintains separate session data for each thread', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await provider.threadCreated('thread-2');

      provider.setMetadata('thread-1', 'user', 'Alice');
      provider.setMetadata('thread-2', 'user', 'Bob');

      expect(provider.getMetadata('thread-1', 'user')).toBe('Alice');
      expect(provider.getMetadata('thread-2', 'user')).toBe('Bob');
    });

    it('context is specific to current thread', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await new Promise((resolve) => setTimeout(resolve, 10));
      await provider.threadCreated('thread-2');

      const session1 = provider.getSession('thread-1');
      const session2 = provider.getSession('thread-2');

      // Different creation times
      expect(session1?.createdAt.getTime()).toBeLessThan(session2!.createdAt.getTime());

      // Different contexts
      provider.setCurrentThread('thread-1');
      const context1 = await provider.invoking([]);

      provider.setCurrentThread('thread-2');
      const context2 = await provider.invoking([]);

      expect(context1.instructions).not.toEqual(context2.instructions);
    });

    it('invoked updates only current thread', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await provider.threadCreated('thread-2');

      provider.setCurrentThread('thread-1');

      const response: ChatMessage = {
        role: MessageRole.Assistant,
        content: { type: 'text', text: 'Response' },
      };
      await provider.invoked(response, {});

      const session1 = provider.getSession('thread-1');
      const session2 = provider.getSession('thread-2');

      expect(session1?.lastActivity).toBeInstanceOf(Date);
      expect(session2?.lastActivity).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('handles many concurrent sessions', async () => {
      const provider = new SessionContextProvider();

      // Create 100 sessions
      for (let i = 0; i < 100; i++) {
        await provider.threadCreated(`thread-${i}`);
        provider.setMetadata(`thread-${i}`, 'index', i);
      }

      const allSessions = provider.getAllSessions();
      expect(allSessions.size).toBe(100);

      // Verify all metadata is isolated
      for (let i = 0; i < 100; i++) {
        expect(provider.getMetadata(`thread-${i}`, 'index')).toBe(i);
      }
    });

    it('handles rapid thread switching', async () => {
      const provider = new SessionContextProvider();
      await provider.threadCreated('thread-1');
      await provider.threadCreated('thread-2');
      await provider.threadCreated('thread-3');

      // Rapidly switch threads
      for (let i = 0; i < 100; i++) {
        const threadId = `thread-${(i % 3) + 1}`;
        provider.setCurrentThread(threadId);
        expect(provider.getCurrentThread()).toBe(threadId);
      }
    });

    it('handles empty metadata gracefully', async () => {
      const provider = new SessionContextProvider({
        includeMetadata: true,
      });
      await provider.threadCreated('thread-123');

      const context = await provider.invoking([]);

      // Empty metadata should not be included
      expect(context.instructions).not.toContain('Session metadata:');
      expect(context.instructions).toContain('Session started at:');
    });
  });
});
