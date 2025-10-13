/**
 * AsyncExitStack - Async Context Manager Utility
 *
 * Manages multiple async context managers (AsyncDisposable objects) in a stack,
 * ensuring proper cleanup in reverse order. Similar to Python's contextlib.AsyncExitStack.
 *
 * @module utils/async-exit-stack
 */

/**
 * Async exit stack for managing multiple async disposable resources.
 *
 * This class helps manage the lifecycle of multiple async resources,
 * ensuring they are all properly disposed in reverse order when cleanup occurs.
 * It's particularly useful for managing MCP tool connections that need cleanup.
 *
 * @example
 * ```typescript
 * const stack = new AsyncExitStack();
 *
 * try {
 *   // Add multiple async disposables
 *   const tool1 = await stack.enterAsyncContext(mcpTool1);
 *   const tool2 = await stack.enterAsyncContext(mcpTool2);
 *
 *   // Use the tools...
 *   await doSomething(tool1, tool2);
 * } finally {
 *   // Clean up all resources in reverse order
 *   await stack.aclose();
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Use with Symbol.asyncDispose
 * class MyAgent {
 *   private stack = new AsyncExitStack();
 *
 *   async addTool(tool: AsyncDisposable): Promise<void> {
 *     await this.stack.enterAsyncContext(tool);
 *   }
 *
 *   async [Symbol.asyncDispose](): Promise<void> {
 *     await this.stack.aclose();
 *   }
 * }
 * ```
 */
export class AsyncExitStack implements AsyncDisposable {
  private readonly stack: AsyncDisposable[] = [];
  private isClosed = false;

  /**
   * Enter an async context manager and add it to the exit stack.
   *
   * The context manager's Symbol.asyncDispose method will be called
   * when the stack is closed, in reverse order of entry.
   *
   * @param contextManager - An AsyncDisposable object to manage
   * @returns The context manager (for convenience)
   *
   * @example
   * ```typescript
   * const stack = new AsyncExitStack();
   * const tool = await stack.enterAsyncContext(mcpTool);
   * // tool is now tracked by the stack
   * ```
   */
  async enterAsyncContext<T extends AsyncDisposable>(contextManager: T): Promise<T> {
    if (this.isClosed) {
      throw new Error('AsyncExitStack is already closed');
    }

    this.stack.push(contextManager);
    return contextManager;
  }

  /**
   * Close all context managers in reverse order.
   *
   * Calls Symbol.asyncDispose on each registered context manager
   * in LIFO (last-in-first-out) order. Errors during disposal are
   * collected and the first error is re-thrown after all cleanup
   * attempts complete.
   *
   * @throws {Error} The first error encountered during cleanup (after all cleanup attempts)
   *
   * @example
   * ```typescript
   * const stack = new AsyncExitStack();
   * await stack.enterAsyncContext(tool1);
   * await stack.enterAsyncContext(tool2);
   *
   * // Clean up (tool2 disposed first, then tool1)
   * await stack.aclose();
   * ```
   */
  async aclose(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    const errors: Error[] = [];

    // Dispose in reverse order (LIFO)
    while (this.stack.length > 0) {
      const contextManager = this.stack.pop()!;
      try {
        await contextManager[Symbol.asyncDispose]();
      } catch (error) {
        // Collect errors but continue cleanup
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // If there were any errors, throw the first one
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  /**
   * Implement AsyncDisposable interface.
   *
   * This allows AsyncExitStack itself to be used with `await using` syntax.
   *
   * @example
   * ```typescript
   * await using stack = new AsyncExitStack();
   * await stack.enterAsyncContext(tool);
   * // stack automatically disposed at end of block
   * ```
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.aclose();
  }

  /**
   * Get the number of context managers currently in the stack.
   *
   * @returns The count of managed resources
   *
   * @example
   * ```typescript
   * const stack = new AsyncExitStack();
   * console.log(stack.size); // 0
   * await stack.enterAsyncContext(tool);
   * console.log(stack.size); // 1
   * ```
   */
  get size(): number {
    return this.stack.length;
  }

  /**
   * Check if the stack has been closed.
   *
   * @returns True if aclose() has been called
   */
  get closed(): boolean {
    return this.isClosed;
  }
}
