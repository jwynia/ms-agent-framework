/**
 * Middleware type definitions for the Microsoft Agent Framework.
 *
 * This module defines interfaces and types for middleware that can intercept
 * and modify agent execution, function calls, and other framework operations.
 *
 * Middleware follows a chain-of-responsibility pattern where each middleware
 * can:
 * - Modify the context before passing to the next middleware
 * - Perform side effects (logging, metrics, etc.)
 * - Short-circuit execution by not calling next()
 * - Observe results after calling next()
 *
 * @module middleware/types
 */

import type { AgentProtocol } from '../core/agents/base-agent.js';
import type { ChatMessage } from '../core/types/chat-message.js';
import type { AISettings } from '../core/types/agent-info.js';

/**
 * Next function type for middleware chains.
 *
 * Middleware calls this function to pass control to the next middleware
 * in the chain or to the final handler if this is the last middleware.
 *
 * @example
 * ```typescript
 * const middleware: Middleware<AgentContext> = async (context, next) => {
 *   console.log('Before execution');
 *   await next(); // Pass control to next middleware
 *   console.log('After execution');
 * };
 * ```
 */
export type NextFunction = () => Promise<void>;

/**
 * Context passed to agent middleware during execution.
 *
 * This context contains all information about the agent invocation and can be
 * modified by middleware. Changes to mutable properties (like messages) will
 * affect subsequent middleware and the final execution.
 *
 * @example
 * ```typescript
 * const loggingMiddleware: AgentMiddleware = async (context, next) => {
 *   console.log(`Agent: ${context.agent.info.name}`);
 *   console.log(`Messages: ${context.messages.length}`);
 *
 *   // Store timing metadata
 *   context.metadata.startTime = Date.now();
 *
 *   await next();
 *
 *   // Access metadata after execution
 *   const duration = Date.now() - (context.metadata.startTime as number);
 *   console.log(`Execution took ${duration}ms`);
 * };
 * ```
 */
export interface AgentContext {
  /**
   * The agent being executed.
   *
   * This is readonly to prevent middleware from swapping the agent instance.
   */
  readonly agent: AgentProtocol;

  /**
   * Messages being sent to the agent.
   *
   * Middleware can modify this array to add, remove, or transform messages
   * before they reach the agent.
   */
  messages: ChatMessage[];

  /**
   * Optional execution options.
   *
   * These are AI settings like temperature, maxTokens, etc. that can be
   * modified by middleware.
   */
  options?: AISettings;

  /**
   * Custom metadata for middleware communication.
   *
   * Middleware can use this to share data with other middleware in the chain.
   * Keys are arbitrary strings, values can be any type.
   *
   * This is readonly (the reference), but properties can be added/modified.
   */
  readonly metadata: Record<string, unknown>;
}

/**
 * Context passed to function middleware during tool execution.
 *
 * This context contains all information about a function/tool invocation and
 * can be modified by middleware.
 *
 * @example
 * ```typescript
 * const validationMiddleware: FunctionMiddleware = async (context, next) => {
 *   console.log(`Function: ${context.functionName}`);
 *   console.log(`Args:`, context.args);
 *
 *   // Validate arguments
 *   if (!validateArgs(context.args)) {
 *     throw new Error('Invalid arguments');
 *   }
 *
 *   await next();
 * };
 * ```
 */
export interface FunctionContext {
  /**
   * The name of the function being invoked.
   *
   * This is readonly to prevent middleware from changing the function target.
   */
  readonly functionName: string;

  /**
   * Arguments for the function call.
   *
   * Middleware can modify this object to transform arguments before execution.
   */
  args: Record<string, unknown>;

  /**
   * The agent that owns this function.
   *
   * This is readonly to prevent middleware from swapping the agent instance.
   */
  readonly agent: AgentProtocol;

  /**
   * Custom metadata for middleware communication.
   *
   * Middleware can use this to share data with other middleware in the chain.
   * Keys are arbitrary strings, values can be any type.
   *
   * This is readonly (the reference), but properties can be added/modified.
   */
  readonly metadata: Record<string, unknown>;
}

/**
 * Generic middleware interface.
 *
 * Middleware is a function that receives a context object and a next function.
 * It can perform operations before calling next(), after calling next(), or both.
 * Middleware can also choose not to call next() to short-circuit execution.
 *
 * @typeParam TContext - The type of context this middleware operates on
 *
 * @example
 * ```typescript
 * // Simple logging middleware
 * const logger: Middleware<AgentContext> = async (context, next) => {
 *   console.log('Before');
 *   await next();
 *   console.log('After');
 * };
 *
 * // Middleware that modifies context
 * const addSystemMessage: Middleware<AgentContext> = async (context, next) => {
 *   context.messages.unshift(createSystemMessage('You are a helpful assistant'));
 *   await next();
 * };
 *
 * // Middleware that short-circuits
 * const cache: Middleware<AgentContext> = async (context, next) => {
 *   const cached = cache.get(context.messages);
 *   if (cached) {
 *     // Don't call next(), execution stops here
 *     return;
 *   }
 *   await next();
 *   cache.set(context.messages, result);
 * };
 * ```
 */
export interface Middleware<TContext = AgentContext> {
  /**
   * Process the context and optionally pass control to the next middleware.
   *
   * @param context - The context object for this execution
   * @param next - Function to call the next middleware in the chain
   */
  (context: TContext, next: NextFunction): Promise<void>;
}

/**
 * Convenience type for agent-specific middleware.
 *
 * This is equivalent to `Middleware<AgentContext>` but provides better type
 * inference and documentation.
 *
 * @example
 * ```typescript
 * const retryMiddleware: AgentMiddleware = async (context, next) => {
 *   let attempts = 0;
 *   const maxAttempts = 3;
 *
 *   while (attempts < maxAttempts) {
 *     try {
 *       await next();
 *       break; // Success
 *     } catch (error) {
 *       attempts++;
 *       if (attempts >= maxAttempts) throw error;
 *       console.log(`Retry ${attempts}/${maxAttempts}`);
 *     }
 *   }
 * };
 * ```
 */
export type AgentMiddleware = Middleware<AgentContext>;

/**
 * Convenience type for function-specific middleware.
 *
 * This is equivalent to `Middleware<FunctionContext>` but provides better type
 * inference and documentation.
 *
 * @example
 * ```typescript
 * const timingMiddleware: FunctionMiddleware = async (context, next) => {
 *   const start = Date.now();
 *   await next();
 *   const duration = Date.now() - start;
 *   console.log(`${context.functionName} took ${duration}ms`);
 * };
 * ```
 */
export type FunctionMiddleware = Middleware<FunctionContext>;
