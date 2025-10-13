/**
 * Memory Context Provider - Stores and retrieves conversation memories using vector search.
 *
 * This module provides a context provider that stores conversation memories with embeddings
 * and retrieves relevant memories via semantic vector search. This enables long-term memory
 * and semantic recall for AI agents across conversations.
 *
 * @module memory-context-provider
 */

import { ContextProvider, AIContext, DEFAULT_CONTEXT_PROMPT } from './context-provider.js';
import { ChatMessage } from '../types/chat-message.js';
import { AITool } from '../tools/base-tool.js';
import { VectorStore, EmbeddingService } from './vector-store-interface.js';

/**
 * Options for configuring MemoryContextProvider.
 */
export interface MemoryContextProviderOptions {
  /**
   * Number of top memories to retrieve (default: 5).
   */
  topK?: number;

  /**
   * Minimum relevance score for retrieved memories (default: 0.7).
   * Memories with scores below this threshold will be filtered out.
   */
  minRelevance?: number;

  /**
   * Custom function to format retrieved memories into context instructions.
   * If not provided, uses default formatting with DEFAULT_CONTEXT_PROMPT.
   */
  formatMemories?: (memories: Array<{ content: string; score: number; metadata: Record<string, unknown> }>) => string;

  /**
   * Custom function to extract memories from conversation.
   * If not provided, uses default extraction (stores user messages).
   */
  extractMemories?: (requestMessages: ChatMessage[], responseMessages: ChatMessage[]) => Memory[];

  /**
   * Optional thread ID for filtering memories by conversation thread.
   * If not provided, memories are shared across all threads.
   */
  threadId?: string;
}

/**
 * Represents a memory extracted from conversation.
 */
export interface Memory {
  /**
   * Unique identifier for the memory.
   */
  id: string;

  /**
   * The memory text/content.
   */
  text: string;

  /**
   * Optional thread ID this memory belongs to.
   */
  threadId?: string;

  /**
   * Optional timestamp when the memory was created.
   */
  timestamp?: number;

  /**
   * Optional additional metadata.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Memory context provider with vector search capabilities.
 *
 * This provider implements long-term memory by:
 * 1. On `invoked()`: Extracting memories from the conversation and storing them with embeddings
 * 2. On `invoking()`: Searching for relevant memories using vector similarity
 * 3. Formatting retrieved memories as context instructions
 *
 * Use cases:
 * - Long-term memory: Remember facts, preferences, and context across conversations
 * - Semantic recall: Retrieve relevant past information based on current topic
 * - User personalization: Store and recall user-specific information
 * - Conversation continuity: Maintain context across multiple sessions
 *
 * @example
 * ```typescript
 * import { MemoryContextProvider, InMemoryVectorStore } from '@microsoft/agent-framework-ts';
 *
 * // Create embedding service
 * class MyEmbeddingService implements EmbeddingService {
 *   async embed(text: string): Promise<number[]> {
 *     // Generate embedding using your preferred service
 *     return await this.generateEmbedding(text);
 *   }
 * }
 *
 * // Create memory provider
 * const vectorStore = new InMemoryVectorStore();
 * const embeddingService = new MyEmbeddingService();
 * const memoryProvider = new MemoryContextProvider(vectorStore, embeddingService);
 *
 * // Use with agent
 * const agent = new ChatAgent({
 *   chatClient: client,
 *   contextProviders: [memoryProvider],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With custom options
 * const memoryProvider = new MemoryContextProvider(vectorStore, embeddingService, {
 *   topK: 3,
 *   minRelevance: 0.8,
 *   threadId: 'user-123',
 *   formatMemories: (memories) => {
 *     const items = memories.map(m => `- ${m.content}`).join('\n');
 *     return `## Relevant Memories\n${items}`;
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // With custom memory extraction
 * const memoryProvider = new MemoryContextProvider(vectorStore, embeddingService, {
 *   extractMemories: (requests, responses) => {
 *     const memories: Memory[] = [];
 *     // Extract facts from assistant responses
 *     for (const msg of responses) {
 *       if (msg.role === 'assistant') {
 *         const facts = extractFactsFromText(msg.content);
 *         for (const fact of facts) {
 *           memories.push({
 *             id: generateId(),
 *             text: fact,
 *             timestamp: Date.now(),
 *           });
 *         }
 *       }
 *     }
 *     return memories;
 *   }
 * });
 * ```
 */
export class MemoryContextProvider extends ContextProvider {
  private readonly vectorStore: VectorStore;
  private readonly embeddingService: EmbeddingService;
  private readonly topK: number;
  private readonly minRelevance: number;
  private readonly formatMemories: (
    memories: Array<{ content: string; score: number; metadata: Record<string, unknown> }>,
  ) => string;
  private readonly extractMemoriesFunc: (requestMessages: ChatMessage[], responseMessages: ChatMessage[]) => Memory[];
  private currentThreadId?: string;

  /**
   * Create a new MemoryContextProvider.
   *
   * @param vectorStore - The vector store for storing and searching embeddings
   * @param embeddingService - The service for generating text embeddings
   * @param options - Optional configuration for memory retrieval and formatting
   *
   * @example
   * ```typescript
   * const provider = new MemoryContextProvider(vectorStore, embeddingService, {
   *   topK: 5,
   *   minRelevance: 0.7,
   * });
   * ```
   */
  constructor(
    vectorStore: VectorStore,
    embeddingService: EmbeddingService,
    options: MemoryContextProviderOptions = {},
  ) {
    super();
    this.vectorStore = vectorStore;
    this.embeddingService = embeddingService;
    this.topK = options.topK ?? 5;
    this.minRelevance = options.minRelevance ?? 0.7;
    this.currentThreadId = options.threadId;

    // Set up memory formatting function
    this.formatMemories =
      options.formatMemories ||
      ((memories): string => {
        if (memories.length === 0) {
          return '';
        }
        const memoriesText = memories.map((m) => m.content).join('\n\n');
        return `${DEFAULT_CONTEXT_PROMPT}\n\n${memoriesText}`;
      });

    // Set up memory extraction function
    this.extractMemoriesFunc = options.extractMemories || this.defaultExtractMemories.bind(this);
  }

  /**
   * Called just after a new thread is created.
   *
   * Updates the current thread ID for memory filtering.
   *
   * @param threadId - The ID of the new thread
   */
  async threadCreated(threadId: string): Promise<void> {
    this.currentThreadId = threadId;
  }

  /**
   * Called just before the model/agent is invoked.
   *
   * Searches the vector store for relevant memories based on recent messages,
   * filters by relevance score, and formats them as context instructions.
   *
   * @param messages - The most recent messages that the agent is being invoked with
   * @param _tools - Optional tools (not used by this provider)
   * @returns A Promise resolving to an AIContext with retrieved memories as instructions
   *
   * @example
   * ```typescript
   * const messages = [
   *   { role: 'user', content: { type: 'text', text: 'What did I tell you about my preferences?' } }
   * ];
   *
   * const context = await memoryProvider.invoking(messages);
   * // context.instructions contains formatted relevant memories
   * ```
   */
  async invoking(messages: ChatMessage[], _tools?: AITool[]): Promise<AIContext> {
    if (messages.length === 0) {
      return {
        instructions: undefined,
        messages: [],
        tools: [],
      };
    }

    // Generate query from recent messages (last 3 messages or fewer)
    const recentMessages = messages.slice(-3);
    const query = this.generateQuery(recentMessages);

    if (!query) {
      return {
        instructions: undefined,
        messages: [],
        tools: [],
      };
    }

    // Generate query embedding
    const queryEmbedding = await this.embeddingService.embed(query);

    // Search for relevant memories
    const filter = this.currentThreadId ? { threadId: this.currentThreadId } : undefined;
    const results = await this.vectorStore.search(queryEmbedding, this.topK, filter);

    // Filter by minimum relevance
    const relevantMemories = results.filter((r) => r.score >= this.minRelevance);

    if (relevantMemories.length === 0) {
      return {
        instructions: undefined,
        messages: [],
        tools: [],
      };
    }

    // Format memories as instructions
    const memoriesFormatted = relevantMemories.map((r) => ({
      content: (r.metadata.content as string) || r.content || '',
      score: r.score,
      metadata: r.metadata,
    }));

    const instructions = this.formatMemories(memoriesFormatted);

    return {
      instructions: instructions || undefined,
      messages: [],
      tools: [],
    };
  }

  /**
   * Called after the agent has received a response from the underlying inference service.
   *
   * Extracts memories from the conversation, generates embeddings, and stores them
   * in the vector store for future retrieval.
   *
   * @param response - The message that was returned by the model/agent
   * @param context - The context that was provided for this invocation
   *
   * @example
   * ```typescript
   * // Called automatically after each agent response
   * // Stores extracted memories with embeddings for future recall
   * ```
   */
  async invoked(response: ChatMessage, context: AIContext): Promise<void> {
    // Get request messages from context if available
    const requestMessages: ChatMessage[] = context.messages || [];
    const responseMessages: ChatMessage[] = [response];

    // Extract memories from the conversation
    const memories = this.extractMemoriesFunc(requestMessages, responseMessages);

    // Store each memory with its embedding
    for (const memory of memories) {
      try {
        const embedding = await this.embeddingService.embed(memory.text);
        await this.vectorStore.add(memory.id, embedding, {
          content: memory.text,
          timestamp: memory.timestamp || Date.now(),
          threadId: memory.threadId || this.currentThreadId,
          ...memory.metadata,
        });
      } catch (error) {
        // Log error but continue processing other memories
        console.error(`Failed to store memory ${memory.id}:`, error);
      }
    }
  }

  /**
   * Generate a search query from recent messages.
   *
   * Combines the text from recent messages into a single query string
   * for embedding and vector search.
   *
   * @param messages - The recent conversation messages
   * @returns The combined query text
   * @protected
   */
  protected generateQuery(messages: ChatMessage[]): string {
    const texts: string[] = [];

    for (const message of messages) {
      const text = this.extractTextFromMessage(message);
      if (text) {
        texts.push(text);
      }
    }

    return texts.join('\n');
  }

  /**
   * Extract text content from a chat message.
   *
   * Handles various message content formats (string, structured content, arrays).
   *
   * @param message - The chat message
   * @returns The extracted text, or empty string if no text found
   * @protected
   */
  protected extractTextFromMessage(message: ChatMessage): string {
    if (!message?.content) {
      return '';
    }

    // Handle string content
    if (typeof message.content === 'string') {
      return message.content;
    }

    // Handle structured content with type
    if ('type' in message.content && message.content.type === 'text') {
      return (message.content as { text: string }).text || '';
    }

    // Handle array of content parts
    if (Array.isArray(message.content)) {
      const textParts: string[] = [];
      for (const part of message.content) {
        if (part.type === 'text' && 'text' in part) {
          textParts.push((part as { text: string }).text || '');
        }
      }
      return textParts.join(' ');
    }

    return '';
  }

  /**
   * Default memory extraction implementation.
   *
   * Extracts user messages as memories. Override this or provide a custom
   * extractMemories function in options for different extraction logic.
   *
   * @param requestMessages - The request messages from the conversation
   * @param _responseMessages - The response messages (not used in default implementation)
   * @returns Array of extracted memories
   * @protected
   */
  protected defaultExtractMemories(requestMessages: ChatMessage[], _responseMessages: ChatMessage[]): Memory[] {
    const memories: Memory[] = [];

    for (const msg of requestMessages) {
      if (msg.role === 'user') {
        const text = this.extractTextFromMessage(msg);
        if (text && text.trim().length > 0) {
          memories.push({
            id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            text: text.trim(),
            threadId: this.currentThreadId,
            timestamp: Date.now(),
          });
        }
      }
    }

    return memories;
  }
}
