/**
 * Lifecycle Hooks for Agent Execution
 *
 * This module defines lifecycle hook interfaces that allow components like context providers
 * and middleware to react to key agent execution events. These hooks enable extensible
 * behavior for logging, metrics, context injection, and other cross-cutting concerns.
 *
 * @module lifecycle
 */

import type { ChatMessage } from './types/chat-message.js';
import type { AgentProtocol } from './agents/base-agent.js';
import type { AgentThread } from './agents/agent-thread.js';
import type { AISettings } from './types/agent-info.js';

/**
 * Context information provided when an agent is about to be invoked.
 *
 * Contains all relevant execution context including the agent being invoked,
 * input messages, execution options, and a timestamp of the invocation.
 *
 * @example
 * ```typescript
 * const context: AgentInvocationContext = {
 *   agent: myAgent,
 *   messages: [createUserMessage('Hello')],
 *   options: { temperature: 0.7 },
 *   timestamp: new Date(),
 * };
 * ```
 */
export interface AgentInvocationContext {
  /**
   * The agent being invoked.
   * Provides access to agent metadata, configuration, and tools.
   */
  agent: AgentProtocol;

  /**
   * The input messages being sent to the agent.
   * These messages will be processed by the LLM.
   */
  messages: ChatMessage[];

  /**
   * Optional AI settings for this invocation.
   * May include temperature, max tokens, tool choice, etc.
   */
  options?: AISettings;

  /**
   * Timestamp when the invocation started.
   * Useful for tracking execution time and logging.
   */
  timestamp: Date;
}

/**
 * Response information provided after an agent invocation completes.
 *
 * Contains the assistant's response message returned by the LLM.
 * This is the complete message after any streaming has finished.
 *
 * @example
 * ```typescript
 * const response: AgentRunResponse = {
 *   role: 'assistant',
 *   content: { type: 'text', text: 'Hello! How can I help you?' },
 *   timestamp: new Date(),
 * };
 * ```
 */
export type AgentRunResponse = ChatMessage;

/**
 * Lifecycle hooks that can be implemented by context providers and other agent components.
 *
 * These hooks allow components to react to agent execution events:
 * - `invoking()`: Called before agent execution begins
 * - `invoked()`: Called after agent execution completes
 * - `threadCreated()`: Called when a new conversation thread is created
 *
 * All hooks are optional and can be either synchronous or asynchronous.
 * Components can implement any subset of these hooks based on their needs.
 *
 * @note All lifecycle methods are optional. Implement only the hooks you need.
 *
 * @example
 * ```typescript
 * import { LifecycleHooks, AgentInvocationContext, AgentRunResponse } from '@microsoft/agent-framework-ts';
 *
 * class LoggingProvider implements LifecycleHooks {
 *   async invoking(context: AgentInvocationContext): Promise<void> {
 *     console.log(`Agent ${context.agent.info.name} is executing with ${context.messages.length} messages`);
 *     console.log(`Timestamp: ${context.timestamp.toISOString()}`);
 *   }
 *
 *   async invoked(context: AgentInvocationContext, response: AgentRunResponse): Promise<void> {
 *     console.log(`Agent responded with: ${getTextContent(response)}`);
 *   }
 *
 *   async threadCreated(thread: AgentThread): Promise<void> {
 *     console.log(`New thread created: ${thread.threadId}`);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Synchronous implementation example
 * class MetricsProvider implements LifecycleHooks {
 *   private invocationCount = 0;
 *
 *   invoking(context: AgentInvocationContext): void {
 *     this.invocationCount++;
 *     console.log(`Invocation #${this.invocationCount}`);
 *   }
 *
 *   invoked(context: AgentInvocationContext, response: AgentRunResponse): void {
 *     console.log(`Total invocations: ${this.invocationCount}`);
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Partial implementation - only implement needed hooks
 * class ThreadTracker implements LifecycleHooks {
 *   private threads = new Set<string>();
 *
 *   async threadCreated(thread: AgentThread): Promise<void> {
 *     this.threads.add(thread.threadId);
 *     console.log(`Tracking ${this.threads.size} threads`);
 *   }
 *
 *   // Not implementing invoking() or invoked() - that's fine!
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Context provider with lifecycle hooks
 * import { ContextProvider, AIContext } from '@microsoft/agent-framework-ts';
 *
 * class CustomContextProvider extends ContextProvider implements LifecycleHooks {
 *   async invoking(context: AgentInvocationContext): Promise<void> {
 *     console.log('About to invoke agent');
 *     // Perform pre-invocation setup
 *   }
 *
 *   async invoked(context: AgentInvocationContext, response: AgentRunResponse): Promise<void> {
 *     console.log('Agent invocation complete');
 *     // Perform post-invocation cleanup or tracking
 *   }
 *
 *   async threadCreated(thread: AgentThread): Promise<void> {
 *     console.log('Thread created for context tracking');
 *     // Initialize thread-specific context
 *   }
 * }
 * ```
 */
export interface LifecycleHooks {
  /**
   * Called just before the agent is invoked.
   *
   * This hook is called before the agent processes messages and sends them to the LLM.
   * Use this for:
   * - Logging invocation details
   * - Recording metrics/telemetry
   * - Validating execution context
   * - Pre-execution setup
   *
   * The hook can be synchronous or asynchronous. Errors thrown will be caught
   * by the agent and logged as warnings without failing the execution.
   *
   * @param context - Execution context including agent, messages, options, and timestamp
   * @returns Promise<void> for async implementations, void for sync
   *
   * @example
   * ```typescript
   * async invoking(context: AgentInvocationContext): Promise<void> {
   *   console.log(`Invoking ${context.agent.info.name}`);
   *   console.log(`Messages: ${context.messages.length}`);
   *   if (context.options?.temperature) {
   *     console.log(`Temperature: ${context.options.temperature}`);
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Synchronous version
   * invoking(context: AgentInvocationContext): void {
   *   this.metricsService.recordInvocation(context.agent.info.id);
   * }
   * ```
   */
  invoking?(context: AgentInvocationContext): Promise<void> | void;

  /**
   * Called after the agent has completed execution and received a response.
   *
   * This hook is called after the LLM returns a response (or after a stream completes).
   * Use this for:
   * - Logging responses
   * - Recording execution metrics
   * - Storing conversation history
   * - Post-processing responses
   * - Error tracking
   *
   * The hook can be synchronous or asynchronous. Errors thrown will be caught
   * by the agent and logged as warnings without affecting the response.
   *
   * @param context - Original execution context (same as passed to invoking())
   * @param response - The complete response message from the LLM
   * @returns Promise<void> for async implementations, void for sync
   *
   * @example
   * ```typescript
   * async invoked(
   *   context: AgentInvocationContext,
   *   response: AgentRunResponse
   * ): Promise<void> {
   *   const responseText = getTextContent(response);
   *   console.log(`Response: ${responseText.substring(0, 100)}...`);
   *
   *   // Store for analytics
   *   await this.analytics.recordResponse({
   *     agentId: context.agent.info.id,
   *     messageCount: context.messages.length,
   *     responseLength: responseText.length,
   *   });
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Synchronous version
   * invoked(context: AgentInvocationContext, response: AgentRunResponse): void {
   *   const duration = Date.now() - context.timestamp.getTime();
   *   console.log(`Execution took ${duration}ms`);
   * }
   * ```
   */
  invoked?(context: AgentInvocationContext, response: AgentRunResponse): Promise<void> | void;

  /**
   * Called when a new conversation thread is created.
   *
   * This hook is called immediately after an AgentThread is initialized.
   * Use this for:
   * - Initializing thread-specific state
   * - Loading historical context
   * - Setting up thread tracking
   * - Thread-level logging
   *
   * The hook can be synchronous or asynchronous. Errors thrown will be caught
   * and logged as warnings without failing thread creation.
   *
   * @param thread - The newly created AgentThread instance
   * @returns Promise<void> for async implementations, void for sync
   *
   * @example
   * ```typescript
   * async threadCreated(thread: AgentThread): Promise<void> {
   *   console.log(`New thread: ${thread.threadId}`);
   *   console.log(`Service-managed: ${thread.isServiceManaged}`);
   *   console.log(`Local-managed: ${thread.isLocalManaged}`);
   *
   *   // Load thread-specific context from database
   *   if (thread.serviceThreadId) {
   *     await this.loadContextForThread(thread.serviceThreadId);
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Synchronous version
   * threadCreated(thread: AgentThread): void {
   *   this.threadRegistry.register(thread.threadId);
   * }
   * ```
   */
  threadCreated?(thread: AgentThread): Promise<void> | void;
}

/**
 * Utility type for providers that support lifecycle hooks.
 *
 * This type can be used to check if a component implements lifecycle hooks,
 * allowing for type-safe access to the hooks property.
 *
 * @example
 * ```typescript
 * function isLifecycleProvider(obj: unknown): obj is LifecycleProvider {
 *   return obj !== null && typeof obj === 'object' && 'hooks' in obj;
 * }
 *
 * if (isLifecycleProvider(provider)) {
 *   await provider.hooks?.invoking?.(context);
 * }
 * ```
 *
 * @example
 * ```typescript
 * class MyProvider implements LifecycleProvider {
 *   readonly hooks: LifecycleHooks = {
 *     async invoking(context) {
 *       console.log('Invoking');
 *     },
 *     async invoked(context, response) {
 *       console.log('Invoked');
 *     },
 *   };
 * }
 * ```
 */
export interface LifecycleProvider {
  /**
   * Optional lifecycle hooks for this provider.
   * If present, hooks will be called at appropriate lifecycle events.
   */
  readonly hooks?: LifecycleHooks;
}

/**
 * Type guard to check if an object implements LifecycleHooks.
 *
 * This is useful for runtime checks when you want to conditionally
 * invoke lifecycle hooks on components that may or may not implement them.
 *
 * @param obj - Object to check
 * @returns True if the object has any lifecycle hook methods
 *
 * @example
 * ```typescript
 * const provider = getProvider();
 * if (hasLifecycleHooks(provider)) {
 *   await provider.invoking?.(context);
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use with arrays of providers
 * const providers: unknown[] = [provider1, provider2, provider3];
 * const lifecycleProviders = providers.filter(hasLifecycleHooks);
 *
 * // Call hooks on all providers
 * for (const provider of lifecycleProviders) {
 *   await provider.invoking?.(context);
 * }
 * ```
 */
export function hasLifecycleHooks(obj: unknown): obj is LifecycleHooks {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const hooks = obj as Partial<LifecycleHooks>;
  return (
    typeof hooks.invoking === 'function' ||
    typeof hooks.invoked === 'function' ||
    typeof hooks.threadCreated === 'function'
  );
}

/**
 * Type guard to check if an object implements LifecycleProvider.
 *
 * This is useful for checking if a component provides lifecycle hooks
 * through a `hooks` property.
 *
 * @param obj - Object to check
 * @returns True if the object has a hooks property with lifecycle methods
 *
 * @example
 * ```typescript
 * const provider = getProvider();
 * if (isLifecycleProvider(provider)) {
 *   await provider.hooks?.invoking?.(context);
 * }
 * ```
 */
export function isLifecycleProvider(obj: unknown): obj is LifecycleProvider {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const provider = obj as Partial<LifecycleProvider>;
  return provider.hooks !== undefined && hasLifecycleHooks(provider.hooks);
}
