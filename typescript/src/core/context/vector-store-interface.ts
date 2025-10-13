/**
 * Vector Store Interface - Storage abstraction for vector embeddings and memories.
 *
 * This module provides interfaces for vector store implementations that support
 * storing, searching, and managing vector embeddings with metadata. This is used
 * by MemoryContextProvider for long-term memory storage and semantic recall.
 *
 * @module vector-store-interface
 */

/**
 * Result from a vector store search operation.
 *
 * Represents a single search result containing metadata about the stored item,
 * its relevance score, and the content itself.
 */
export interface VectorSearchResult {
  /**
   * Unique identifier for the stored item.
   */
  id: string;

  /**
   * The relevance score (typically between 0 and 1, higher is more relevant).
   * The exact range and meaning depends on the similarity metric used.
   */
  score: number;

  /**
   * Metadata associated with the stored item.
   * This should include all data stored with the vector, such as:
   * - content: The original text/content
   * - timestamp: When the memory was created
   * - threadId: Which conversation thread it belongs to
   * - Any other custom metadata
   */
  metadata: Record<string, unknown>;

  /**
   * Optional: The original content/text that was stored.
   * This may be stored in metadata.content as well.
   */
  content?: string;
}

/**
 * Interface for vector store implementations.
 *
 * Provides a complete contract for vector stores to be compatible with MemoryContextProvider.
 * Implementations should provide storage, semantic search, and management capabilities
 * for vector embeddings.
 *
 * @example
 * ```typescript
 * import { VectorStore, VectorSearchResult } from '@microsoft/agent-framework-ts';
 *
 * class MyVectorStore implements VectorStore {
 *   async add(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void> {
 *     // Store the embedding and metadata in your database
 *     await this.db.insert({ id, embedding, metadata });
 *   }
 *
 *   async search(query: number[], topK: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]> {
 *     // Search for similar embeddings
 *     const results = await this.db.search(query, topK, filter);
 *     return results.map(r => ({
 *       id: r.id,
 *       score: r.similarity,
 *       metadata: r.metadata,
 *       content: r.metadata.content as string,
 *     }));
 *   }
 *
 *   async delete(id: string): Promise<void> {
 *     await this.db.delete(id);
 *   }
 *
 *   async clear(): Promise<void> {
 *     await this.db.deleteAll();
 *   }
 * }
 * ```
 */
export interface VectorStore {
  /**
   * Add a new vector embedding to the store.
   *
   * @param id - Unique identifier for this embedding
   * @param embedding - The vector embedding (array of numbers)
   * @param metadata - Associated metadata (should include content, timestamp, threadId, etc.)
   * @returns Promise that resolves when the embedding is stored
   *
   * @example
   * ```typescript
   * await vectorStore.add('memory-1', [0.1, 0.2, 0.3, ...], {
   *   content: 'User likes coffee',
   *   timestamp: Date.now(),
   *   threadId: 'thread-123',
   * });
   * ```
   */
  add(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void>;

  /**
   * Search for vectors similar to the query embedding.
   *
   * @param query - The query embedding to search for
   * @param topK - Number of top results to return (ordered by relevance)
   * @param filter - Optional metadata filter (e.g., { threadId: 'thread-123' })
   * @returns Promise resolving to an array of search results, ordered by relevance (highest first)
   *
   * @example
   * ```typescript
   * const results = await vectorStore.search(queryEmbedding, 5, {
   *   threadId: 'thread-123'
   * });
   *
   * for (const result of results) {
   *   console.log(`Found: ${result.content} (score: ${result.score})`);
   * }
   * ```
   */
  search(query: number[], topK: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;

  /**
   * Delete a specific embedding from the store.
   *
   * @param id - The unique identifier of the embedding to delete
   * @returns Promise that resolves when the embedding is deleted
   *
   * @example
   * ```typescript
   * await vectorStore.delete('memory-1');
   * ```
   */
  delete(id: string): Promise<void>;

  /**
   * Clear all embeddings from the store.
   *
   * @returns Promise that resolves when all embeddings are cleared
   *
   * @example
   * ```typescript
   * await vectorStore.clear();
   * ```
   */
  clear(): Promise<void>;
}

/**
 * Interface for embedding service implementations.
 *
 * Provides the contract for generating vector embeddings from text.
 * Implementations can use external APIs (OpenAI, Azure, etc.) or local models.
 *
 * @example
 * ```typescript
 * import { EmbeddingService } from '@microsoft/agent-framework-ts';
 *
 * class OpenAIEmbeddingService implements EmbeddingService {
 *   constructor(private apiKey: string) {}
 *
 *   async embed(text: string): Promise<number[]> {
 *     const response = await fetch('https://api.openai.com/v1/embeddings', {
 *       method: 'POST',
 *       headers: {
 *         'Authorization': `Bearer ${this.apiKey}`,
 *         'Content-Type': 'application/json',
 *       },
 *       body: JSON.stringify({
 *         model: 'text-embedding-3-small',
 *         input: text,
 *       }),
 *     });
 *
 *     const data = await response.json();
 *     return data.data[0].embedding;
 *   }
 * }
 * ```
 */
export interface EmbeddingService {
  /**
   * Generate a vector embedding for the given text.
   *
   * @param text - The text to generate an embedding for
   * @returns Promise resolving to the embedding vector
   *
   * @example
   * ```typescript
   * const embedding = await embeddingService.embed('Hello, world!');
   * console.log(embedding.length); // e.g., 1536 for OpenAI text-embedding-3-small
   * ```
   */
  embed(text: string): Promise<number[]>;
}

/**
 * In-memory vector store implementation for testing and development.
 *
 * This implementation stores all vectors in memory and uses cosine similarity
 * for search. It's suitable for testing and small-scale applications but
 * should not be used in production for large datasets.
 *
 * @example
 * ```typescript
 * import { InMemoryVectorStore } from '@microsoft/agent-framework-ts';
 *
 * const vectorStore = new InMemoryVectorStore();
 *
 * // Add some vectors
 * await vectorStore.add('id-1', [0.1, 0.2, 0.3], { content: 'First memory' });
 * await vectorStore.add('id-2', [0.2, 0.3, 0.4], { content: 'Second memory' });
 *
 * // Search for similar vectors
 * const results = await vectorStore.search([0.15, 0.25, 0.35], 5);
 * console.log(results[0].content); // Most similar memory
 * ```
 */
export class InMemoryVectorStore implements VectorStore {
  private vectors = new Map<
    string,
    {
      embedding: number[];
      metadata: Record<string, unknown>;
    }
  >();

  /**
   * Add a vector to the in-memory store.
   *
   * @param id - Unique identifier for the vector
   * @param embedding - The vector embedding
   * @param metadata - Associated metadata
   */
  async add(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void> {
    this.vectors.set(id, { embedding, metadata });
  }

  /**
   * Search for vectors similar to the query.
   *
   * Uses cosine similarity to find the most similar vectors.
   * Optionally filters by metadata before computing similarity.
   *
   * @param query - The query embedding
   * @param topK - Number of results to return
   * @param filter - Optional metadata filter
   * @returns Array of search results ordered by score (highest first)
   */
  async search(query: number[], topK: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];

    for (const [id, { embedding, metadata }] of this.vectors) {
      // Apply metadata filter if provided
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) {
          continue;
        }
      }

      // Calculate cosine similarity
      const score = this.cosineSimilarity(query, embedding);
      results.push({
        id,
        score,
        metadata,
        content: metadata.content as string | undefined,
      });
    }

    // Sort by score (highest first) and return top-K
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  /**
   * Delete a vector from the store.
   *
   * @param id - The identifier of the vector to delete
   */
  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  /**
   * Clear all vectors from the store.
   */
  async clear(): Promise<void> {
    this.vectors.clear();
  }

  /**
   * Calculate cosine similarity between two vectors.
   *
   * @param a - First vector
   * @param b - Second vector
   * @returns Cosine similarity score (between -1 and 1, typically 0 to 1 for embeddings)
   * @private
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimensions don't match: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }
}
