/**
 * Tools module - AI function calling and tool execution.
 *
 * This module provides the core functionality for creating and managing AI tools
 * that can be invoked by LLMs. It includes:
 *
 * - AITool interface for defining tools
 * - BaseTool abstract class for implementing custom tools
 * - FunctionTool for wrapping functions as tools
 * - createTool helper for easy tool creation
 * - @aiFunction decorator for marking methods as AI functions
 * - Schema conversion utilities for LLM integration
 * - Tool execution engine for automatic function invocation
 * - useFunctionInvocation decorator for chat clients
 *
 * @module tools
 */

export { AITool, BaseTool, FunctionTool, createTool } from './base-tool.js';
export {
  aiFunction,
  getAIFunctionMetadata,
  isAIFunction,
  getAllAIFunctions,
  type AIFunctionConfig,
  type AIFunctionMetadata,
} from './decorators.js';
export {
  zodToJsonSchema,
  createToolSchema,
  type JsonSchema,
  type AIToolSchema,
} from './schema.js';
export { type MCPTool, isMCPTool } from './mcp-tool.js';
export {
  autoInvokeFunction,
  executeFunctionCalls,
  parseArguments,
  buildToolMap,
  extractFunctionCalls,
  extractFunctionResults,
} from './execution-engine.js';
export { useFunctionInvocation, DEFAULT_MAX_ITERATIONS } from './function-invoking-client.js';
