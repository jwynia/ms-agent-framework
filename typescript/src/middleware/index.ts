/**
 * Middleware module for the Microsoft Agent Framework.
 *
 * This module provides types and interfaces for creating middleware that can
 * intercept and modify agent execution, function calls, and other framework
 * operations.
 *
 * ## Key Concepts
 *
 * **Middleware Pattern**: Middleware follows a chain-of-responsibility pattern
 * where each middleware receives a context object and a `next()` function. It can:
 * - Modify the context before calling `next()`
 * - Perform side effects (logging, metrics, etc.)
 * - Call `next()` to pass control to the next middleware
 * - Perform actions after `next()` returns
 * - Short-circuit execution by not calling `next()`
 *
 * **Context Types**: Different types of middleware operate on different contexts:
 * - {@link AgentContext} - For agent execution middleware
 * - {@link FunctionContext} - For tool/function execution middleware
 * - Custom contexts via generic {@link Middleware} interface
 *
 * ## Example Usage
 *
 * ```typescript
 * import { AgentMiddleware, AgentContext } from '@microsoft/agent-framework-ts';
 *
 * // Simple logging middleware
 * const logger: AgentMiddleware = async (context, next) => {
 *   console.log(`Invoking ${context.agent.info.name}`);
 *   await next();
 *   console.log('Invocation complete');
 * };
 *
 * // Middleware that modifies messages
 * const systemPromptInjector: AgentMiddleware = async (context, next) => {
 *   context.messages.unshift(
 *     createSystemMessage('You are a helpful assistant')
 *   );
 *   await next();
 * };
 *
 * // Middleware with timing
 * const timer: AgentMiddleware = async (context, next) => {
 *   const start = Date.now();
 *   await next();
 *   const duration = Date.now() - start;
 *   console.log(`Execution took ${duration}ms`);
 * };
 * ```
 *
 * @module middleware
 */

export type {
  Middleware,
  AgentMiddleware,
  FunctionMiddleware,
  FunctionMiddlewareInterface,
  AgentContext,
  FunctionContext,
  FunctionInvokingContext,
  FunctionInvokedContext,
  NextFunction,
} from './types.js';

export { wrapWithMiddleware, wrapStreamWithMiddleware, applyMiddleware } from './decorators.js';

export {
  FunctionMiddlewarePipeline,
  LoggingFunctionMiddleware,
  CachingFunctionMiddleware,
  TimingFunctionMiddleware,
  RateLimitingFunctionMiddleware,
} from './function-middleware.js';

export type {
  FunctionInvokingContext as FunctionInvokingContextWithTool,
  FunctionInvokedContext as FunctionInvokedContextWithTool,
} from './function-middleware.js';
