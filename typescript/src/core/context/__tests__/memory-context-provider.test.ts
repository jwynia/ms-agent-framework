/**
 * Tests for MemoryContextProvider - Memory storage and retrieval with vector search.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryContextProvider, Memory, MemoryContextProviderOptions } from '../memory-context-provider.js';
import { VectorStore, EmbeddingService, InMemoryVectorStore, VectorSearchResult } from '../vector-store-interface.js';
import { ChatMessage } from '../../types/chat-message.js';
import { AIContext, DEFAULT_CONTEXT_PROMPT } from '../context-provider.js';

/**
 * Mock embedding service that generates deterministic embeddings for testing.
 */
class MockEmbeddingService implements EmbeddingService {
  async embed(text: string): Promise<number[]> {
    // Generate a simple deterministic embedding based on text
    // This allows us to predict which memories will be similar
    const embedding = new Array(128).fill(0);

    // Use text length and character codes to create unique embeddings
    for (let i = 0; i < Math.min(text.length, 128); i++) {
      embedding[i] = text.charCodeAt(i) / 255;
    }

    return embedding;
  }
}

/**
 * Create a test chat message.
 */
function createMessage(role: 'user' | 'assistant', text: string): ChatMessage {
  return {
    role,
    content: { type: 'text', text },
  };
}

describe('InMemoryVectorStore', () => {
  let vectorStore: InMemoryVectorStore;

  beforeEach(() => {
    vectorStore = new InMemoryVectorStore();
  });

  it('should add and retrieve vectors', async () => {
    const embedding = [0.1, 0.2, 0.3];
    const metadata = { content: 'Test memory', timestamp: Date.now() };

    await vectorStore.add('test-1', embedding, metadata);

    // Search with the same embedding should return high similarity
    const results = await vectorStore.search(embedding, 1);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
    expect(results[0].score).toBeCloseTo(1.0, 5); // Cosine similarity with itself should be 1
    expect(results[0].metadata).toEqual(metadata);
  });

  it('should return results ordered by relevance', async () => {
    // Add three vectors with varying similarity
    await vectorStore.add('similar', [0.1, 0.2, 0.3], { content: 'Similar' });
    await vectorStore.add('less-similar', [0.5, 0.5, 0.5], { content: 'Less similar' });
    await vectorStore.add('most-similar', [0.1, 0.2, 0.29], { content: 'Most similar' });

    // Search with a query closer to the first vector
    const results = await vectorStore.search([0.1, 0.2, 0.3], 3);

    expect(results).toHaveLength(3);
    // First result should be 'similar' (exact match)
    expect(results[0].id).toBe('similar');
    expect(results[0].score).toBeCloseTo(1.0, 5);
  });

  it('should filter by metadata', async () => {
    await vectorStore.add('thread-1', [0.1, 0.2], { threadId: 'thread-1', content: 'Memory 1' });
    await vectorStore.add('thread-2', [0.1, 0.2], { threadId: 'thread-2', content: 'Memory 2' });

    const results = await vectorStore.search([0.1, 0.2], 10, { threadId: 'thread-1' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('thread-1');
  });

  it('should limit results to topK', async () => {
    for (let i = 0; i < 10; i++) {
      await vectorStore.add(`id-${i}`, [0.1, 0.2, 0.3], { content: `Memory ${i}` });
    }

    const results = await vectorStore.search([0.1, 0.2, 0.3], 5);

    expect(results).toHaveLength(5);
  });

  it('should delete vectors', async () => {
    await vectorStore.add('test-1', [0.1, 0.2], { content: 'Test' });
    await vectorStore.delete('test-1');

    const results = await vectorStore.search([0.1, 0.2], 10);

    expect(results).toHaveLength(0);
  });

  it('should clear all vectors', async () => {
    await vectorStore.add('test-1', [0.1, 0.2], { content: 'Test 1' });
    await vectorStore.add('test-2', [0.3, 0.4], { content: 'Test 2' });

    await vectorStore.clear();

    const results = await vectorStore.search([0.1, 0.2], 10);

    expect(results).toHaveLength(0);
  });

  it('should handle empty store', async () => {
    const results = await vectorStore.search([0.1, 0.2], 10);

    expect(results).toHaveLength(0);
  });

  it('should throw error for mismatched vector dimensions', async () => {
    await vectorStore.add('test-1', [0.1, 0.2, 0.3], { content: 'Test' });

    await expect(async () => {
      await vectorStore.search([0.1, 0.2], 10); // Different dimension
    }).rejects.toThrow("Vector dimensions don't match");
  });
});

describe('MemoryContextProvider', () => {
  let vectorStore: InMemoryVectorStore;
  let embeddingService: MockEmbeddingService;
  let provider: MemoryContextProvider;

  beforeEach(() => {
    vectorStore = new InMemoryVectorStore();
    embeddingService = new MockEmbeddingService();
    provider = new MemoryContextProvider(vectorStore, embeddingService);
  });

  describe('Memory Storage', () => {
    it('should store memories after invoked', async () => {
      const requestMessages = [createMessage('user', 'I love coffee')];
      const response = createMessage('assistant', 'Great! I will remember that.');

      await provider.invoked(response, { messages: requestMessages });

      // Search for the stored memory
      const embedding = await embeddingService.embed('coffee');
      const results = await vectorStore.search(embedding, 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.content).toBe('I love coffee');
    });

    it('should store multiple memories from multiple messages', async () => {
      const requestMessages = [
        createMessage('user', 'I love coffee'),
        createMessage('user', 'I prefer tea in the morning'),
      ];
      const response = createMessage('assistant', 'Noted!');

      await provider.invoked(response, { messages: requestMessages });

      const embedding = await embeddingService.embed('coffee');
      const results = await vectorStore.search(embedding, 10);

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should include timestamp in stored memories', async () => {
      const requestMessages = [createMessage('user', 'Test message')];
      const response = createMessage('assistant', 'OK');

      const beforeTime = Date.now();
      await provider.invoked(response, { messages: requestMessages });
      const afterTime = Date.now();

      const embedding = await embeddingService.embed('Test message');
      const results = await vectorStore.search(embedding, 1);

      expect(results).toHaveLength(1);
      const timestamp = results[0].metadata.timestamp as number;
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should associate memories with thread ID', async () => {
      await provider.threadCreated('thread-123');

      const requestMessages = [createMessage('user', 'Test message')];
      const response = createMessage('assistant', 'OK');

      await provider.invoked(response, { messages: requestMessages });

      const embedding = await embeddingService.embed('Test message');
      const results = await vectorStore.search(embedding, 1);

      expect(results).toHaveLength(1);
      expect(results[0].metadata.threadId).toBe('thread-123');
    });

    it('should handle messages with no text content', async () => {
      const requestMessages = [{ role: 'user' as const, content: '' }];
      const response = createMessage('assistant', 'OK');

      await provider.invoked(response, { messages: requestMessages });

      // Should not store empty memories
      const embedding = await embeddingService.embed('test');
      const results = await vectorStore.search(embedding, 10);

      expect(results).toHaveLength(0);
    });

    it('should only store user messages by default', async () => {
      const requestMessages = [createMessage('user', 'User message'), createMessage('assistant', 'Assistant message')];
      const response = createMessage('assistant', 'OK');

      await provider.invoked(response, { messages: requestMessages });

      const embedding = await embeddingService.embed('message');
      const results = await vectorStore.search(embedding, 10);

      // Should only have one memory from user
      expect(results).toHaveLength(1);
      expect(results[0].metadata.content).toBe('User message');
    });

    it('should continue storing memories even if one fails', async () => {
      // Mock embedding service that fails on specific text
      const failingEmbeddingService: EmbeddingService = {
        async embed(text: string): Promise<number[]> {
          if (text === 'fail') {
            throw new Error('Embedding failed');
          }
          return [0.1, 0.2, 0.3];
        },
      };

      const providerWithFailures = new MemoryContextProvider(vectorStore, failingEmbeddingService);

      const requestMessages = [createMessage('user', 'fail'), createMessage('user', 'success')];
      const response = createMessage('assistant', 'OK');

      // Should not throw error
      await providerWithFailures.invoked(response, { messages: requestMessages });

      // Should still have stored the successful memory
      const results = await vectorStore.search([0.1, 0.2, 0.3], 10);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Memory Retrieval', () => {
    beforeEach(async () => {
      // Pre-populate with some memories
      const memories = [
        { text: 'User loves coffee', embedding: await embeddingService.embed('User loves coffee') },
        {
          text: 'User prefers morning meetings',
          embedding: await embeddingService.embed('User prefers morning meetings'),
        },
        { text: 'User is learning TypeScript', embedding: await embeddingService.embed('User is learning TypeScript') },
      ];

      for (let i = 0; i < memories.length; i++) {
        await vectorStore.add(`memory-${i}`, memories[i].embedding, {
          content: memories[i].text,
          timestamp: Date.now(),
        });
      }
    });

    // Reset provider with lower minimum relevance for retrieval tests
    beforeEach(() => {
      provider = new MemoryContextProvider(vectorStore, embeddingService, {
        minRelevance: 0.3, // Lower threshold to ensure memories are retrieved in tests
      });
    });

    it('should retrieve relevant memories during invoking', async () => {
      const messages = [createMessage('user', 'What do I like to drink?')];

      const context = await provider.invoking(messages);

      expect(context.instructions).toBeDefined();
      expect(context.instructions).toContain('coffee');
    });

    it('should format memories with default prompt', async () => {
      const messages = [createMessage('user', 'What do I like?')];

      const context = await provider.invoking(messages);

      expect(context.instructions).toContain(DEFAULT_CONTEXT_PROMPT);
    });

    it('should return empty context when no messages provided', async () => {
      const context = await provider.invoking([]);

      expect(context.instructions).toBeUndefined();
      expect(context.messages).toEqual([]);
      expect(context.tools).toEqual([]);
    });

    it('should filter memories by minimum relevance', async () => {
      // Create provider with high minimum relevance
      const strictProvider = new MemoryContextProvider(vectorStore, embeddingService, {
        minRelevance: 0.99, // Very high threshold
      });

      // Query with unrelated text
      const messages = [createMessage('user', 'Something completely different xyz')];

      const context = await strictProvider.invoking(messages);

      // Should not retrieve any memories due to low relevance
      expect(context.instructions).toBeUndefined();
    });

    it('should limit results to topK', async () => {
      // Create provider that retrieves only 1 memory
      const limitedProvider = new MemoryContextProvider(vectorStore, embeddingService, {
        topK: 1,
        minRelevance: 0.0, // Accept all
      });

      const messages = [createMessage('user', 'Tell me what you know')];

      const context = await limitedProvider.invoking(messages);

      expect(context.instructions).toBeDefined();
      // Count how many memories are in the instructions (each memory is a separate line)
      const memoryCount = (context.instructions?.split('\n\n').length ?? 0) - 1; // Subtract prompt line
      expect(memoryCount).toBeLessThanOrEqual(1);
    });

    it('should use recent messages for query generation', async () => {
      const messages = [
        createMessage('user', 'Old message about coffee'),
        createMessage('assistant', 'OK'),
        createMessage('user', 'Recent message about TypeScript'),
      ];

      const context = await provider.invoking(messages);

      // Should prioritize recent messages (TypeScript)
      expect(context.instructions).toBeDefined();
    });

    it('should filter memories by thread ID', async () => {
      // Add memories to different threads
      const embedding1 = await embeddingService.embed('Thread 1 memory');
      const embedding2 = await embeddingService.embed('Thread 2 memory');

      await vectorStore.add('thread1-mem', embedding1, {
        content: 'Thread 1 memory',
        threadId: 'thread-1',
      });
      await vectorStore.add('thread2-mem', embedding2, {
        content: 'Thread 2 memory',
        threadId: 'thread-2',
      });

      // Create provider with thread ID
      const threadProvider = new MemoryContextProvider(vectorStore, embeddingService, {
        threadId: 'thread-1',
        minRelevance: 0.0,
      });

      const messages = [createMessage('user', 'What do you remember?')];
      const context = await threadProvider.invoking(messages);

      expect(context.instructions).toBeDefined();
      expect(context.instructions).toContain('Thread 1 memory');
      expect(context.instructions).not.toContain('Thread 2 memory');
    });
  });

  describe('Custom Options', () => {
    it('should use custom memory formatting function', async () => {
      const customProvider = new MemoryContextProvider(vectorStore, embeddingService, {
        minRelevance: 0.3,
        formatMemories: (memories) => {
          return `CUSTOM FORMAT:\n${memories.map((m) => `* ${m.content}`).join('\n')}`;
        },
      });

      // Add a memory
      const embedding = await embeddingService.embed('Test memory');
      await vectorStore.add('test', embedding, { content: 'Test memory' });

      const messages = [createMessage('user', 'Test memory')];
      const context = await customProvider.invoking(messages);

      expect(context.instructions).toBeDefined();
      expect(context.instructions).toContain('CUSTOM FORMAT:');
      expect(context.instructions).toContain('* Test memory');
    });

    it('should use custom memory extraction function', async () => {
      const customExtractMemories = vi.fn(
        (_requestMessages: ChatMessage[], responseMessages: ChatMessage[]): Memory[] => {
          // Extract from assistant messages instead
          return responseMessages
            .filter((m) => m.role === 'assistant')
            .map((m) => ({
              id: `custom-${Date.now()}`,
              text: typeof m.content === 'string' ? m.content : (m.content as { text: string }).text,
            }));
        },
      );

      const customProvider = new MemoryContextProvider(vectorStore, embeddingService, {
        extractMemories: customExtractMemories,
      });

      const requestMessages = [createMessage('user', 'User message')];
      const response = createMessage('assistant', 'Assistant message');

      await customProvider.invoked(response, { messages: requestMessages });

      expect(customExtractMemories).toHaveBeenCalledWith(requestMessages, [response]);

      // Verify assistant message was stored
      const embedding = await embeddingService.embed('Assistant message');
      const results = await vectorStore.search(embedding, 10);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.content).toBe('Assistant message');
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should update thread ID on threadCreated', async () => {
      await provider.threadCreated('new-thread');

      const requestMessages = [createMessage('user', 'Test')];
      const response = createMessage('assistant', 'OK');

      await provider.invoked(response, { messages: requestMessages });

      const embedding = await embeddingService.embed('Test');
      const results = await vectorStore.search(embedding, 1);

      expect(results[0].metadata.threadId).toBe('new-thread');
    });
  });

  describe('Edge Cases', () => {
    it('should handle message with array content', async () => {
      const messageWithArray: ChatMessage = {
        role: 'user',
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
      };

      const requestMessages = [messageWithArray];
      const response = createMessage('assistant', 'OK');

      await provider.invoked(response, { messages: requestMessages });

      const embedding = await embeddingService.embed('First part Second part');
      const results = await vectorStore.search(embedding, 10);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle message with string content', async () => {
      const messageWithString: ChatMessage = {
        role: 'user',
        content: 'Plain string content',
      };

      const requestMessages = [messageWithString];
      const response = createMessage('assistant', 'OK');

      await provider.invoked(response, { messages: requestMessages });

      const embedding = await embeddingService.embed('Plain string content');
      const results = await vectorStore.search(embedding, 10);

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty context when no relevant memories found', async () => {
      const provider = new MemoryContextProvider(vectorStore, embeddingService, {
        minRelevance: 0.99,
      });

      const messages = [createMessage('user', 'xyz123 completely different')];
      const context = await provider.invoking(messages);

      expect(context.instructions).toBeUndefined();
    });

    it('should handle messages with undefined content', async () => {
      const invalidMessage = { role: 'user' as const, content: undefined as any };

      const requestMessages = [invalidMessage];
      const response = createMessage('assistant', 'OK');

      // Should not throw
      await provider.invoked(response, { messages: requestMessages });
    });
  });

  describe('Integration', () => {
    it('should store and retrieve memories across multiple invocations', async () => {
      // Use provider with lower relevance threshold
      const integrationProvider = new MemoryContextProvider(vectorStore, embeddingService, {
        minRelevance: 0.3,
      });

      // First invocation - store memories
      const request1 = [createMessage('user', 'I love pizza')];
      const response1 = createMessage('assistant', 'Great!');
      await integrationProvider.invoked(response1, { messages: request1 });

      // Second invocation - retrieve memories
      const request2 = [createMessage('user', 'I love pizza')];
      const context = await integrationProvider.invoking(request2);

      expect(context.instructions).toBeDefined();
      expect(context.instructions).toContain('pizza');

      // Third invocation - store more memories
      const request3 = [createMessage('user', 'I also enjoy pasta')];
      const response3 = createMessage('assistant', 'Noted!');
      await integrationProvider.invoked(response3, { messages: request3 });

      // Fourth invocation - retrieve all memories
      const request4 = [createMessage('user', 'I also enjoy pasta')];
      const context2 = await integrationProvider.invoking(request4);

      expect(context2.instructions).toBeDefined();
      // Should have both memories (if they're relevant enough)
    });

    it('should work with setup and cleanup lifecycle', async () => {
      await provider.setup();

      // Use provider
      const requestMessages = [createMessage('user', 'Test')];
      const response = createMessage('assistant', 'OK');
      await provider.invoked(response, { messages: requestMessages });

      const messages = [createMessage('user', 'Test query')];
      const context = await provider.invoking(messages);

      expect(context).toBeDefined();

      await provider.cleanup();
    });
  });
});
