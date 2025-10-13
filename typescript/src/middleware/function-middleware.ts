/**
 * Function Middleware Pipeline
 *
 * Middleware system specifically for tool/function invocations, enabling interception,
 * modification, and monitoring of tool calls before and after execution.
 *
 * This module implements middleware chains for function execution with:
 * - Pre-execution middleware (invoking phase) in FIFO order
 * - Post-execution middleware (invoked phase) in LIFO order
 * - Context modification and early termination support
 * - Example implementations for common use cases
 *
 * @module middleware/function-middleware
 */

import type { AITool } from '../core/tools/base-tool.js';
import type {
  FunctionMiddlewareInterface,
  FunctionInvokingContext as BaseFunctionInvokingContext,
  FunctionInvokedContext as BaseFunctionInvokedContext,
} from './types.js';

/**
 * Context passed to function middleware during the invoking phase.
 *
 * Extends the base context with AITool type for the function.
 */
export interface FunctionInvokingContext extends Omit<BaseFunctionInvokingContext, 'function'> {
  /**
   * The function/tool being invoked.
   * This is readonly to prevent middleware from swapping the function.
   */
  readonly function: AITool;
}

/**
 * Context passed to function middleware during the invoked phase.
 *
 * Extends the base context with AITool type for the function.
 */
export interface FunctionInvokedContext extends Omit<BaseFunctionInvokedContext, 'function'> {
  /**
   * The function/tool being invoked.
   * This is readonly to prevent middleware from swapping the function.
   */
  readonly function: AITool;
}

/**
 * Middleware pipeline for function execution.
 *
 * Executes middleware in a specific order:
 * - Invoking phase: FIFO order (first middleware first)
 * - Invoked phase: LIFO order (last middleware first)
 *
 * This ensures that middleware wraps the execution like nested function calls:
 * mw1.invoking -> mw2.invoking -> execute -> mw2.invoked -> mw1.invoked
 *
 * @example
 * ```typescript
 * const pipeline = new FunctionMiddlewarePipeline([
 *   new LoggingFunctionMiddleware(),
 *   new CachingFunctionMiddleware()
 * ]);
 *
 * const result = await pipeline.execute(
 *   myTool,
 *   { input: 'test' },
 *   {},
 *   async (context) => {
 *     return await context.function.execute(context.arguments);
 *   }
 * );
 * ```
 */
export class FunctionMiddlewarePipeline {
  /**
   * Array of middleware in the pipeline.
   * Middleware is executed in order for invoking phase,
   * and reverse order for invoked phase.
   */
  private readonly middleware: FunctionMiddlewareInterface[];

  /**
   * Create a new function middleware pipeline.
   *
   * @param middleware - Array of middleware to include in the pipeline
   *
   * @example
   * ```typescript
   * const pipeline = new FunctionMiddlewarePipeline([
   *   new LoggingFunctionMiddleware(),
   *   new TimingFunctionMiddleware()
   * ]);
   * ```
   */
  constructor(middleware: FunctionMiddlewareInterface[]) {
    this.middleware = middleware;
  }

  /**
   * Execute the middleware pipeline around a function invocation.
   *
   * This method coordinates the execution of all middleware and the final handler:
   * 1. Calls onFunctionInvoking() on each middleware in FIFO order
   * 2. If any middleware returns 'skip', short-circuits and uses context.result
   * 3. Calls the final handler to execute the function
   * 4. Calls onFunctionInvoked() on each middleware in LIFO order
   * 5. Returns the final result
   *
   * @param func - The function/tool being invoked
   * @param args - Arguments for the function
   * @param kwargs - Additional keyword arguments
   * @param finalHandler - Handler that executes the actual function
   * @returns The function result after processing through all middleware
   *
   * @example
   * ```typescript
   * const result = await pipeline.execute(
   *   weatherTool,
   *   { location: 'Seattle' },
   *   {},
   *   async (context) => {
   *     return await context.function.execute(context.arguments);
   *   }
   * );
   * ```
   */
  async execute(
    func: AITool,
    args: Record<string, unknown>,
    kwargs: Record<string, unknown>,
    finalHandler: (context: FunctionInvokingContext) => Promise<unknown>,
  ): Promise<unknown> {
    // Create the context
    const context: FunctionInvokingContext = {
      function: func,
      arguments: args,
      kwargs,
      metadata: {},
    };

    // Invoking phase (FIFO order)
    let skipped = false;
    for (const mw of this.middleware) {
      if (mw.onFunctionInvoking) {
        const result = await mw.onFunctionInvoking(context as unknown as BaseFunctionInvokingContext);
        if (result === 'skip') {
          // Short-circuit execution
          skipped = true;
          break;
        }
      }
    }

    // Execute the function if not skipped
    let result: unknown;
    let error: Error | undefined;

    if (!skipped) {
      try {
        result = await finalHandler(context);
      } catch (err) {
        error = err as Error;
      }
    } else {
      // If skipped, use the result set by middleware
      result = context.result;
    }

    // Create invoked context with result or error
    const invokedContext: FunctionInvokedContext = {
      ...context,
      result,
      error,
    };

    // Invoked phase (LIFO order - reverse of middleware array)
    for (const mw of [...this.middleware].reverse()) {
      if (mw.onFunctionInvoked) {
        await mw.onFunctionInvoked(invokedContext as unknown as BaseFunctionInvokedContext);
      }
    }

    // If there was an error, throw it
    if (error) {
      throw error;
    }

    // Return the final result (may have been modified by middleware)
    return invokedContext.result;
  }

  /**
   * Check if the pipeline has any middleware.
   *
   * @returns True if middleware array is not empty
   */
  get hasMiddleware(): boolean {
    return this.middleware.length > 0;
  }

  /**
   * Get the number of middleware in the pipeline.
   *
   * @returns The count of middleware
   */
  get count(): number {
    return this.middleware.length;
  }
}

/**
 * Logging middleware implementation.
 *
 * Logs function invocations before and after execution, including arguments,
 * results, and errors. Useful for debugging and monitoring.
 *
 * @example
 * ```typescript
 * const pipeline = new FunctionMiddlewarePipeline([
 *   new LoggingFunctionMiddleware()
 * ]);
 *
 * // Logs:
 * // Calling function: get_weather
 * // Arguments: { "location": "Seattle" }
 * // Function get_weather succeeded
 * // Result: { "temp": 72 }
 * ```
 */
export class LoggingFunctionMiddleware implements FunctionMiddlewareInterface {
  async onFunctionInvoking(context: BaseFunctionInvokingContext): Promise<void> {
    console.log(`Calling function: ${context.function.name}`);
    console.log(`Arguments:`, JSON.stringify(context.arguments, null, 2));
  }

  async onFunctionInvoked(context: BaseFunctionInvokedContext): Promise<void> {
    if (context.error) {
      console.error(`Function ${context.function.name} failed:`, context.error.message);
    } else {
      console.log(`Function ${context.function.name} succeeded`);
      console.log(`Result:`, JSON.stringify(context.result, null, 2));
    }
  }
}

/**
 * Caching middleware implementation.
 *
 * Caches function results by arguments to avoid redundant executions.
 * When a cached result is found, execution is short-circuited.
 *
 * @example
 * ```typescript
 * const cache = new CachingFunctionMiddleware();
 * const pipeline = new FunctionMiddlewarePipeline([cache]);
 *
 * // First call executes the function
 * await pipeline.execute(...);
 *
 * // Second call with same args returns cached result
 * await pipeline.execute(...); // Uses cache
 * ```
 */
export class CachingFunctionMiddleware implements FunctionMiddlewareInterface {
  private cache = new Map<string, unknown>();

  async onFunctionInvoking(context: BaseFunctionInvokingContext): Promise<void | 'skip'> {
    const cacheKey = this.getCacheKey(context.function.name, context.arguments);

    if (this.cache.has(cacheKey)) {
      context.metadata.cached = true;
      context.result = this.cache.get(cacheKey);
      return 'skip'; // Skip execution, use cached result
    }
  }

  async onFunctionInvoked(context: BaseFunctionInvokedContext): Promise<void> {
    // Only cache successful results that weren't already cached
    if (!context.metadata.cached && !context.error && context.result !== undefined) {
      const cacheKey = this.getCacheKey(context.function.name, context.arguments);
      this.cache.set(cacheKey, context.result);
    }
  }

  /**
   * Generate a cache key from function name and arguments.
   *
   * @param name - Function name
   * @param args - Function arguments
   * @returns Cache key string
   */
  private getCacheKey(name: string, args: Record<string, unknown>): string {
    return `${name}:${JSON.stringify(args)}`;
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current cache size.
   *
   * @returns Number of cached entries
   */
  get size(): number {
    return this.cache.size;
  }
}

/**
 * Timing middleware implementation.
 *
 * Measures and logs the execution time of functions. Stores timing
 * information in metadata for other middleware to access.
 *
 * @example
 * ```typescript
 * const pipeline = new FunctionMiddlewarePipeline([
 *   new TimingFunctionMiddleware()
 * ]);
 *
 * await pipeline.execute(...);
 * // Logs: Function get_weather took 234ms
 * ```
 */
export class TimingFunctionMiddleware implements FunctionMiddlewareInterface {
  async onFunctionInvoking(context: BaseFunctionInvokingContext): Promise<void> {
    context.metadata.startTime = Date.now();
  }

  async onFunctionInvoked(context: BaseFunctionInvokedContext): Promise<void> {
    const startTime = context.metadata.startTime as number;
    const duration = Date.now() - startTime;
    context.metadata.duration = duration;
    console.log(`Function ${context.function.name} took ${duration}ms`);
  }
}

/**
 * Rate limiting middleware implementation.
 *
 * Limits the rate at which functions can be called. Useful for
 * protecting against excessive API calls or resource usage.
 *
 * @example
 * ```typescript
 * // Allow max 10 calls per minute
 * const rateLimiter = new RateLimitingFunctionMiddleware(10, 60000);
 * const pipeline = new FunctionMiddlewarePipeline([rateLimiter]);
 *
 * // Throws error if rate limit exceeded
 * await pipeline.execute(...);
 * ```
 */
export class RateLimitingFunctionMiddleware implements FunctionMiddlewareInterface {
  private callTimes: Map<string, number[]> = new Map();

  /**
   * Create a new rate limiting middleware.
   *
   * @param maxCalls - Maximum number of calls allowed
   * @param windowMs - Time window in milliseconds
   *
   * @example
   * ```typescript
   * // 10 calls per minute
   * const limiter = new RateLimitingFunctionMiddleware(10, 60000);
   * ```
   */
  constructor(
    private readonly maxCalls: number,
    private readonly windowMs: number,
  ) {}

  async onFunctionInvoking(context: BaseFunctionInvokingContext): Promise<void> {
    const functionName = context.function.name;
    const now = Date.now();

    // Get or create call times array for this function
    let times = this.callTimes.get(functionName);
    if (!times) {
      times = [];
      this.callTimes.set(functionName, times);
    }

    // Remove calls outside the window
    const cutoff = now - this.windowMs;
    const validTimes = times.filter((t) => t > cutoff);
    this.callTimes.set(functionName, validTimes);

    // Check if rate limit exceeded
    if (validTimes.length >= this.maxCalls) {
      throw new Error(
        `Rate limit exceeded for function ${functionName}: ${this.maxCalls} calls per ${this.windowMs}ms`,
      );
    }

    // Record this call
    validTimes.push(now);
  }

  /**
   * Clear all rate limiting state.
   */
  clear(): void {
    this.callTimes.clear();
  }
}
