/**
 * Context module - AI context management with lifecycle hooks.
 *
 * This module provides functionality for managing AI context through providers
 * that can enhance the AI's context with additional instructions, messages, and tools.
 *
 * Key components:
 * - ContextProvider: Abstract base class for custom context providers
 * - AIContext: Interface for context data (instructions, messages, tools)
 * - AggregateContextProvider: Combines multiple context providers
 * - DEFAULT_CONTEXT_PROMPT: Standard prompt for memory/context assembly
 * - SimpleContextProvider: Static context provider
 * - RAGContextProvider: Retrieval-augmented generation context provider
 * - SessionContextProvider: Session-based context provider
 * - MemoryContextProvider: Memory storage and retrieval with vector search
 *
 * @module context
 */

export { ContextProvider, AIContext, DEFAULT_CONTEXT_PROMPT } from './context-provider.js';

export { AggregateContextProvider } from './aggregate-provider.js';

export { SimpleContextProvider } from './simple-context-provider.js';

export { RAGContextProvider, VectorStore, VectorSearchResult } from './rag-context-provider.js';

export { SessionContextProvider, SessionData, SessionContextProviderOptions } from './session-context-provider.js';

export { MemoryContextProvider, Memory, MemoryContextProviderOptions } from './memory-context-provider.js';

export {
  VectorStore as VectorStoreInterface,
  EmbeddingService,
  VectorSearchResult as VectorSearchResultInterface,
  InMemoryVectorStore,
} from './vector-store-interface.js';
