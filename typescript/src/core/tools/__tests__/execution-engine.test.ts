/**
 * Tests for Tool Execution Engine
 *
 * Comprehensive test coverage for function invocation, validation, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  autoInvokeFunction,
  executeFunctionCalls,
  parseArguments,
  buildToolMap,
  extractFunctionCalls,
  extractFunctionResults,
} from '../execution-engine';
import type { FunctionCallContent, FunctionResultContent, FunctionApprovalRequestContent } from '../../types/chat-message';
import type { AITool } from '../base-tool';

describe('Tool Execution Engine', () => {
  describe('parseArguments', () => {
    it('should parse valid JSON arguments', () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_func',
        arguments: '{"x": 5, "y": "hello"}',
      };

      const result = parseArguments(functionCall);
      expect(result).toEqual({ x: 5, y: 'hello' });
    });

    it('should throw error for invalid JSON', () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_func',
        arguments: 'invalid json',
      };

      expect(() => parseArguments(functionCall)).toThrow('Failed to parse function arguments');
    });
  });

  describe('buildToolMap', () => {
    it('should create map from tool array', () => {
      const tool1: AITool = {
        name: 'tool1',
        description: 'Test tool 1',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const tool2: AITool = {
        name: 'tool2',
        description: 'Test tool 2',
        schema: z.object({}),
        execute: vi.fn(),
      };

      const toolMap = buildToolMap([tool1, tool2]);

      expect(toolMap.size).toBe(2);
      expect(toolMap.get('tool1')).toBe(tool1);
      expect(toolMap.get('tool2')).toBe(tool2);
    });

    it('should handle empty array', () => {
      const toolMap = buildToolMap([]);
      expect(toolMap.size).toBe(0);
    });
  });

  describe('autoInvokeFunction', () => {
    let mockTool: AITool;
    let toolMap: Map<string, AITool>;

    beforeEach(() => {
      mockTool = {
        name: 'test_tool',
        description: 'A test tool',
        schema: z.object({
          x: z.number(),
          y: z.string().optional(),
        }),
        execute: vi.fn().mockResolvedValue({ result: 'success' }),
      };

      toolMap = buildToolMap([mockTool]);
    });

    it('should execute function with valid arguments', async () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": 5, "y": "hello"}',
      };

      const result = await autoInvokeFunction(functionCall, toolMap);

      expect(result.type).toBe('function_result');
      expect((result as FunctionResultContent).callId).toBe('call_123');
      expect((result as FunctionResultContent).result).toEqual({ result: 'success' });
      expect(mockTool.execute).toHaveBeenCalledWith({ x: 5, y: 'hello' });
    });

    it('should return error for missing tool', async () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'unknown_tool',
        arguments: '{}',
      };

      const result = await autoInvokeFunction(functionCall, toolMap);

      expect(result.type).toBe('function_result');
      expect((result as FunctionResultContent).callId).toBe('call_123');
      expect((result as FunctionResultContent).error?.message).toContain('unknown_tool');
    });

    it('should return error for validation failure', async () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": "not a number"}',
      };

      const result = await autoInvokeFunction(functionCall, toolMap);

      expect(result.type).toBe('function_result');
      expect((result as FunctionResultContent).callId).toBe('call_123');
      expect((result as FunctionResultContent).error).toBeDefined();
      expect((result as FunctionResultContent).result).toBeNull();
    });

    it('should return error for execution failure', async () => {
      mockTool.execute = vi.fn().mockRejectedValue(new Error('Execution failed'));

      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": 5}',
      };

      const result = await autoInvokeFunction(functionCall, toolMap);

      expect(result.type).toBe('function_result');
      expect((result as FunctionResultContent).callId).toBe('call_123');
      expect((result as FunctionResultContent).error?.message).toBe('Execution failed');
    });

    it('should merge custom arguments', async () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": 5}',
      };

      const customArgs = { y: 'custom' };

      await autoInvokeFunction(functionCall, toolMap, customArgs);

      expect(mockTool.execute).toHaveBeenCalledWith({ x: 5, y: 'custom' });
    });

    it('should prioritize parsed args over custom args', async () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": 10, "y": "parsed"}',
      };

      const customArgs = { x: 5, y: 'custom' };

      await autoInvokeFunction(functionCall, toolMap, customArgs);

      expect(mockTool.execute).toHaveBeenCalledWith({ x: 10, y: 'parsed' });
    });

    it('should return approval request for approval-required tool', async () => {
      mockTool.metadata = { approvalMode: 'always_require' };

      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": 5}',
      };

      const result = await autoInvokeFunction(functionCall, toolMap);

      expect(result.type).toBe('function_approval_request');
      expect((result as FunctionApprovalRequestContent).id).toBe('call_123');
      expect((result as FunctionApprovalRequestContent).functionCall).toBe(functionCall);
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('should handle approved function approval response', async () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": 5}',
      };

      const approvalResponse = {
        type: 'function_approval_response' as const,
        id: 'approval_123',
        approved: true,
        functionCall,
      };

      const result = await autoInvokeFunction(approvalResponse, toolMap);

      expect(result.type).toBe('function_result');
      expect((result as FunctionResultContent).callId).toBe('call_123');
      expect((result as FunctionResultContent).result).toEqual({ result: 'success' });
      expect(mockTool.execute).toHaveBeenCalled();
    });

    it('should handle rejected function approval response', async () => {
      const functionCall: FunctionCallContent = {
        type: 'function_call',
        callId: 'call_123',
        name: 'test_tool',
        arguments: '{"x": 5}',
      };

      const approvalResponse = {
        type: 'function_approval_response' as const,
        id: 'approval_123',
        approved: false,
        functionCall,
      };

      const result = await autoInvokeFunction(approvalResponse, toolMap);

      expect(result.type).toBe('function_result');
      expect((result as FunctionResultContent).callId).toBe('call_123');
      expect((result as FunctionResultContent).error?.message).toContain('rejected by user');
      expect(mockTool.execute).not.toHaveBeenCalled();
    });
  });

  describe('executeFunctionCalls', () => {
    let tool1: AITool;
    let tool2: AITool;

    beforeEach(() => {
      tool1 = {
        name: 'tool1',
        description: 'Tool 1',
        schema: z.object({ x: z.number() }),
        execute: vi.fn().mockResolvedValue({ result: 'tool1' }),
      };

      tool2 = {
        name: 'tool2',
        description: 'Tool 2',
        schema: z.object({ y: z.string() }),
        execute: vi.fn().mockResolvedValue({ result: 'tool2' }),
      };
    });

    it('should execute multiple function calls concurrently', async () => {
      const calls: FunctionCallContent[] = [
        {
          type: 'function_call',
          callId: 'call_1',
          name: 'tool1',
          arguments: '{"x": 5}',
        },
        {
          type: 'function_call',
          callId: 'call_2',
          name: 'tool2',
          arguments: '{"y": "hello"}',
        },
      ];

      const results = await executeFunctionCalls(calls, [tool1, tool2]);

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('function_result');
      expect(results[1].type).toBe('function_result');
      expect((results[0] as FunctionResultContent).result).toEqual({ result: 'tool1' });
      expect((results[1] as FunctionResultContent).result).toEqual({ result: 'tool2' });
      expect(tool1.execute).toHaveBeenCalledWith({ x: 5 });
      expect(tool2.execute).toHaveBeenCalledWith({ y: 'hello' });
    });

    it('should return approval requests for all calls if any require approval', async () => {
      tool1.metadata = { approvalMode: 'always_require' };

      const calls: FunctionCallContent[] = [
        {
          type: 'function_call',
          callId: 'call_1',
          name: 'tool1',
          arguments: '{"x": 5}',
        },
        {
          type: 'function_call',
          callId: 'call_2',
          name: 'tool2',
          arguments: '{"y": "hello"}',
        },
      ];

      const results = await executeFunctionCalls(calls, [tool1, tool2]);

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('function_approval_request');
      expect(results[1].type).toBe('function_approval_request');
      expect((results[0] as FunctionApprovalRequestContent).id).toBe('call_1');
      expect((results[1] as FunctionApprovalRequestContent).id).toBe('call_2');
      expect(tool1.execute).not.toHaveBeenCalled();
      expect(tool2.execute).not.toHaveBeenCalled();
    });

    it('should handle empty function calls array', async () => {
      const results = await executeFunctionCalls([], [tool1, tool2]);
      expect(results).toHaveLength(0);
    });

    it('should execute with custom args', async () => {
      const customArgTool: AITool = {
        name: 'custom_tool',
        description: 'Tool with custom args',
        schema: z.object({ x: z.number(), extra: z.string().optional() }),
        execute: vi.fn().mockResolvedValue({ result: 'custom success' }),
      };

      const calls: FunctionCallContent[] = [
        {
          type: 'function_call',
          callId: 'call_1',
          name: 'custom_tool',
          arguments: '{"x": 5}',
        },
      ];

      const customArgs = { extra: 'value' };

      await executeFunctionCalls(calls, [customArgTool], customArgs);

      expect(customArgTool.execute).toHaveBeenCalledWith({ x: 5, extra: 'value' });
    });
  });

  describe('extractFunctionCalls', () => {
    it('should extract function call contents from array', () => {
      const contents = [
        { type: 'text' as const, text: 'Hello' },
        { type: 'function_call' as const, callId: 'call_1', name: 'func1', arguments: '{}' },
        { type: 'function_call' as const, callId: 'call_2', name: 'func2', arguments: '{}' },
      ];

      const functionCalls = extractFunctionCalls(contents);

      expect(functionCalls).toHaveLength(2);
      expect(functionCalls[0].callId).toBe('call_1');
      expect(functionCalls[1].callId).toBe('call_2');
    });

    it('should extract function call from single content', () => {
      const content = { type: 'function_call' as const, callId: 'call_1', name: 'func1', arguments: '{}' };

      const functionCalls = extractFunctionCalls(content);

      expect(functionCalls).toHaveLength(1);
      expect(functionCalls[0].callId).toBe('call_1');
    });

    it('should return empty array for no function calls', () => {
      const contents = [
        { type: 'text' as const, text: 'Hello' },
        { type: 'image' as const, url: 'http://example.com/image.png' },
      ];

      const functionCalls = extractFunctionCalls(contents);

      expect(functionCalls).toHaveLength(0);
    });
  });

  describe('extractFunctionResults', () => {
    it('should extract function result contents from array', () => {
      const contents = [
        { type: 'text' as const, text: 'Hello' },
        { type: 'function_result' as const, callId: 'call_1', result: { a: 1 } },
        { type: 'function_result' as const, callId: 'call_2', result: { b: 2 } },
      ];

      const functionResults = extractFunctionResults(contents);

      expect(functionResults).toHaveLength(2);
      expect(functionResults[0].callId).toBe('call_1');
      expect(functionResults[1].callId).toBe('call_2');
    });

    it('should extract function result from single content', () => {
      const content = { type: 'function_result' as const, callId: 'call_1', result: { a: 1 } };

      const functionResults = extractFunctionResults(content);

      expect(functionResults).toHaveLength(1);
      expect(functionResults[0].callId).toBe('call_1');
    });

    it('should return empty array for no function results', () => {
      const contents = [
        { type: 'text' as const, text: 'Hello' },
        { type: 'function_call' as const, callId: 'call_1', name: 'func1', arguments: '{}' },
      ];

      const functionResults = extractFunctionResults(contents);

      expect(functionResults).toHaveLength(0);
    });
  });
});
