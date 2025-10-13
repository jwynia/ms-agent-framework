/**
 * Tests for Function Middleware Pipeline
 *
 * Comprehensive test suite for function middleware system including:
 * - Pipeline execution order (FIFO invoking, LIFO invoked)
 * - Context modification
 * - Early termination
 * - Example middleware implementations
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FunctionMiddlewarePipeline,
  LoggingFunctionMiddleware,
  CachingFunctionMiddleware,
  TimingFunctionMiddleware,
  RateLimitingFunctionMiddleware,
} from '../function-middleware.js';
import type { FunctionMiddlewareInterface, FunctionInvokingContext, FunctionInvokedContext } from '../types.js';
import type { AITool } from '../../core/tools/base-tool.js';
import { z } from 'zod';

// Mock tool for testing
function createMockTool(name: string, executeImpl?: (args: unknown) => Promise<unknown>): AITool {
  return {
    name,
    description: `Mock tool ${name}`,
    schema: z.object({ input: z.string() }),
    execute: executeImpl || (async (args: unknown) => ({ result: `executed ${name}`, args })),
    metadata: {},
  };
}

describe('FunctionMiddlewarePipeline', () => {
  describe('Basic Functionality', () => {
    it('should create pipeline with empty middleware array', () => {
      const pipeline = new FunctionMiddlewarePipeline([]);
      expect(pipeline.hasMiddleware).toBe(false);
      expect(pipeline.count).toBe(0);
    });

    it('should create pipeline with middleware', () => {
      const middleware: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {},
      };
      const pipeline = new FunctionMiddlewarePipeline([middleware]);
      expect(pipeline.hasMiddleware).toBe(true);
      expect(pipeline.count).toBe(1);
    });

    it('should execute function without middleware', async () => {
      const pipeline = new FunctionMiddlewarePipeline([]);
      const tool = createMockTool('test');
      const args = { input: 'hello' };

      const result = await pipeline.execute(tool, args, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      expect(result).toEqual({ result: 'executed test', args });
    });
  });

  describe('Execution Order', () => {
    it('should call onFunctionInvoking in FIFO order', async () => {
      const order: string[] = [];

      const mw1: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw1-invoking');
        },
      };

      const mw2: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw2-invoking');
        },
      };

      const mw3: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw3-invoking');
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw1, mw2, mw3]);
      const tool = createMockTool('test');

      await pipeline.execute(tool, { input: 'test' }, {}, async (context) => {
        order.push('execute');
        return await context.function.execute(context.arguments);
      });

      expect(order).toEqual(['mw1-invoking', 'mw2-invoking', 'mw3-invoking', 'execute']);
    });

    it('should call onFunctionInvoked in LIFO order', async () => {
      const order: string[] = [];

      const mw1: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw1-invoking');
        },
        async onFunctionInvoked() {
          order.push('mw1-invoked');
        },
      };

      const mw2: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw2-invoking');
        },
        async onFunctionInvoked() {
          order.push('mw2-invoked');
        },
      };

      const mw3: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw3-invoking');
        },
        async onFunctionInvoked() {
          order.push('mw3-invoked');
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw1, mw2, mw3]);
      const tool = createMockTool('test');

      await pipeline.execute(tool, { input: 'test' }, {}, async (context) => {
        order.push('execute');
        return await context.function.execute(context.arguments);
      });

      expect(order).toEqual([
        'mw1-invoking',
        'mw2-invoking',
        'mw3-invoking',
        'execute',
        'mw3-invoked',
        'mw2-invoked',
        'mw1-invoked',
      ]);
    });
  });

  describe('Context Modification', () => {
    it('should allow middleware to modify arguments', async () => {
      const mw: FunctionMiddlewareInterface = {
        async onFunctionInvoking(context) {
          context.arguments.input = 'modified';
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw]);
      const tool = createMockTool('test');

      const result = await pipeline.execute(tool, { input: 'original' }, {}, async (context) => {
        return { receivedArgs: context.arguments };
      });

      expect(result).toEqual({ receivedArgs: { input: 'modified' } });
    });

    it('should share metadata between middleware', async () => {
      const mw1: FunctionMiddlewareInterface = {
        async onFunctionInvoking(context) {
          context.metadata.value = 42;
        },
      };

      const mw2: FunctionMiddlewareInterface = {
        async onFunctionInvoking(context) {
          context.metadata.doubled = (context.metadata.value as number) * 2;
        },
      };

      let finalMetadata: Record<string, unknown> = {};

      const mw3: FunctionMiddlewareInterface = {
        async onFunctionInvoked(context) {
          finalMetadata = context.metadata;
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw1, mw2, mw3]);
      const tool = createMockTool('test');

      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'result');

      expect(finalMetadata).toEqual({ value: 42, doubled: 84 });
    });

    it('should allow middleware to observe and modify result', async () => {
      const mw: FunctionMiddlewareInterface = {
        async onFunctionInvoked(context) {
          if (typeof context.result === 'object' && context.result !== null) {
            (context.result as Record<string, unknown>).modified = true;
          }
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw]);
      const tool = createMockTool('test');

      const result = await pipeline.execute(tool, { input: 'test' }, {}, async () => ({ original: true }));

      expect(result).toEqual({ original: true, modified: true });
    });
  });

  describe('Early Termination', () => {
    it('should skip execution when middleware returns "skip"', async () => {
      let executed = false;

      const mw: FunctionMiddlewareInterface = {
        async onFunctionInvoking(context) {
          context.result = 'cached-result';
          return 'skip';
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw]);
      const tool = createMockTool('test');

      const result = await pipeline.execute(tool, { input: 'test' }, {}, async () => {
        executed = true;
        return 'should-not-execute';
      });

      expect(result).toBe('cached-result');
      expect(executed).toBe(false);
    });

    it('should still call onFunctionInvoked when skipping', async () => {
      let invokedCalled = false;

      const mw: FunctionMiddlewareInterface = {
        async onFunctionInvoking(context) {
          context.result = 'skipped';
          return 'skip';
        },
        async onFunctionInvoked() {
          invokedCalled = true;
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw]);
      const tool = createMockTool('test');

      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'never-called');

      expect(invokedCalled).toBe(true);
    });

    it('should skip if any middleware in chain returns "skip"', async () => {
      const order: string[] = [];

      const mw1: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw1');
        },
      };

      const mw2: FunctionMiddlewareInterface = {
        async onFunctionInvoking(context) {
          order.push('mw2-skip');
          context.result = 'skipped';
          return 'skip';
        },
      };

      const mw3: FunctionMiddlewareInterface = {
        async onFunctionInvoking() {
          order.push('mw3-should-not-be-called');
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw1, mw2, mw3]);
      const tool = createMockTool('test');

      const result = await pipeline.execute(tool, { input: 'test' }, {}, async () => {
        order.push('execute-should-not-be-called');
        return 'never';
      });

      expect(result).toBe('skipped');
      expect(order).toEqual(['mw1', 'mw2-skip']); // mw3 not called
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from function execution', async () => {
      const pipeline = new FunctionMiddlewarePipeline([]);
      const tool = createMockTool('test');

      await expect(
        pipeline.execute(tool, { input: 'test' }, {}, async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');
    });

    it('should pass error to onFunctionInvoked middleware', async () => {
      let capturedError: Error | undefined;

      const mw: FunctionMiddlewareInterface = {
        async onFunctionInvoked(context) {
          capturedError = context.error;
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw]);
      const tool = createMockTool('test');

      await expect(
        pipeline.execute(tool, { input: 'test' }, {}, async () => {
          throw new Error('Expected error');
        }),
      ).rejects.toThrow('Expected error');

      expect(capturedError).toBeDefined();
      expect(capturedError?.message).toBe('Expected error');
    });

    it('should call all onFunctionInvoked middleware even on error', async () => {
      const called: string[] = [];

      const mw1: FunctionMiddlewareInterface = {
        async onFunctionInvoked() {
          called.push('mw1');
        },
      };

      const mw2: FunctionMiddlewareInterface = {
        async onFunctionInvoked() {
          called.push('mw2');
        },
      };

      const pipeline = new FunctionMiddlewarePipeline([mw1, mw2]);
      const tool = createMockTool('test');

      await expect(
        pipeline.execute(tool, { input: 'test' }, {}, async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      expect(called).toEqual(['mw2', 'mw1']); // LIFO order
    });
  });

  describe('LoggingFunctionMiddleware', () => {
    it('should log function invocation', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const middleware = new LoggingFunctionMiddleware();
      const pipeline = new FunctionMiddlewarePipeline([middleware]);
      const tool = createMockTool('test-tool');

      await pipeline.execute(tool, { input: 'test-value' }, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      expect(consoleSpy).toHaveBeenCalledWith('Calling function: test-tool');
      expect(consoleSpy).toHaveBeenCalledWith('Arguments:', expect.stringContaining('test-value'));
      expect(consoleSpy).toHaveBeenCalledWith('Function test-tool succeeded');

      consoleSpy.mockRestore();
    });

    it('should log errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const middleware = new LoggingFunctionMiddleware();
      const pipeline = new FunctionMiddlewarePipeline([middleware]);
      const tool = createMockTool('test-tool');

      await expect(
        pipeline.execute(tool, { input: 'test' }, {}, async () => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Function test-tool failed:', 'Test error');

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('CachingFunctionMiddleware', () => {
    it('should cache function results', async () => {
      let executionCount = 0;

      const cache = new CachingFunctionMiddleware();
      const pipeline = new FunctionMiddlewarePipeline([cache]);
      const tool = createMockTool('test', async () => {
        executionCount++;
        return `result-${executionCount}`;
      });

      // First call - should execute
      const result1 = await pipeline.execute(tool, { input: 'test' }, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      expect(result1).toBe('result-1');
      expect(executionCount).toBe(1);

      // Second call with same args - should use cache
      const result2 = await pipeline.execute(tool, { input: 'test' }, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      expect(result2).toBe('result-1'); // Cached result
      expect(executionCount).toBe(1); // Not executed again
    });

    it('should cache different results for different arguments', async () => {
      let executionCount = 0;

      const cache = new CachingFunctionMiddleware();
      const pipeline = new FunctionMiddlewarePipeline([cache]);
      const tool = createMockTool('test', async (args: unknown) => {
        executionCount++;
        return `result-${JSON.stringify(args)}`;
      });

      const result1 = await pipeline.execute(tool, { input: 'a' }, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      const result2 = await pipeline.execute(tool, { input: 'b' }, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      expect(result1).not.toBe(result2);
      expect(executionCount).toBe(2);
    });

    it('should not cache errors', async () => {
      let executionCount = 0;

      const cache = new CachingFunctionMiddleware();
      const pipeline = new FunctionMiddlewarePipeline([cache]);
      const tool = createMockTool('test');

      // First call - throws error
      await expect(
        pipeline.execute(tool, { input: 'test' }, {}, async () => {
          executionCount++;
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      expect(executionCount).toBe(1);

      // Second call - should execute again (not cached)
      await expect(
        pipeline.execute(tool, { input: 'test' }, {}, async () => {
          executionCount++;
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');

      expect(executionCount).toBe(2); // Executed again
    });

    it('should support clear() method', async () => {
      const cache = new CachingFunctionMiddleware();
      const pipeline = new FunctionMiddlewarePipeline([cache]);
      const tool = createMockTool('test');
      let executionCount = 0;

      await pipeline.execute(tool, { input: 'test' }, {}, async () => {
        executionCount++;
        return 'result';
      });

      expect(cache.size).toBe(1);

      cache.clear();

      expect(cache.size).toBe(0);

      // Should execute again after clear
      await pipeline.execute(tool, { input: 'test' }, {}, async () => {
        executionCount++;
        return 'result';
      });

      expect(executionCount).toBe(2);
    });
  });

  describe('TimingFunctionMiddleware', () => {
    it('should measure execution time', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const timing = new TimingFunctionMiddleware();
      const pipeline = new FunctionMiddlewarePipeline([timing]);
      const tool = createMockTool('test');

      let metadata: Record<string, unknown> = {};

      const observer: FunctionMiddlewareInterface = {
        async onFunctionInvoked(context) {
          metadata = context.metadata;
        },
      };

      const pipelineWithObserver = new FunctionMiddlewarePipeline([timing, observer]);

      await pipelineWithObserver.execute(tool, { input: 'test' }, {}, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'result';
      });

      expect(metadata.duration).toBeDefined();
      expect(typeof metadata.duration).toBe('number');
      expect(metadata.duration).toBeGreaterThanOrEqual(50);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('took'));

      consoleSpy.mockRestore();
    });
  });

  describe('RateLimitingFunctionMiddleware', () => {
    it('should allow calls within rate limit', async () => {
      const rateLimiter = new RateLimitingFunctionMiddleware(3, 1000);
      const pipeline = new FunctionMiddlewarePipeline([rateLimiter]);
      const tool = createMockTool('test');

      // Should allow 3 calls
      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'result1');
      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'result2');
      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'result3');

      // 4th call should fail
      await expect(pipeline.execute(tool, { input: 'test' }, {}, async () => 'result4')).rejects.toThrow(
        /Rate limit exceeded/,
      );
    });

    it('should track different functions separately', async () => {
      const rateLimiter = new RateLimitingFunctionMiddleware(2, 1000);
      const pipeline = new FunctionMiddlewarePipeline([rateLimiter]);
      const tool1 = createMockTool('tool1');
      const tool2 = createMockTool('tool2');

      // Both tools should be able to make 2 calls
      await pipeline.execute(tool1, { input: 'test' }, {}, async () => 'result1');
      await pipeline.execute(tool1, { input: 'test' }, {}, async () => 'result2');

      await pipeline.execute(tool2, { input: 'test' }, {}, async () => 'result1');
      await pipeline.execute(tool2, { input: 'test' }, {}, async () => 'result2');

      // 3rd call to tool1 should fail
      await expect(pipeline.execute(tool1, { input: 'test' }, {}, async () => 'result3')).rejects.toThrow(
        /Rate limit exceeded/,
      );

      // 3rd call to tool2 should also fail
      await expect(pipeline.execute(tool2, { input: 'test' }, {}, async () => 'result3')).rejects.toThrow(
        /Rate limit exceeded/,
      );
    });

    it('should support clear() method', async () => {
      const rateLimiter = new RateLimitingFunctionMiddleware(2, 1000);
      const pipeline = new FunctionMiddlewarePipeline([rateLimiter]);
      const tool = createMockTool('test');

      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'result1');
      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'result2');

      // Should fail
      await expect(pipeline.execute(tool, { input: 'test' }, {}, async () => 'result3')).rejects.toThrow(
        /Rate limit exceeded/,
      );

      rateLimiter.clear();

      // Should succeed after clear
      await pipeline.execute(tool, { input: 'test' }, {}, async () => 'result3');
    });
  });

  describe('Multiple Middleware Composition', () => {
    it('should compose logging, timing, and caching', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      let executionCount = 0;

      const logging = new LoggingFunctionMiddleware();
      const timing = new TimingFunctionMiddleware();
      const caching = new CachingFunctionMiddleware();

      const pipeline = new FunctionMiddlewarePipeline([logging, timing, caching]);
      const tool = createMockTool('test', async () => {
        executionCount++;
        return 'result';
      });

      // First call
      await pipeline.execute(tool, { input: 'test' }, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      expect(executionCount).toBe(1);

      // Second call - should use cache
      await pipeline.execute(tool, { input: 'test' }, {}, async (context) => {
        return await context.function.execute(context.arguments);
      });

      expect(executionCount).toBe(1); // Cached

      // Verify logging was called for both
      expect(consoleSpy).toHaveBeenCalledWith('Calling function: test');
      expect(consoleSpy).toHaveBeenCalledWith('Function test succeeded');

      consoleSpy.mockRestore();
    });
  });
});
