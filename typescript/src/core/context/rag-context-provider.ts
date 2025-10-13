/**
 * RAG Context Provider - Provides context via retrieval-augmented generation.
 *
 * This module provides a context provider that queries a vector store to retrieve
 * relevant documents/memories based on recent conversation messages, then formats
 * them as context for the AI model. This enables retrieval-augmented generation (RAG)
 * patterns for enhanced context awareness.
 *
 * @module rag-context-provider
 */

import { ContextProvider, AIContext, DEFAULT_CONTEXT_PROMPT } from './context-provider.js';
import { ChatMessage } from '../types/chat-message.js';
import { AITool } from '../tools/base-tool.js';

/**
 * Result from a vector store search operation.
 *
 * Represents a single search result containing the retrieved content,
 * its relevance score, and optional metadata.
 */
export interface VectorSearchResult {
  /**
   * The content/text of the retrieved document or memory.
   */
  content: string;

  /**
   * The relevance score (typically between 0 and 1, higher is more relevant).
   * The exact range and meaning depends on the vector store implementation.
   */
  score: number;

  /**
   * Optional metadata associated with the document (e.g., source, timestamp, tags).
   */
  metadata?: Record<string, unknown>;
}

/**
 * Interface for vector store implementations.
 *
 * Provides a minimal contract for vector stores to be compatible with RAGContextProvider.
 * Implementations should provide semantic search capabilities over stored documents/memories.
 */
export interface VectorStore {
  /**
   * Search the vector store for documents similar to the query.
   *
   * @param query - The search query text
   * @param topK - Number of top results to return
   * @returns Promise resolving to an array of search results, ordered by relevance (highest first)
   */
  search(query: string, topK: number): Promise<VectorSearchResult[]>;
}

/**
 * RAG (Retrieval-Augmented Generation) context provider using vector store.
 *
 * This provider implements a RAG pattern by:
 * 1. Extracting the most recent user message as a search query
 * 2. Querying a vector store for relevant documents/memories
 * 3. Formatting the results as context instructions for the AI model
 *
 * Use cases:
 * - Long-term memory: Retrieve relevant past conversations or knowledge
 * - Document Q&A: Query against a knowledge base to provide context
 * - Semantic search: Find and inject relevant information based on conversation topic
 *
 * @example
 * ```typescript
 * import { RAGContextProvider } from '@microsoft/agent-framework-ts';
 *
 * // Implement a vector store
 * class MyVectorStore implements VectorStore {
 *   async search(query: string, topK: number): Promise<VectorSearchResult[]> {
 *     // Query your vector database
 *     const results = await this.queryDatabase(query, topK);
 *     return results.map(r => ({
 *       content: r.text,
 *       score: r.similarity,
 *       metadata: r.meta,
 *     }));
 *   }
 * }
 *
 * // Create RAG provider
 * const vectorStore = new MyVectorStore();
 * const ragProvider = new RAGContextProvider(vectorStore, 5);
 *
 * // Use with agent
 * const agent = new ChatAgent({
 *   chatClient: client,
 *   contextProviders: [ragProvider],
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Custom formatting with custom prompt
 * const ragProvider = new RAGContextProvider(vectorStore, 3, {
 *   formatResults: (results) => {
 *     const docs = results.map(r => `- ${r.content} (score: ${r.score})`).join('\n');
 *     return `## Retrieved Knowledge\n${docs}`;
 *   }
 * });
 * ```
 */
export class RAGContextProvider extends ContextProvider {
  private readonly vectorStore: VectorStore;
  private readonly topK: number;
  private readonly formatResults: (results: VectorSearchResult[]) => string;

  /**
   * Create a new RAGContextProvider.
   *
   * @param vectorStore - The vector store to query for relevant documents
   * @param topK - Number of top results to retrieve (default: 5)
   * @param options - Optional configuration
   * @param options.formatResults - Custom function to format search results into instructions.
   *   If not provided, uses default formatting with DEFAULT_CONTEXT_PROMPT.
   *
   * @example
   * ```typescript
   * const provider = new RAGContextProvider(vectorStore, 5);
   * ```
   *
   * @example
   * ```typescript
   * // With custom formatting
   * const provider = new RAGContextProvider(vectorStore, 3, {
   *   formatResults: (results) => {
   *     return results.map(r => r.content).join('\n\n');
   *   }
   * });
   * ```
   */
  constructor(
    vectorStore: VectorStore,
    topK: number = 5,
    options?: {
      formatResults?: (results: VectorSearchResult[]) => string;
    }
  ) {
    super();
    this.vectorStore = vectorStore;
    this.topK = topK;
    this.formatResults =
      options?.formatResults ||
      ((results: VectorSearchResult[]): string => {
        if (results.length === 0) {
          return '';
        }
        const memories = results.map((r) => r.content).join('\n\n');
        return `${DEFAULT_CONTEXT_PROMPT}\n\n${memories}`;
      });
  }

  /**
   * Called just before the model/agent is invoked.
   *
   * Queries the vector store using the most recent user message, retrieves relevant
   * documents, formats them as instructions, and returns as context.
   *
   * @param messages - The most recent messages that the agent is being invoked with
   * @param _tools - Optional tools (not used by this provider)
   * @returns A Promise resolving to an AIContext with retrieved information as instructions
   *
   * @example
   * ```typescript
   * const provider = new RAGContextProvider(vectorStore, 3);
   *
   * const messages = [
   *   { role: 'user', content: { type: 'text', text: 'What is TypeScript?' } }
   * ];
   *
   * const context = await provider.invoking(messages);
   * // context.instructions contains formatted search results from vector store
   * ```
   */
  async invoking(messages: ChatMessage[], _tools?: AITool[]): Promise<AIContext> {
    // Extract query from the most recent message
    const query = this.extractQuery(messages);

    if (!query) {
      // No query available, return empty context
      return {
        instructions: undefined,
        messages: [],
        tools: [],
      };
    }

    // Query vector store for relevant documents
    const results = await this.vectorStore.search(query, this.topK);

    // Format results as instructions
    const instructions = this.formatResults(results);

    return {
      instructions: instructions || undefined,
      messages: [],
      tools: [],
    };
  }

  /**
   * Extract query text from the most recent messages.
   *
   * This looks at the last user or assistant message and extracts text content.
   * Override this method to customize query extraction logic.
   *
   * @param messages - The conversation messages
   * @returns The extracted query text, or empty string if no text found
   *
   * @protected
   */
  protected extractQuery(messages: ChatMessage[]): string {
    if (!messages || messages.length === 0) {
      return '';
    }

    // Get the last message
    const lastMessage = messages[messages.length - 1];

    // Extract text from content
    if (!lastMessage?.content) {
      return '';
    }

    // Handle string content (legacy format)
    if (typeof lastMessage.content === 'string') {
      return lastMessage.content;
    }

    // Handle structured content
    if ('type' in lastMessage.content && lastMessage.content.type === 'text') {
      return (lastMessage.content as { text: string }).text || '';
    }

    // Handle array of content parts
    if (Array.isArray(lastMessage.content)) {
      // Find first text content part
      for (const part of lastMessage.content) {
        if (part.type === 'text' && 'text' in part) {
          return (part as { text: string }).text || '';
        }
      }
    }

    return '';
  }

  /**
   * Called just after a new thread is created.
   *
   * This is a no-op for RAGContextProvider. Override this if you need to perform
   * thread-specific initialization (e.g., filtering vector store results by thread).
   *
   * @param _threadId - The ID of the new thread (not used)
   */
  async threadCreated(_threadId: string): Promise<void> {
    // No-op: RAGContextProvider doesn't maintain per-thread state by default
  }

  /**
   * Called after the agent has received a response from the underlying inference service.
   *
   * This is a no-op for basic RAGContextProvider. Override this if you need to store
   * the conversation in the vector store or perform other post-invocation actions.
   *
   * @param _response - The response message (not used)
   * @param _context - The context used for invocation (not used)
   */
  async invoked(_response: ChatMessage, _context: AIContext): Promise<void> {
    // No-op: RAGContextProvider doesn't track responses by default
  }
}
