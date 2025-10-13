/**
 * Session Context Provider - Maintains per-thread session state and metadata.
 *
 * This module provides a context provider that tracks session information for each
 * conversation thread, including creation time, activity tracking, and custom metadata.
 * It provides session context to the AI model and maintains isolation between threads.
 *
 * @module session-context-provider
 */

import { ContextProvider, AIContext } from './context-provider.js';
import { ChatMessage } from '../types/chat-message.js';
import { AITool } from '../tools/base-tool.js';

/**
 * Session data stored for each thread.
 *
 * Contains metadata about a conversation session, including timestamps and custom data.
 */
export interface SessionData {
  /**
   * When the session was created.
   */
  createdAt: Date;

  /**
   * When the session was last active (last message received).
   */
  lastActivity?: Date;

  /**
   * Custom metadata associated with this session.
   * Can store user preferences, context flags, counters, etc.
   */
  metadata: Record<string, unknown>;
}

/**
 * Options for configuring SessionContextProvider behavior.
 */
export interface SessionContextProviderOptions {
  /**
   * Custom function to format session data into context instructions.
   * If not provided, uses default formatting.
   *
   * @param session - The session data for the current thread
   * @param threadId - The thread ID
   * @returns Formatted instructions string
   */
  formatInstructions?: (session: SessionData, threadId: string) => string;

  /**
   * Whether to include session creation time in instructions (default: true).
   */
  includeCreatedAt?: boolean;

  /**
   * Whether to include last activity time in instructions (default: true).
   */
  includeLastActivity?: boolean;

  /**
   * Whether to include metadata in instructions (default: false).
   * If true, all metadata will be included in formatted instructions.
   */
  includeMetadata?: boolean;
}

/**
 * Session-based context provider that maintains per-thread session state.
 *
 * This provider tracks session metadata for each conversation thread, including:
 * - Session creation timestamp
 * - Last activity timestamp
 * - Custom session metadata
 *
 * It provides session information as context to the AI model and maintains
 * strict isolation between different threads. Each thread has its own independent
 * session data.
 *
 * Use cases:
 * - Track conversation session duration
 * - Store user preferences per conversation
 * - Maintain conversation-specific flags or counters
 * - Provide temporal context to the AI (e.g., "This conversation started 10 minutes ago")
 *
 * @example
 * ```typescript
 * import { SessionContextProvider } from '@microsoft/agent-framework-ts';
 *
 * // Create session provider
 * const sessionProvider = new SessionContextProvider();
 *
 * // Initialize session for a thread
 * await sessionProvider.threadCreated('thread-123');
 *
 * // Use with agent
 * const agent = new ChatAgent({
 *   chatClient: client,
 *   contextProviders: [sessionProvider],
 * });
 *
 * // Get context (includes session information)
 * const context = await sessionProvider.invoking(messages);
 * // context.instructions includes session timestamps
 * ```
 *
 * @example
 * ```typescript
 * // Custom formatting
 * const sessionProvider = new SessionContextProvider({
 *   formatInstructions: (session, threadId) => {
 *     const duration = Date.now() - session.createdAt.getTime();
 *     return `Session ${threadId} has been active for ${duration}ms`;
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Store and use custom metadata
 * const sessionProvider = new SessionContextProvider();
 * await sessionProvider.threadCreated('thread-123');
 *
 * // Set metadata
 * sessionProvider.setMetadata('thread-123', 'userPreference', 'concise');
 * sessionProvider.setMetadata('thread-123', 'language', 'en-US');
 *
 * // Get metadata
 * const preference = sessionProvider.getMetadata('thread-123', 'userPreference');
 * // preference === 'concise'
 * ```
 */
export class SessionContextProvider extends ContextProvider {
  private readonly sessions = new Map<string, SessionData>();
  private currentThreadId: string | null = null;
  private readonly options: Required<SessionContextProviderOptions>;

  /**
   * Create a new SessionContextProvider.
   *
   * @param options - Optional configuration for session behavior
   *
   * @example
   * ```typescript
   * // Default options
   * const provider = new SessionContextProvider();
   * ```
   *
   * @example
   * ```typescript
   * // Custom options
   * const provider = new SessionContextProvider({
   *   includeCreatedAt: true,
   *   includeLastActivity: true,
   *   includeMetadata: true,
   *   formatInstructions: (session) => `Session started: ${session.createdAt.toISOString()}`
   * });
   * ```
   */
  constructor(options?: SessionContextProviderOptions) {
    super();
    this.options = {
      includeCreatedAt: options?.includeCreatedAt ?? true,
      includeLastActivity: options?.includeLastActivity ?? true,
      includeMetadata: options?.includeMetadata ?? false,
      formatInstructions:
        options?.formatInstructions || this.defaultFormatInstructions.bind(this),
    };
  }

  /**
   * Called just after a new thread is created.
   *
   * Initializes session data for the new thread, including creation timestamp
   * and empty metadata. Also sets this thread as the current thread.
   *
   * @param threadId - The ID of the new thread
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-abc');
   *
   * // Session data is now initialized for 'thread-abc'
   * const session = provider.getSession('thread-abc');
   * // session.createdAt is set, session.metadata is {}
   * ```
   */
  async threadCreated(threadId: string): Promise<void> {
    if (!this.sessions.has(threadId)) {
      this.sessions.set(threadId, {
        createdAt: new Date(),
        metadata: {},
      });
    }
    this.currentThreadId = threadId;
  }

  /**
   * Called just before the model/agent is invoked.
   *
   * Returns context containing session information for the current thread,
   * formatted according to provider options.
   *
   * @param _messages - The most recent messages (not used by default implementation)
   * @param _tools - Optional tools (not used by this provider)
   * @returns A Promise resolving to an AIContext with session information as instructions
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-123');
   *
   * const context = await provider.invoking(messages);
   * // context.instructions contains formatted session information
   * ```
   */
  async invoking(_messages: ChatMessage[], _tools?: AITool[]): Promise<AIContext> {
    const threadId = this.currentThreadId;

    if (!threadId) {
      // No thread context available
      return {
        instructions: undefined,
        messages: [],
        tools: [],
      };
    }

    const session = this.sessions.get(threadId);

    if (!session) {
      // Thread not initialized
      return {
        instructions: undefined,
        messages: [],
        tools: [],
      };
    }

    // Format session data into instructions
    const instructions = this.options.formatInstructions(session, threadId);

    return {
      instructions: instructions || undefined,
      messages: [],
      tools: [],
    };
  }

  /**
   * Called after the agent has received a response from the underlying inference service.
   *
   * Updates the last activity timestamp for the current thread's session.
   *
   * @param _response - The response message (not used)
   * @param _context - The context used for invocation (not used)
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-123');
   *
   * await provider.invoked(responseMessage, context);
   * // Session's lastActivity timestamp is now updated
   * ```
   */
  async invoked(_response: ChatMessage, _context: AIContext): Promise<void> {
    const threadId = this.currentThreadId;

    if (!threadId) {
      return;
    }

    const session = this.sessions.get(threadId);

    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Get session data for a specific thread.
   *
   * @param threadId - The thread ID
   * @returns The session data, or undefined if thread not found
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-123');
   *
   * const session = provider.getSession('thread-123');
   * console.log(session?.createdAt);
   * ```
   */
  getSession(threadId: string): SessionData | undefined {
    return this.sessions.get(threadId);
  }

  /**
   * Get all sessions managed by this provider.
   *
   * @returns A Map of thread IDs to session data
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-1');
   * await provider.threadCreated('thread-2');
   *
   * const allSessions = provider.getAllSessions();
   * console.log(allSessions.size); // 2
   * ```
   */
  getAllSessions(): ReadonlyMap<string, SessionData> {
    return new Map(this.sessions);
  }

  /**
   * Set metadata for a specific session.
   *
   * @param threadId - The thread ID
   * @param key - The metadata key
   * @param value - The metadata value
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-123');
   *
   * provider.setMetadata('thread-123', 'userLanguage', 'en-US');
   * provider.setMetadata('thread-123', 'messageCount', 5);
   * ```
   */
  setMetadata(threadId: string, key: string, value: unknown): void {
    const session = this.sessions.get(threadId);
    if (session) {
      session.metadata[key] = value;
    }
  }

  /**
   * Get metadata value for a specific session.
   *
   * @param threadId - The thread ID
   * @param key - The metadata key
   * @returns The metadata value, or undefined if not found
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-123');
   * provider.setMetadata('thread-123', 'userLanguage', 'en-US');
   *
   * const language = provider.getMetadata('thread-123', 'userLanguage');
   * // language === 'en-US'
   * ```
   */
  getMetadata(threadId: string, key: string): unknown {
    const session = this.sessions.get(threadId);
    return session?.metadata[key];
  }

  /**
   * Clear session data for a specific thread.
   *
   * @param threadId - The thread ID
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-123');
   *
   * provider.clearSession('thread-123');
   * const session = provider.getSession('thread-123');
   * // session === undefined
   * ```
   */
  clearSession(threadId: string): void {
    this.sessions.delete(threadId);
    if (this.currentThreadId === threadId) {
      this.currentThreadId = null;
    }
  }

  /**
   * Clear all session data.
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-1');
   * await provider.threadCreated('thread-2');
   *
   * provider.clearAllSessions();
   * const allSessions = provider.getAllSessions();
   * // allSessions.size === 0
   * ```
   */
  clearAllSessions(): void {
    this.sessions.clear();
    this.currentThreadId = null;
  }

  /**
   * Set the current thread ID.
   *
   * This is useful when managing multiple threads and switching context.
   *
   * @param threadId - The thread ID to set as current
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-1');
   * await provider.threadCreated('thread-2');
   *
   * provider.setCurrentThread('thread-1');
   * // Now invoking() will use thread-1's session
   * ```
   */
  setCurrentThread(threadId: string): void {
    this.currentThreadId = threadId;
  }

  /**
   * Get the current thread ID.
   *
   * @returns The current thread ID, or null if not set
   *
   * @example
   * ```typescript
   * const provider = new SessionContextProvider();
   * await provider.threadCreated('thread-123');
   *
   * const currentThread = provider.getCurrentThread();
   * // currentThread === 'thread-123'
   * ```
   */
  getCurrentThread(): string | null {
    return this.currentThreadId;
  }

  /**
   * Default formatting function for session instructions.
   *
   * Formats session data into a human-readable string based on provider options.
   * Override this or provide custom formatInstructions option to customize.
   *
   * @param session - The session data
   * @param threadId - The thread ID
   * @returns Formatted instructions string
   *
   * @protected
   */
  protected defaultFormatInstructions(session: SessionData, threadId: string): string {
    const parts: string[] = [];

    if (this.options.includeCreatedAt) {
      parts.push(`Session started at: ${session.createdAt.toISOString()}`);
    }

    if (this.options.includeLastActivity && session.lastActivity) {
      parts.push(`Last activity: ${session.lastActivity.toISOString()}`);
    }

    if (this.options.includeMetadata && Object.keys(session.metadata).length > 0) {
      parts.push(`Session metadata: ${JSON.stringify(session.metadata)}`);
    }

    if (parts.length === 0) {
      return `Session ID: ${threadId}`;
    }

    return parts.join('\n');
  }
}
