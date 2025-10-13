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
  UsageDetails,
} from './chat-agent-types.js';
import { AgentRunResponse, AgentRunResponseUpdate } from './chat-agent-types.js';
import type { ChatMessage, Content } from '../types/chat-message.js';
import { MessageRole } from '../types/chat-message.js';
import { AgentThread } from './agent-thread.js';
import type { ChatMessageStore } from '../storage/message-store.js';
import type { AITool } from '../tools/base-tool.js';
import { type MCPTool, isMCPTool } from '../tools/mcp-tool.js';
import type { ContextProvider } from '../context/context-provider.js';
import { AgentInitializationError } from '../errors/agent-errors.js';
import type { AgentInfo } from '../types/agent-info.js';
import { AsyncExitStack } from '../utils/async-exit-stack.js';
import { getLogger } from '../logging/logger.js';
import { ThreadType } from '../threads/service-thread-types.js';

/**
 * ChatAgent - Main agent class for chat-based interactions.
 *
 * ChatAgent handles:
 * - Conversation management (service-managed or local threads)
 * - Tool integration
 * - Context providers
 * - Message normalization
 * - Streaming responses
 * - Serialization with dependency injection
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
 *
 * @example
 * ```typescript
 * // Serialization and deserialization
 * const agent = new ChatAgent({
 *   chatClient: myClient,
 *   name: 'assistant',
 *   temperature: 0.7
 * });
 * const json = agent.toJson();
 *
 * // Restore from JSON with injected chatClient
 * const restored = ChatAgent.fromJson(json, {
 *   dependencies: {
 *     'chat_agent.chatClient': myClient
 *   }
 * });
 * ```
 */
export class ChatAgent extends BaseAgent implements AsyncDisposable {
  /**
   * Fields to exclude from serialization.
   * Extends BaseAgent.DEFAULT_EXCLUDE with ChatAgent-specific exclusions.
   */
  static readonly DEFAULT_EXCLUDE = new Set<string>([
    ...BaseAgent.DEFAULT_EXCLUDE,
    '_chatClient', // Duplicate of chatClient (from parent)
  ]);

  /**
   * Fields that are injectable dependencies.
   * Extends BaseAgent.INJECTABLE with ChatAgent-specific injectable fields.
   */
  static readonly INJECTABLE = new Set<string>([
    ...BaseAgent.INJECTABLE,
    'messageStoreFactory', // Factory function is not serializable
  ]);

  /**
   * Type identifier for serialization.
   */
  static readonly type = 'chat_agent';


  private readonly _chatClient: ChatClientProtocol;
  private readonly _instructions?: string;
  private readonly _tools?: AITool[];
  private readonly _localMcpTools: MCPTool[];
  private readonly _asyncExitStack: AsyncExitStack;
  private readonly _messageStoreFactory?: () => ChatMessageStore;
  private readonly _conversationId?: string;
  private readonly _contextProviders?: ContextProvider[];
  private readonly _logger = getLogger('agent_framework.agents.chat');
  private readonly _threadsNotified = new WeakSet<AgentThread>();

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

    // Normalize tools to array
    const allTools = options.tools ? (Array.isArray(options.tools) ? options.tools : [options.tools]) : [];

    // Separate MCP tools from regular tools
    const mcpTools: MCPTool[] = [];
    const regularTools: AITool[] = [];

    for (const tool of allTools) {
      if (isMCPTool(tool)) {
        mcpTools.push(tool);
      } else {
        regularTools.push(tool as AITool);
      }
    }

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
      tools: regularTools,
      contextProvider: contextProvidersArray?.[0],
    });

    // Store configuration
    this._chatClient = options.chatClient;
    this._instructions = options.instructions;
    this._messageStoreFactory = options.messageStoreFactory;
    this._conversationId = options.conversationId;

    // Store normalized tools (only regular tools, not MCP)
    this._tools = regularTools.length > 0 ? regularTools : undefined;

    // Store MCP tools separately
    this._localMcpTools = mcpTools;

    // Initialize AsyncExitStack for MCP lifecycle management
    this._asyncExitStack = new AsyncExitStack();

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
   * Resolve final tools by combining constructor tools with runtime tools and MCP functions.
   *
   * This method:
   * 1. Starts with constructor tools (regular tools only)
   * 2. Adds runtime-provided tools (regular + MCP)
   * 3. Connects runtime MCP tools if needed
   * 4. Resolves runtime MCP tool functions
   * 5. Connects constructor MCP tools if needed
   * 6. Resolves constructor MCP tool functions
   *
   * @param constructorTools - Tools provided in constructor
   * @param runtimeTools - Tools provided at runtime (optional)
   * @returns Promise resolving to final array of AITool objects
   * @private
   */
  private async resolveFinalTools(
    constructorTools: AITool[] | undefined,
    runtimeTools?: AITool | AITool[] | MCPTool | MCPTool[],
  ): Promise<AITool[]> {
    const finalTools: AITool[] = [...(constructorTools || [])];

    // Handle runtime tools
    if (runtimeTools) {
      const runtimeArray = Array.isArray(runtimeTools) ? runtimeTools : [runtimeTools];

      for (const tool of runtimeArray) {
        if (isMCPTool(tool)) {
          // Connect MCP tool if not already connected
          if (!tool.isConnected) {
            await this._asyncExitStack.enterAsyncContext(tool);
          }
          // Resolve and add MCP tool functions
          const mcpFunctions = await tool.getFunctions();
          finalTools.push(...mcpFunctions);
        } else {
          // Add regular tool directly
          finalTools.push(tool as AITool);
        }
      }
    }

    // Connect and resolve constructor MCP tools
    for (const mcpTool of this._localMcpTools) {
      if (!mcpTool.isConnected) {
        await this._asyncExitStack.enterAsyncContext(mcpTool);
      }
      const mcpFunctions = await mcpTool.getFunctions();
      finalTools.push(...mcpFunctions);
    }

    return finalTools;
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

  /**
   * Execute agent with given messages and return response.
   *
   * This method:
   * 1. Normalizes input messages to ChatMessage[]
   * 2. Creates or uses provided thread
   * 3. Loads existing messages from thread
   * 4. Prepares context from context providers
   * 5. Merges agent instructions and context
   * 6. Calls chat client with complete message list
   * 7. Updates thread with conversation ID (determines thread type)
   * 8. Stores new messages in thread
   * 9. Returns AgentRunResponse
   *
   * @param messages - Input messages (string, ChatMessage, or ChatMessage[])
   * @param options - Optional run configuration
   * @returns Promise resolving to AgentRunResponse
   *
   * @example
   * ```typescript
   * // Simple text input
   * const response = await agent.run('What is the weather?');
   * console.log(response.text);
   *
   * // With options
   * const response2 = await agent.run('Calculate 2+2', {
   *   temperature: 0.7,
   *   toolChoice: 'required'
   * });
   *
   * // With existing thread
   * const thread = agent.getNewThread();
   * const response3 = await agent.run('Hello', { thread });
   * const response4 = await agent.run('How are you?', { thread });
   * ```
   */
  async run(
    messages: string | ChatMessage | ChatMessage[],
    options?: ChatRunOptions,
  ): Promise<AgentRunResponse> {
    // 1. Normalize messages
    const normalizedMessages = this.normalizeMessages(messages);

    // 2. Get or create thread
    const thread = options?.thread || this.getNewThread();

    // 3. Prepare thread and messages
    const { preparedMessages, contextTools } = await this.prepareThreadAndMessages(thread, normalizedMessages, options);

    // 4. Resolve final tools (including MCP tools)
    const finalTools = await this.resolveFinalTools(this._tools, options?.tools);

    // 5. Merge tools: resolved tools + context tools
    const allTools = [...finalTools];
    if (contextTools && contextTools.length > 0) {
      allTools.push(...contextTools);
    }

    // 6. Merge chat options (constructor + runtime overrides) with all tools
    const chatOptions = this.mergeChatOptions(options, allTools);

    // 6. Call chat client
    const responseMessage = await this._chatClient.complete(preparedMessages, chatOptions);

    // 6. Extract metadata from response
    const metadata = responseMessage.metadata || {};
    const conversationId = metadata.conversationId as string | undefined;
    const responseId = metadata.responseId as string | undefined;
    const usageDetails = metadata.usage as UsageDetails | undefined;

    // 7. Update thread with conversation ID (determines thread type if undetermined)
    thread.updateWithConversationId(conversationId, this._messageStoreFactory);

    // 7a. If thread was just determined as service-managed, notify context providers (only once per thread)
    if (conversationId && thread.threadType === ThreadType.SERVICE_MANAGED && !this._threadsNotified.has(thread)) {
      this._threadsNotified.add(thread);
      await this.notifyContextProvidersThreadCreated(conversationId);
    }

    // 8. Store new messages in thread (if local-managed)
    await thread.onNewMessages([...normalizedMessages, responseMessage]);

    // 9. Notify context providers of invocation completion
    await this.notifyContextProvidersInvoked(normalizedMessages, [responseMessage]);

    // 10. Create and return AgentRunResponse
    return new AgentRunResponse({
      messages: [responseMessage],
      responseId,
      createdAt: responseMessage.timestamp,
      usageDetails,
      rawRepresentation: metadata.rawRepresentation,
      additionalProperties: metadata,
    });
  }

  /**
   * Prepare thread and messages for execution.
   *
   * This method:
   * - Loads existing messages from thread
   * - Invokes context providers
   * - Builds system message from instructions + context
   * - Combines system message + history + new messages
   *
   * @param thread - The thread to use
   * @param newMessages - New messages to add
   * @param options - Run options
   * @returns Prepared messages and system message
   */
  private async prepareThreadAndMessages(
    thread: AgentThread,
    newMessages: ChatMessage[],
    options?: ChatRunOptions,
  ): Promise<{ preparedMessages: ChatMessage[]; systemMessage?: ChatMessage; contextTools: AITool[] }> {
    // Load existing messages from thread
    const existingMessages = await thread.getMessages();

    // Get context from context providers
    const contextInstructions: string[] = [];
    const contextMessages: ChatMessage[] = [];
    const contextTools: AITool[] = [];

    if (this._contextProviders && this._contextProviders.length > 0) {
      // Combine new messages with existing for context
      const allMessagesForContext = [...existingMessages, ...newMessages];

      // Get tools for context (from constructor + runtime options)
      const toolsForContext = this.getToolsForExecution(options);

      // Call invoking() on each provider with error handling
      for (const provider of this._contextProviders) {
        try {
          const context = await provider.invoking(allMessagesForContext, toolsForContext);
          if (context.instructions) {
            contextInstructions.push(context.instructions);
          }
          if (context.messages) {
            contextMessages.push(...context.messages);
          }
          if (context.tools) {
            contextTools.push(...context.tools);
          }
        } catch (error) {
          // Log error but don't fail execution
          this._logger.warn('Context provider invoking() failed - continuing execution', {
            provider: provider.constructor.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // Build system message
    let systemMessage: ChatMessage | undefined;
    const hasInstructions = this._instructions && this._instructions.trim().length > 0;
    const hasContextInstructions = contextInstructions.length > 0;

    if (hasInstructions || hasContextInstructions) {
      const parts: string[] = [];
      if (hasInstructions) {
        parts.push(this._instructions!);
      }
      if (hasContextInstructions) {
        parts.push('# Context\n' + contextInstructions.join('\n\n'));
      }

      systemMessage = {
        role: MessageRole.System,
        content: { type: 'text', text: parts.join('\n\n') },
        timestamp: new Date(),
      };
    }

    // Combine: system message + existing messages + context messages + new messages
    const preparedMessages: ChatMessage[] = [];
    if (systemMessage) {
      preparedMessages.push(systemMessage);
    }
    preparedMessages.push(...existingMessages);
    if (contextMessages.length > 0) {
      preparedMessages.push(...contextMessages);
    }
    preparedMessages.push(...newMessages);

    return { preparedMessages, systemMessage, contextTools };
  }

  /**
   * Get tools for execution, combining constructor tools with runtime options.
   *
   * @param options - Runtime options
   * @returns Array of tools to use
   */
  private getToolsForExecution(options?: ChatRunOptions): AITool[] | undefined {
    if (options?.tools) {
      // Runtime tools override constructor tools
      return Array.isArray(options.tools) ? options.tools : [options.tools];
    }
    return this._tools;
  }

  /**
   * Notify context providers after invocation.
   *
   * Calls invoked() on all context providers with error handling.
   * Errors are logged but don't fail execution.
   *
   * @param inputMessages - The input messages
   * @param responseMessages - The response messages
   */
  private async notifyContextProvidersInvoked(
    inputMessages: ChatMessage[],
    responseMessages: ChatMessage[]
  ): Promise<void> {
    if (!this._contextProviders || this._contextProviders.length === 0) {
      return;
    }

    for (const provider of this._contextProviders) {
      try {
        await provider.invoked(responseMessages[0], {
          instructions: this._instructions,
          messages: inputMessages,
          tools: this._tools,
        });
      } catch (error) {
        // Log error but don't fail execution
        this._logger.warn('Context provider invoked() failed - continuing execution', {
          provider: provider.constructor.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Notify context providers of thread creation.
   *
   * Calls threadCreated() on all context providers with error handling.
   * Errors are logged but don't fail execution.
   *
   * @param threadId - The service thread ID
   */
  private async notifyContextProvidersThreadCreated(threadId: string): Promise<void> {
    if (!this._contextProviders || this._contextProviders.length === 0) {
      return;
    }

    for (const provider of this._contextProviders) {
      try {
        await provider.threadCreated(threadId);
      } catch (error) {
        // Log error but don't fail execution
        this._logger.warn('Context provider threadCreated() failed - continuing execution', {
          provider: provider.constructor.name,
          threadId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Merge chat options from constructor and runtime overrides.
   *
   * Runtime options take precedence over constructor options.
   * All tools (resolved MCP + context) are provided as a single array.
   *
   * @param runtimeOptions - Runtime options from run() call
   * @param allTools - All resolved tools (constructor + MCP functions + context tools)
   * @returns Merged chat options for chat client
   */
  private mergeChatOptions(runtimeOptions?: ChatRunOptions, allTools?: AITool[]): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    // Add constructor options
    if (this._modelId !== undefined) options.modelId = this._modelId;
    if (this._temperature !== undefined) options.temperature = this._temperature;
    if (this._maxTokens !== undefined) options.maxTokens = this._maxTokens;
    if (this._topP !== undefined) options.topP = this._topP;
    if (this._frequencyPenalty !== undefined) options.frequencyPenalty = this._frequencyPenalty;
    if (this._presencePenalty !== undefined) options.presencePenalty = this._presencePenalty;
    if (this._stop !== undefined) options.stop = this._stop;
    if (this._seed !== undefined) options.seed = this._seed;
    if (this._store !== undefined) options.store = this._store;
    if (this._logitBias !== undefined) options.logitBias = this._logitBias;
    if (this._user !== undefined) options.user = this._user;
    if (this._metadata !== undefined) options.metadata = this._metadata;
    if (this._toolChoice !== undefined) options.toolChoice = this._toolChoice;
    if (this._responseFormat !== undefined) options.responseFormat = this._responseFormat;

    // Use all tools if provided (includes constructor + MCP + context)
    if (allTools !== undefined && allTools.length > 0) {
      options.tools = allTools;
    }


    if (this._conversationId !== undefined) options.conversationId = this._conversationId;

    // Merge additional chat options
    if (this._additionalChatOptions) {
      Object.assign(options, this._additionalChatOptions);
    }

    // Override with runtime options (if provided)
    if (runtimeOptions) {
      if (runtimeOptions.modelId !== undefined) options.modelId = runtimeOptions.modelId;
      if (runtimeOptions.temperature !== undefined) options.temperature = runtimeOptions.temperature;
      if (runtimeOptions.maxTokens !== undefined) options.maxTokens = runtimeOptions.maxTokens;
      if (runtimeOptions.topP !== undefined) options.topP = runtimeOptions.topP;
      if (runtimeOptions.frequencyPenalty !== undefined)
        options.frequencyPenalty = runtimeOptions.frequencyPenalty;
      if (runtimeOptions.presencePenalty !== undefined)
        options.presencePenalty = runtimeOptions.presencePenalty;
      if (runtimeOptions.stop !== undefined) options.stop = runtimeOptions.stop;
      if (runtimeOptions.seed !== undefined) options.seed = runtimeOptions.seed;
      if (runtimeOptions.store !== undefined) options.store = runtimeOptions.store;
      if (runtimeOptions.logitBias !== undefined) options.logitBias = runtimeOptions.logitBias;
      if (runtimeOptions.user !== undefined) options.user = runtimeOptions.user;
      if (runtimeOptions.metadata !== undefined) options.metadata = runtimeOptions.metadata;
      if (runtimeOptions.toolChoice !== undefined) options.toolChoice = runtimeOptions.toolChoice;
      if (runtimeOptions.responseFormat !== undefined) options.responseFormat = runtimeOptions.responseFormat;
      // Note: tools are handled separately via resolveFinalTools()
      if (runtimeOptions.additionalChatOptions) {
        Object.assign(options, runtimeOptions.additionalChatOptions);
      }
    }

    return options;
  }

  /**
   * Execute agent with streaming response.
   *
   * Similar to run() but yields AgentRunResponseUpdate objects as they arrive
   * from the chat client. The final update has isFinal: true.
   *
   * After streaming completes, updates thread state just like run().
   *
   * @param messages - Input messages (string, ChatMessage, or ChatMessage[])
   * @param options - Optional run configuration
   * @returns AsyncIterable yielding response updates
   *
   * @example
   * ```typescript
   * // Basic streaming
   * for await (const update of agent.runStream('Tell me a story')) {
   *   process.stdout.write(update.text);
   *   if (update.isFinal) {
   *     console.log('\nDone!');
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // With thread
   * const thread = agent.getNewThread();
   * for await (const update of agent.runStream('Hello', { thread })) {
   *   console.log(update.text);
   * }
   * ```
   */
  async *runStream(
    messages: string | ChatMessage | ChatMessage[],
    options?: ChatRunOptions,
  ): AsyncIterable<AgentRunResponseUpdate> {
    // 1. Normalize messages
    const normalizedMessages = this.normalizeMessages(messages);

    // 2. Get or create thread
    const thread = options?.thread || this.getNewThread();

    // 3. Prepare thread and messages (reuse from run())
    const { preparedMessages, contextTools } = await this.prepareThreadAndMessages(thread, normalizedMessages, options);

    // 4. Resolve final tools (including MCP tools)
    const finalTools = await this.resolveFinalTools(this._tools, options?.tools);

    // 5. Merge tools: resolved tools + context tools
    const allTools = [...finalTools];
    if (contextTools && contextTools.length > 0) {
      allTools.push(...contextTools);
    }

    // 6. Merge chat options with all tools
    const chatOptions = this.mergeChatOptions(options, allTools);

    // 6. Get streaming response from chat client
    const streamingResponse = this._chatClient.completeStream(preparedMessages, chatOptions);

    // Accumulate all updates for thread update after streaming completes
    const allUpdates: AgentRunResponseUpdate[] = [];
    let conversationId: string | undefined;
    let currentResponseId: string | undefined;
    let currentUsage: UsageDetails | undefined;
    let currentMetadata: Record<string, unknown> = {};

    // Track if we've seen the final event
    let hasSeenFinal = false;

    // 6. Yield updates as they arrive
    for await (const event of streamingResponse) {
      if (event.type === 'message_delta') {
        // Extract content from delta
        const delta = event.delta;
        const content = delta.content;
        const role = delta.role || MessageRole.Assistant;

        // Create AgentRunResponseUpdate from delta
        const update = new AgentRunResponseUpdate({
          content,
          role,
          authorName: delta.name,
          responseId: currentResponseId,
          createdAt: delta.timestamp,
          isFinal: false,
        });

        allUpdates.push(update);
        yield update;
      } else if (event.type === 'usage') {
        // Store usage information
        currentUsage = {
          promptTokens: event.usage.promptTokens,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
        };
      } else if (event.type === 'metadata') {
        // Store metadata including conversation ID
        const metadata = event.metadata;
        currentMetadata = { ...metadata };

        // Extract conversation ID if present
        if (metadata.conversationId) {
          conversationId = metadata.conversationId as string;
        }

        // Extract response ID if present
        if (metadata.responseId) {
          currentResponseId = metadata.responseId as string;
        }

        // Mark this as the final update
        hasSeenFinal = true;
      }
    }

    // 7. Yield final update if we have accumulated content
    if (allUpdates.length > 0 && !hasSeenFinal) {
      // Create a final marker update if metadata event didn't arrive
      const finalUpdate = new AgentRunResponseUpdate({
        content: { type: 'text', text: '' },
        role: MessageRole.Assistant,
        responseId: currentResponseId,
        isFinal: true,
        usageDetails: currentUsage,
      });
      allUpdates.push(finalUpdate);
      yield finalUpdate;
    } else if (hasSeenFinal) {
      // Yield final update with metadata
      const finalUpdate = new AgentRunResponseUpdate({
        content: { type: 'text', text: '' },
        role: MessageRole.Assistant,
        responseId: currentResponseId,
        isFinal: true,
        usageDetails: currentUsage,
        additionalProperties: currentMetadata,
      });
      allUpdates.push(finalUpdate);
      yield finalUpdate;
    }

    // 8. After streaming completes, update thread
    thread.updateWithConversationId(conversationId, this._messageStoreFactory);

    // 8a. If thread was just determined as service-managed, notify context providers (only once per thread)
    if (conversationId && thread.threadType === ThreadType.SERVICE_MANAGED && !this._threadsNotified.has(thread)) {
      this._threadsNotified.add(thread);
      await this.notifyContextProvidersThreadCreated(conversationId);
    }

    // 9. Convert updates to complete response for message storage
    const completeResponse = AgentRunResponse.fromUpdates(allUpdates);

    // 10. Store messages in thread
    await thread.onNewMessages([...normalizedMessages, ...completeResponse.messages]);

    // 11. Notify context providers of invocation completion
    await this.notifyContextProvidersInvoked(normalizedMessages, completeResponse.messages);
  }

  /**
   * Convert the ChatAgent instance to a dictionary representation.
   *
   * Overrides SerializationMixin.toDict() to properly handle private fields.
   * Maps private fields (prefixed with _) to their public names for serialization.
   *
   * @param options - Serialization options
   * @returns Dictionary representation of the agent
   *
   * @example
   * ```typescript
   * const dict = agent.toDict();
   * // {
   * //   type: 'chat_agent',
   * //   info: { id: '...', name: 'assistant', ... },
   * //   instructions: 'Be helpful',
   * //   temperature: 0.7,
   * //   ...
   * // }
   * ```
   */
  toDict(options: import('../serialization.js').SerializationOptions = {}): Record<string, unknown> {
    // Get base serialization from parent
    const baseDict = super.toDict(options);

    // Add ChatAgent-specific fields (mapping from private _ fields to public names)
    // These will be automatically excluded if they're in INJECTABLE or DEFAULT_EXCLUDE
    const chatAgentFields: Record<string, unknown> = {
      instructions: this._instructions,
      conversationId: this._conversationId,
      modelId: this._modelId,
      temperature: this._temperature,
      maxTokens: this._maxTokens,
      topP: this._topP,
      frequencyPenalty: this._frequencyPenalty,
      presencePenalty: this._presencePenalty,
      stop: this._stop,
      seed: this._seed,
      store: this._store,
      logitBias: this._logitBias,
      user: this._user,
      metadata: this._metadata,
      toolChoice: this._toolChoice,
      responseFormat: this._responseFormat,
      additionalChatOptions: this._additionalChatOptions,
    };

    // Merge with base, excluding null/undefined if requested
    const { excludeNone = true } = options;
    for (const [key, value] of Object.entries(chatAgentFields)) {
      if (excludeNone && (value === null || value === undefined)) {
        continue;
      }
      baseDict[key] = value;
    }

    return baseDict;
  }

  /**
   * Cleanup method for async disposal.
   *
   * Implements AsyncDisposable to ensure proper cleanup of MCP tool connections
   * and other async resources. This method is called automatically when using
   * `await using` syntax or can be called manually.
   *
   * @returns Promise that resolves when all resources are cleaned up
   *
   * @example
   * ```typescript
   * // Using await using syntax (automatic disposal)
   * await using agent = new ChatAgent({ ... });
   * await agent.run('Hello');
   * // agent automatically disposed here
   * ```
   *
   * @example
   * ```typescript
   * // Manual disposal
   * const agent = new ChatAgent({ ... });
   * try {
   *   await agent.run('Hello');
   * } finally {
   *   await agent[Symbol.asyncDispose]();
   * }
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this._asyncExitStack.aclose();
  }
}
