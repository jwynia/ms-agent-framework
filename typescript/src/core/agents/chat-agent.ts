/**
 * ChatAgent - Main agent class for chat-based interactions.
 *
 * This module provides the ChatAgent class which extends BaseAgent to provide
 * a complete chat agent implementation with thread management, tool integration,
 * and flexible message handling.
 *
 * @module agents/chat-agent
 */

import { BaseAgent } from './base-agent.js';
import type { ChatClientProtocol } from '../chat-client/protocol.js';
import type {
  ChatAgentOptions,
  ChatRunOptions,
  ToolChoice,
} from './chat-agent-types.js';
import { AgentRunResponse, AgentRunResponseUpdate } from './chat-agent-types.js';
import type { ChatMessage, Content } from '../types/chat-message.js';
import { MessageRole } from '../types/chat-message.js';
import { AgentThread } from './agent-thread.js';
import type { ChatMessageStore } from '../storage/message-store.js';
import type { AITool } from '../tools/base-tool.js';
import type { ContextProvider } from '../context/context-provider.js';
import { AgentInitializationError } from '../errors/agent-errors.js';
import type { AgentInfo } from '../types/agent-info.js';

/**
 * ChatAgent - Main agent class for chat-based interactions.
 *
 * ChatAgent handles:
 * - Conversation management (service-managed or local threads)
 * - Tool integration
 * - Context providers
 * - Message normalization
 * - Streaming responses
 *
 * @example
 * ```typescript
 * // Basic agent with minimal configuration
 * const agent = new ChatAgent({
 *   chatClient: myOpenAIClient
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Agent with instructions and tools
 * const agent = new ChatAgent({
 *   chatClient: myOpenAIClient,
 *   name: 'assistant',
 *   instructions: 'You are a helpful assistant.',
 *   tools: [weatherTool, calculatorTool]
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Service-managed thread
 * const agent = new ChatAgent({
 *   chatClient: myClient,
 *   conversationId: 'thread-123'
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Local-managed thread
 * const agent = new ChatAgent({
 *   chatClient: myClient,
 *   messageStoreFactory: () => new InMemoryMessageStore()
 * });
 * ```
 */
export class ChatAgent extends BaseAgent {
  private readonly _chatClient: ChatClientProtocol;
  private readonly _instructions?: string;
  private readonly _tools?: AITool[];
  private readonly _messageStoreFactory?: () => ChatMessageStore;
  private readonly _conversationId?: string;
  private readonly _contextProviders?: ContextProvider[];

  // Chat completion parameters
  private readonly _modelId?: string;
  private readonly _temperature?: number;
  private readonly _maxTokens?: number;
  private readonly _topP?: number;
  private readonly _frequencyPenalty?: number;
  private readonly _presencePenalty?: number;
  private readonly _stop?: string | string[];
  private readonly _seed?: number;
  private readonly _store?: boolean;
  private readonly _logitBias?: Record<string, number>;
  private readonly _user?: string;
  private readonly _metadata?: Record<string, unknown>;
  private readonly _toolChoice?: ToolChoice;
  private readonly _responseFormat?: unknown;
  private readonly _additionalChatOptions?: Record<string, unknown>;

  /**
   * Create a new ChatAgent.
   *
   * @param options - Configuration options for the agent
   * @throws {AgentInitializationError} If configuration is invalid
   *
   * @example
   * ```typescript
   * // Minimal configuration
   * const agent = new ChatAgent({
   *   chatClient: myClient
   * });
   * ```
   *
   * @example
   * ```typescript
   * // With service-managed threads
   * const agent2 = new ChatAgent({
   *   chatClient: myClient,
   *   conversationId: 'thread-123'
   * });
   * ```
   *
   * @example
   * ```typescript
   * // With local threads
   * const agent3 = new ChatAgent({
   *   chatClient: myClient,
   *   messageStoreFactory: () => new InMemoryMessageStore()
   * });
   * ```
   */
  constructor(options: ChatAgentOptions) {
    // Validate required options
    if (!options.chatClient) {
      throw new AgentInitializationError('chatClient is required');
    }

    // Validate mutually exclusive thread options
    if (options.conversationId && options.messageStoreFactory) {
      throw new AgentInitializationError(
        'Cannot specify both conversationId and messageStoreFactory. ' +
          'Use conversationId for service-managed threads or messageStoreFactory for local threads.',
      );
    }

    // Generate agent ID if not provided
    const agentId = options.id || `agent_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    // Build AgentInfo for parent constructor
    const info: AgentInfo = {
      id: agentId,
      name: options.name || 'ChatAgent',
      description: options.description,
      instructions: options.instructions,
      metadata: options.metadata,
    };

    // Normalize tools to array for parent constructor
    const toolsArray = options.tools ? (Array.isArray(options.tools) ? options.tools : [options.tools]) : [];

    // Normalize context providers to array
    const contextProvidersArray = options.contextProviders
      ? Array.isArray(options.contextProviders)
        ? options.contextProviders
        : [options.contextProviders]
      : undefined;

    // Call parent constructor with first context provider (BaseAgent only supports one)
    super({
      info,
      chatClient: options.chatClient,
      tools: toolsArray,
      contextProvider: contextProvidersArray?.[0],
    });

    // Store configuration
    this._chatClient = options.chatClient;
    this._instructions = options.instructions;
    this._messageStoreFactory = options.messageStoreFactory;
    this._conversationId = options.conversationId;

    // Store normalized tools
    this._tools = toolsArray.length > 0 ? toolsArray : undefined;

    // Store normalized context providers
    this._contextProviders = contextProvidersArray;

    // Store chat completion parameters
    this._modelId = options.modelId;
    this._temperature = options.temperature;
    this._maxTokens = options.maxTokens;
    this._topP = options.topP;
    this._frequencyPenalty = options.frequencyPenalty;
    this._presencePenalty = options.presencePenalty;
    this._stop = options.stop;
    this._seed = options.seed;
    this._store = options.store;
    this._logitBias = options.logitBias;
    this._user = options.user;
    this._metadata = options.metadata;
    this._toolChoice = options.toolChoice;
    this._responseFormat = options.responseFormat;
    this._additionalChatOptions = options.additionalChatOptions;
  }

  /**
   * Get the unique identifier for this agent.
   */
  get id(): string {
    return this.info.id;
  }

  /**
   * Get the display name for this agent.
   */
  get name(): string {
    return this.info.name;
  }

  /**
   * Get the description of this agent.
   */
  get description(): string | undefined {
    return this.info.description;
  }

  /**
   * Get the instructions for this agent.
   */
  get instructions(): string | undefined {
    return this._instructions;
  }

  /**
   * Create a new thread for this agent.
   *
   * Overrides BaseAgent.getNewThread() to create threads with appropriate
   * configuration (service-managed or local message store).
   *
   * @returns A new AgentThread configured for this agent
   *
   * @example
   * ```typescript
   * const thread = agent.getNewThread();
   * const response = await agent.run('Hello', { thread });
   * ```
   */
  getNewThread(): AgentThread {
    if (this._conversationId) {
      // Service-managed thread with conversation ID
      return new AgentThread({
        serviceThreadId: this._conversationId,
      });
    } else if (this._messageStoreFactory) {
      // Local-managed thread with message store
      return new AgentThread({
        messageStore: this._messageStoreFactory(),
      });
    } else {
      // Undetermined thread (will be determined on first use)
      return new AgentThread();
    }
  }

  /**
   * Normalize messages to ChatMessage array.
   *
   * Accepts:
   * - string (creates user message)
   * - ChatMessage (single message)
   * - ChatMessage[] (array of messages)
   *
   * @param messages - Messages to normalize
   * @returns Array of ChatMessage objects
   *
   * @example
   * ```typescript
   * // String input
   * const msgs1 = normalizeMessages('Hello');
   * // [{ role: 'user', content: { type: 'text', text: 'Hello' } }]
   * ```
   *
   * @example
   * ```typescript
   * // Single message
   * const msgs2 = normalizeMessages({ role: 'user', content: { type: 'text', text: 'Hello' } });
   * // [{ role: 'user', content: { type: 'text', text: 'Hello' } }]
   * ```
   *
   * @example
   * ```typescript
   * // Array
   * const msgs3 = normalizeMessages([
   *   { role: 'user', content: { type: 'text', text: 'Question' } },
   *   { role: 'assistant', content: { type: 'text', text: 'Answer' } }
   * ]);
   * // [{ role: 'user', content: {...} }, { role: 'assistant', content: {...} }]
   * ```
   */
  protected normalizeMessages(messages: string | ChatMessage | ChatMessage[]): ChatMessage[] {
    if (typeof messages === 'string') {
      const content: Content = { type: 'text', text: messages };
      return [
        {
          role: MessageRole.User,
          content,
          timestamp: new Date(),
        },
      ];
    }

    return Array.isArray(messages) ? messages : [messages];
  }

  // Placeholder methods (will be implemented in TASK-101c and 101d)

  /**
   * Execute agent with given messages.
   * **NOTE**: This method is not yet implemented. See TASK-101c.
   *
   * @param messages - Input messages (string, ChatMessage, or array of ChatMessage)
   * @param options - Optional run configuration
   * @returns Promise resolving to agent response
   * @throws {Error} Not yet implemented
   */
  async run(
    messages: string | ChatMessage | ChatMessage[],
    options?: ChatRunOptions,
  ): Promise<AgentRunResponse> {
    // Suppress unused variable warnings - these will be used in TASK-101c
    void messages;
    void options;
    throw new Error('run() method not implemented yet - see TASK-101c');
  }

  /**
   * Execute agent with streaming response.
   * **NOTE**: This method is not yet implemented. See TASK-101d.
   *
   * @param messages - Input messages (string, ChatMessage, or array of ChatMessage)
   * @param options - Optional run configuration
   * @returns AsyncIterable yielding response updates
   * @throws {Error} Not yet implemented
   */
  async *runStream(
    messages: string | ChatMessage | ChatMessage[],
    options?: ChatRunOptions,
  ): AsyncIterable<AgentRunResponseUpdate> {
    // Suppress unused variable warnings - these will be used in TASK-101d
    void messages;
    void options;
    throw new Error('runStream() method not implemented yet - see TASK-101d');
    // Make TypeScript happy about the generator
    yield new AgentRunResponseUpdate({
      role: MessageRole.Assistant,
      content: { type: 'text', text: '' },
    });
  }
}
